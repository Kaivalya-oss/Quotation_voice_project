import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { createAiGateway, requireApiKey } from "./ai-gateway.server";

const ExtractionSchema = z.object({
  customerName: z.string().nullable(),
  phone: z.string().nullable(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  variant: z.string().nullable(),
  color: z.string().nullable(),
  accessories: z.array(z.string()),
  budget: z.number().nullable(),
  downPayment: z.number().nullable(),
  loanTenureMonths: z.number().nullable(),
  mileagePreference: z.number().nullable(),
  occupation: z.string().nullable(),
  monthlyIncome: z.number().nullable(),
  city: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ExtractedQuotationData = z.infer<typeof ExtractionSchema>;

const EMPTY: ExtractedQuotationData = {
  customerName: null,
  phone: null,
  brand: null,
  model: null,
  variant: null,
  color: null,
  accessories: [],
  budget: null,
  downPayment: null,
  loanTenureMonths: null,
  mileagePreference: null,
  occupation: null,
  monthlyIncome: null,
  city: null,
  notes: null,
};

const SYSTEM_PROMPT = `You extract structured sales data from a two-wheeler dealership sales executive's spoken note.
The speech is Indian English, often mixed with Hindi/Marathi words, and numbers may be spelled out
("nine eight two zero zero" = 9820 0..., "forty two thousand" = 42000, "one lakh" = 100000,
"eighty five thousand" = 85000). Convert all money values to plain rupee numbers.
Return only what was actually said — use null for anything not mentioned.
Phone numbers must be exactly 10 digits with no country code or spaces.
Accessories should be short item names such as "Helmet", "Leg Guard", "Seat Cover".
Loan tenure must be expressed in months (3 years = 36).`;

/**
 * AI extraction service: transcript -> structured customer/vehicle/finance data.
 */
export const extractCustomerData = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ transcript: z.string().min(3).max(8000) }).parse(input),
  )
  .handler(async ({ data }): Promise<ExtractedQuotationData> => {
    const gateway = createAiGateway(requireApiKey());

    try {
      const { output } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        output: Output.object({ schema: ExtractionSchema }),
        system: SYSTEM_PROMPT,
        prompt: `Sales note transcript:\n"""${data.transcript}"""`,
      });
      return normalize(output);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const fallback = safeParse(error.text);
        return fallback ? normalize(fallback) : EMPTY;
      }
      const message = error instanceof Error ? error.message : "AI extraction failed";
      console.error("[extractCustomerData]", message);
      throw new Error(
        message.includes("429")
          ? "Too many AI requests right now — try again in a moment."
          : message.includes("402")
            ? "AI credits exhausted. Add credits to continue."
            : "Could not extract details from that recording.",
      );
    }
  });

function safeParse(text: string | undefined): Partial<ExtractedQuotationData> | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Partial<ExtractedQuotationData>;
  } catch {
    return null;
  }
}

function normalize(raw: Partial<ExtractedQuotationData>): ExtractedQuotationData {
  const digits = (raw.phone ?? "").replace(/\D/g, "");
  const phone = digits.length >= 10 ? digits.slice(-10) : null;
  return {
    ...EMPTY,
    ...raw,
    phone,
    accessories: Array.isArray(raw.accessories) ? raw.accessories.slice(0, 12) : [],
    budget: clampMoney(raw.budget),
    downPayment: clampMoney(raw.downPayment),
    monthlyIncome: clampMoney(raw.monthlyIncome),
    loanTenureMonths:
      raw.loanTenureMonths && raw.loanTenureMonths > 0
        ? Math.min(84, Math.round(raw.loanTenureMonths))
        : null,
    mileagePreference:
      raw.mileagePreference && raw.mileagePreference > 0
        ? Math.min(200, Math.round(raw.mileagePreference))
        : null,
  };
}

function clampMoney(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(100000000, Math.round(value));
}
