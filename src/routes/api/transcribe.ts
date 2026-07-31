import { createFileRoute } from "@tanstack/react-router";

/**
 * Speech-to-text endpoint.
 * The browser uploads a complete WAV recording; we forward it to the AI
 * transcription service server-side so the API key never reaches the client.
 */
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return Response.json({ error: "AI is not configured." }, { status: 500 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Expected an audio upload." }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: "No audio received." }, { status: 400 });
        }
        if (file.size < 2048) {
          return Response.json(
            { error: "That recording was too short — please try again." },
            { status: 400 },
          );
        }
        if (file.size > 20 * 1024 * 1024) {
          return Response.json({ error: "Recording is too large." }, { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-transcribe");
        upstream.append("file", file, "recording.wav");

        const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          console.error("[transcribe] failed", response.status, detail);
          const message =
            response.status === 429
              ? "Too many requests — please wait a moment and try again."
              : response.status === 402
                ? "AI credits exhausted. Add credits to continue."
                : "Could not transcribe that recording.";
          return Response.json({ error: message }, { status: response.status });
        }

        const result = (await response.json()) as { text?: string };
        return Response.json({ text: result.text ?? "" });
      },
    },
  },
});
