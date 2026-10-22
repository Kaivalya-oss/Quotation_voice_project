/**
 * Turns one spoken customer description into intake form fields.
 *
 * Labelled speech works in any order:
 *   "name Rahul Sharma, phone 98765 43210, address 12 MG Road Andheri, city Mumbai,
 *    email rahul at gmail dot com"
 * Unlabelled speech falls back to: <name> <phone> [from|in|at <city>].
 * Spoken digits ("nine eight seven …", "double five") are converted to numbers.
 * The salesperson always reviews the result before continuing.
 */
export interface VoiceIntakeFields {
  full_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  email?: string;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", two: "2", to: "2", too: "2", three: "3", four: "4", for: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};

/** "nine eight double seven" -> "9877"; leaves other words untouched. */
function spokenDigitsToNumbers(text: string): string {
  const tokens = text.split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    // Only treat a run as a number when it is long enough to be part of a phone number,
    // so ordinary words like "to" or "for" in an address are kept.
    if (run.join("").length >= 3) out.push(run.join(""));
    else out.push(...run.map((d, i) => runWords[i] ?? d));
    run = [];
    runWords = [];
  };
  let runWords: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i] ?? "";
    const w = raw.toLowerCase().replace(/[.,]/g, "");
    const next = (tokens[i + 1] ?? "").toLowerCase().replace(/[.,]/g, "");
    if ((w === "double" || w === "triple") && DIGIT_WORDS[next]) {
      const d = DIGIT_WORDS[next] as string;
      run.push(w === "double" ? d + d : d + d + d);
      runWords.push(`${raw} ${tokens[i + 1]}`);
      i++;
    } else if (DIGIT_WORDS[w] !== undefined || /^\d+$/.test(w)) {
      run.push(DIGIT_WORDS[w] ?? w);
      runWords.push(raw);
    } else {
      if (run.length) flush();
      out.push(raw);
    }
  }
  if (run.length) flush();
  return out.join(" ");
}

/** "rahul dot sharma at gmail dot com" -> "rahul.sharma@gmail.com" */
function spokenEmail(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+(at the rate|at)\s+/g, "@")
    .replace(/\s+(dot)\s+/g, ".")
    .replace(/\s+(underscore)\s+/g, "_")
    .replace(/\s+/g, "")
    .replace(/[,;]$/, "");
}

const LABELS: { field: keyof VoiceIntakeFields; re: RegExp }[] = [
  { field: "full_name", re: /\b(?:my name is|name is|customer name|name)\b/i },
  { field: "phone", re: /\b(?:phone number|mobile number|contact number|phone|mobile|number)\b/i },
  { field: "address", re: /\b(?:address is|address|lives at|staying at|residing at)\b/i },
  { field: "city", re: /\b(?:city is|city)\b/i },
  { field: "email", re: /\b(?:email id|email address|email is|email|e-mail|mail id)\b/i },
];

function clean(value: string): string {
  return value.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").replace(/\s{2,}/g, " ");
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseVoiceIntake(transcript: string): VoiceIntakeFields {
  const text = spokenDigitsToNumbers(transcript.trim());
  const result: VoiceIntakeFields = {};

  // 1. Labelled segments, in whatever order they were spoken
  const hits: { field: keyof VoiceIntakeFields; start: number; end: number }[] = [];
  for (const { field, re } of LABELS) {
    const m = re.exec(text);
    if (m && m.index !== undefined) hits.push({ field, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);
  // drop overlapping hits (e.g. "phone number" also matching "number")
  const labelled = hits.filter((h, i) => i === 0 || h.start >= (hits[i - 1]?.end ?? 0));
  if (labelled.length) {
    labelled.forEach((h, i) => {
      const value = clean(text.slice(h.end, labelled[i + 1]?.start ?? text.length));
      if (value) result[h.field] = value;
    });
    // anything said before the first label is treated as the name when no name label was used
    const lead = clean(text.slice(0, labelled[0]?.start ?? 0));
    if (lead && !result.full_name) result.full_name = lead;
  } else {
    // 2. Unlabelled fallback: <name> <phone> [from|in|at <city>]
    const m = text.match(/(?:\+?91[\s-]?)?(\d[\d\s-]{8,}\d)/);
    if (m && m.index !== undefined) {
      result.full_name = clean(text.slice(0, m.index));
      if (m[1]) result.phone = m[1];
      const rest = clean(text.slice(m.index + m[0].length));
      const city = rest.match(/\b(?:from|in|at)\s+(.+)$/i);
      if (city?.[1]) result.city = clean(city[1]);
      else if (rest) result.address = rest;
    } else {
      result.full_name = clean(text);
    }
  }

  // 3. Normalise each field
  if (result.phone) {
    const digits = result.phone.replace(/\D/g, "");
    result.phone = digits.length >= 10 ? digits.slice(-10) : digits;
    if (!result.phone) delete result.phone;
  }
  if (result.email) result.email = spokenEmail(result.email);
  if (result.full_name) result.full_name = titleCase(result.full_name.replace(/^(is|my)\s+/i, ""));
  if (result.city) result.city = titleCase(result.city.replace(/^is\s+/i, ""));
  if (result.address) result.address = result.address.replace(/^is\s+/i, "");
  return result;
}
