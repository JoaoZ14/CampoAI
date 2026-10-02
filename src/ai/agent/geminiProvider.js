import { FunctionCallingMode, GoogleGenerativeAI } from "@google/generative-ai";
import { fetchMediaAsInlineData } from "../../services/aiService.js";
// Restrict JSON Schema to the schema subset supported by the installed SDK.
export function geminiSchema(schema) {
  const out = { type: schema.type };
  if (schema.nullable) out.nullable = true;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties)
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, geminiSchema(v)]),
    );
  if (schema.required?.length) out.required = schema.required;
  if (schema.items) out.items = geminiSchema(schema.items);
  return out;
}
function retryableProviderError(error) {
  return [404, 429, 500, 502, 503, 504].includes(Number(error.status)) ||
    error.name === "AbortError" ||
    /timed? out|timeout|aborted/i.test(String(error.message || ""));
}
export class GeminiAgentProvider {
  constructor() {
    if (!process.env.GEMINI_API_KEY) throw new Error("Gemini indisponível.");
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  async inputParts({ text, imageUrl, audioUrl }) {
    const parts = [
      {
        text:
          text ||
          "Interprete a mídia do produtor e responda conforme a intenção.",
      },
    ];
    for (const [url, kind] of [
      [imageUrl, "image"],
      [audioUrl, "audio"],
    ])
      if (url) {
        const u = new URL(url);
        // Operational path only accepts actual Twilio media; prevents arbitrary URL / SSRF.
        if (
          u.protocol !== "https:" ||
          u.hostname !== "api.twilio.com" ||
          !u.pathname.includes("/Messages/")
        )
          throw new Error("Origem de mídia inválida.");
        const inlineData = await fetchMediaAsInlineData(url, kind);
        if (inlineData.data.length > 20 * 1024 * 1024)
          throw new Error("Mídia muito grande.");
        parts.push({ inlineData });
      }
    return parts;
  }
  async turn({ system, contents, tools, toolMode = "AUTO", timeoutMs = 60000 }) {
    const primary =
      process.env.GEMINI_AGENT_MODEL ||
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash";
    const fallbacks = [
      process.env.GEMINI_AGENT_FALLBACK,
      process.env.GEMINI_MODEL_FALLBACK,
      process.env.GEMINI_AUTO_FALLBACK_MODEL,
      "gemini-2.5-flash",
    ].filter(Boolean);
    // A tool conversation must remain on the model that produced its native parts/signatures.
    const models = this.lockedModel
      ? [this.lockedModel]
      : [
          ...new Set([
            primary,
            ...(process.env.GEMINI_DISABLE_AUTO_FALLBACK === "true"
              ? []
              : fallbacks),
          ]),
        ];
    models.sort((a, b) =>
      a === this.lastSuccessfulModel
        ? -1
        : b === this.lastSuccessfulModel
          ? 1
          : 0,
    );
    const deadline = Date.now() + timeoutMs;
    let lastError;
    for (const [index, modelName] of models.entries()) {
      if (Date.now() >= deadline) break;
      try {
        const remainingMs = deadline - Date.now();
        const attemptMs = Math.max(1, Math.floor(remainingMs / (models.length - index)));
        const response = await this.generate({
          system,
          contents,
          tools,
          toolMode,
          modelName,
          timeoutMs: attemptMs,
        });
        this.lastSuccessfulModel = modelName;
        if (response.calls.length) this.lockedModel = modelName;
        return response;
      } catch (error) {
        lastError = error;
        if (!retryableProviderError(error))
          throw error;
        console.warn(
          JSON.stringify({
            event: "agent_provider_unavailable",
            model: modelName,
            status: Number(error.status),
          }),
        );
      }
    }
    throw lastError || new Error("Tempo de resposta do provider excedido.");
  }
  async generate({ system, contents, tools, toolMode, modelName, timeoutMs }) {
    const model = this.client.getGenerativeModel({
      model: modelName,
      systemInstruction: system,
      tools: [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            ...(Object.keys(t.parameters.properties || {}).length
              ? { parameters: geminiSchema(t.parameters) }
              : {}),
          })),
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: toolMode === "ANY" ? FunctionCallingMode.ANY : FunctionCallingMode.AUTO,
        },
      },
    });
    const result = await model.generateContent(
      {
        contents,
        generationConfig: { temperature: 0.15, maxOutputTokens: 4096 },
      },
      { timeout: timeoutMs },
    );
    return {
      calls: result.response.functionCalls() || [],
      text: result.response.text(),
      content: result.response.candidates?.[0]?.content,
    };
  }
}
