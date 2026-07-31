import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Server-only Lovable AI Gateway provider.
 * The API key never leaves the server.
 */
export function createAiGateway(lovableApiKey: string, options?: { structuredOutputs?: boolean }) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

export function requireApiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this project.");
  return key;
}
