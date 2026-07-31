/**
 * Microphone capture that always produces a complete, decodable WAV file.
 * Avoids MediaRecorder fragment issues (and Safari's fragmented MP4) entirely.
 */
export interface Recorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
  getLevel: () => number;
}

export async function startRecording(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(analyser);
  source.connect(processor);
  processor.connect(ctx.destination);

  const levelData = new Uint8Array(analyser.frequencyBinCount);

  const teardown = () => {
    processor.onaudioprocess = null;
    try {
      processor.disconnect();
      analyser.disconnect();
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    getLevel() {
      analyser.getByteFrequencyData(levelData);
      let sum = 0;
      for (const v of levelData) sum += v;
      return sum / levelData.length / 255;
    },
    cancel() {
      teardown();
      void ctx.close();
    },
    async stop() {
      teardown();
      const sampleRate = ctx.sampleRate;
      await ctx.close();
      return encodeWav(chunks, sampleRate, 16000);
    },
  };
}

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const samples = targetRate < sampleRate ? downsample(merged, sampleRate, targetRate) : merged;
  const rate = targetRate < sampleRate ? targetRate : sampleRate;

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let pos = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function downsample(input: Float32Array, from: number, to: number) {
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

/** Uploads the recording to the server-side transcription endpoint. */
export async function speechToText(audio: Blob): Promise<string> {
  if (audio.size < 2048) {
    throw new Error("That recording was empty — please try again.");
  }
  const form = new FormData();
  form.append("file", audio, "recording.wav");

  const response = await fetch("/api/transcribe", { method: "POST", body: form });
  const payload = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Transcription failed.");
  return payload.text ?? "";
}
