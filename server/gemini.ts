import type { Express, Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";

const ALLOWED_CHAT_MODELS = new Set([
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
  "gemini-4-neon",
  "gemini-4-carbon",
]);

const PAID_ONLY_MODELS = new Set([
  "gemini-4-neon",
  "gemini-4-carbon",
  "gemini-nano-banana-2.1",
  "lyria-3-clip-preview",
  "lyria-3-pro-preview",
]);

const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"]);
const ALLOWED_IMAGE_SIZES = new Set(["1K", "2K", "4K"]);

const VANTS_COACH_SYSTEM_PROMPT = [
  "Eres VANTS Coach, analista táctico y estratega oficial de VANTS GAMES, plataforma de esports competitivos en Venezuela y Latinoamérica.",
  "Dominas los 11 juegos del circuito: VALORANT, Counter-Strike 2, League of Legends, Fortnite, EA Sports FC 27, Super Smash Bros. Ultimate, Call of Duty, Rocket League, Apex Legends, Tekken 8 y Clash Royale.",
  "Responde siempre en español claro, directo y accionable. Usa listas breves cuando des planes de entrenamiento, composiciones, economía o callouts.",
  "Nunca inventes resultados de partidos, coordenadas de lugares ni reseñas inexistentes. Si activan Google Search o Google Maps, apóyate estrictamente en los datos recuperados.",
].join("\n");

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "GEMINI_API_KEY no está configurada en el servidor. Agrégala en Settings > Secrets para activar VANTS AI Studio.",
    ) as Error & { status?: number };
    err.status = 503;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function mapGeminiError(error: any, model?: string): { status: number; message: string; code: string } {
  const raw = String(error?.message || error || "Error inesperado al consultar Gemini.");
  const statusFromErr = Number(error?.status || error?.statusCode || 0);
  const isPaidModel = model ? PAID_ONLY_MODELS.has(model) : false;

  if (/GEMINI_API_KEY/.test(raw)) {
    return { status: 503, message: raw, code: "missing_api_key" };
  }
  if (statusFromErr === 503 || /UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return {
      status: 503,
      code: "service_unavailable",
      message: `El modelo ${model || "Gemini"} tiene alta demanda temporal en este momento. Intenta de nuevo en unos segundos o selecciona gemini-3.1-flash-lite.`,
    };
  }
  if (statusFromErr === 429 || /RESOURCE_EXHAUSTED|429|quota/i.test(raw)) {
    return {
      status: 429,
      code: "quota_exceeded",
      message: isPaidModel
        ? `El modelo ${model} requiere una clave de API de Gemini con facturación activa o ha alcanzado su cuota. Puedes cambiar a gemini-4-hydrogen o configurar una clave con billing en Settings > Secrets.`
        : "Se alcanzó temporalmente el límite de cuota de Gemini. Intenta nuevamente en unos segundos o cambia a gemini-3.1-flash-lite.",
    };
  }
  if (statusFromErr === 403 || /PERMISSION_DENIED|403|API_KEY_INVALID|billing/i.test(raw)) {
    return {
      status: 403,
      code: "permission_denied",
      message: isPaidModel
        ? `Acceso denegado para ${model}. Este modelo requiere una clave de API de Gemini con facturación habilitada en Settings > Secrets.`
        : "La clave de API de Gemini no tiene permisos para este modelo o herramienta.",
    };
  }
  if (statusFromErr === 404 || /NOT_FOUND|404/i.test(raw)) {
    return {
      status: 404,
      code: "model_not_found",
      message: `El modelo solicitado (${model || "Gemini"}) no está disponible en esta cuenta o región.`,
    };
  }
  return {
    status: statusFromErr >= 400 && statusFromErr < 600 ? statusFromErr : 500,
    code: "gemini_error",
    message: raw.slice(0, 320),
  };
}

function isTransientUnavailable(err: any): boolean {
  const status = Number(err?.status || err?.statusCode || 0);
  const raw = String(err?.message || err || "");
  return status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(raw);
}

interface ChatTurn {
  role: "user" | "model";
  text: string;
}

interface GroundingSource {
  type: "web" | "maps";
  title: string;
  uri: string;
  snippets?: string[];
}

function extractGroundingSources(response: any): { sources: GroundingSource[]; searchQueries: string[] } {
  const metadata = response?.candidates?.[0]?.groundingMetadata;
  if (!metadata) return { sources: [], searchQueries: [] };

  const sources: GroundingSource[] = [];
  const seen = new Set<string>();
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];

  for (const chunk of chunks) {
    if (chunk?.web?.uri) {
      const uri = String(chunk.web.uri);
      if (!seen.has(uri)) {
        seen.add(uri);
        sources.push({
          type: "web",
          title: String(chunk.web.title || uri),
          uri,
        });
      }
    }
    if (chunk?.maps?.uri) {
      const uri = String(chunk.maps.uri);
      const snippets: string[] = [];
      const reviewSnippets = chunk?.maps?.placeAnswerSources?.reviewSnippets;
      if (Array.isArray(reviewSnippets)) {
        for (const r of reviewSnippets) {
          if (typeof r?.content === "string" && r.content.trim()) {
            snippets.push(r.content.trim());
          } else if (typeof r?.text === "string" && r.text.trim()) {
            snippets.push(r.text.trim());
          }
        }
      }
      if (!seen.has(uri)) {
        seen.add(uri);
        sources.push({
          type: "maps",
          title: String(chunk.maps.title || "Ubicación en Google Maps"),
          uri,
          snippets: snippets.length ? snippets.slice(0, 3) : undefined,
        });
      }
    }
  }

  const searchQueries = Array.isArray(metadata.webSearchQueries)
    ? metadata.webSearchQueries.filter((q: unknown): q is string => typeof q === "string")
    : [];

  return { sources, searchQueries };
}

export function registerGeminiRoutes(app: Express) {
  /** Estado rápido de disponibilidad sin exponer ninguna clave */
  app.get("/api/ai/status", (_req: Request, res: Response) => {
    res.json({
      configured: Boolean(process.env.GEMINI_API_KEY),
      defaultModel: "gemini-4-hydrogen",
      models: [
        { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", tier: "general", grounding: true },
        { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", tier: "fast", grounding: false },
        { id: "gemini-4-neon", label: "Gemini 4 Neon", tier: "paid", grounding: true },
        { id: "gemini-4-carbon", label: "Gemini 4 Carbon", tier: "paid", grounding: true },
      ],
    });
  });

  /** Chat multi-turno + Google Search Grounding + Google Maps Grounding */
  app.post("/api/ai/chat", async (req: Request, res: Response) => {
    const mode = req.body?.mode === "search" || req.body?.mode === "maps" ? req.body.mode : "coach";
    const requestedModel = typeof req.body?.model === "string" ? req.body.model.trim() : "gemini-4-hydrogen";
    // Para Google Search y Google Maps Grounding priorizamos gemini-4-hydrogen si el usuario tenía flash-lite
    const model =
      (mode === "search" || mode === "maps") && requestedModel === "gemini-3.1-flash-lite"
        ? "gemini-4-hydrogen"
        : ALLOWED_CHAT_MODELS.has(requestedModel)
          ? requestedModel
          : "gemini-4-hydrogen";

    try {
      const message = String(req.body?.message || "").trim();
      if (!message || message.length > 4000) {
        return res.status(400).json({ error: "Escribe una consulta válida (1 a 4000 caracteres)." });
      }

      const rawHistory: unknown[] = Array.isArray(req.body?.history) ? req.body.history : [];
      const history: ChatTurn[] = rawHistory
        .slice(-16)
        .filter(
          (item: any): item is ChatTurn =>
            item &&
            (item.role === "user" || item.role === "model") &&
            typeof item.text === "string" &&
            item.text.trim().length > 0,
        )
        .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 3000) }));

      const contents = [
        ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        { role: "user" as const, parts: [{ text: message }] },
      ];

      const config: Record<string, any> = {
        systemInstruction: VANTS_COACH_SYSTEM_PROMPT,
      };

      // Nunca combinar googleSearch y googleMaps en la misma llamada; nunca añadir responseMimeType con googleMaps.
      if (mode === "search") {
        config.tools = [{ googleSearch: {} }];
      } else if (mode === "maps") {
        config.tools = [{ googleMaps: {} }];
        const lat = Number(req.body?.location?.latitude);
        const lng = Number(req.body?.location?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          config.toolConfig = {
            retrievalConfig: {
              latLng: { latitude: lat, longitude: lng },
            },
          };
        }
      }

      const ai = getGeminiClient();
      let activeModel = model;
      let response: any;
      try {
        response = await ai.models.generateContent({
          model: activeModel,
          contents,
          config,
        });
      } catch (firstErr: any) {
        if (!isTransientUnavailable(firstErr)) throw firstErr;
        await new Promise((r) => setTimeout(r, 600));
        try {
          response = await ai.models.generateContent({
            model: activeModel,
            contents,
            config,
          });
        } catch (secondErr: any) {
          if (mode === "coach" && activeModel !== "gemini-3.1-flash-lite" && isTransientUnavailable(secondErr)) {
            activeModel = "gemini-3.1-flash-lite";
            response = await ai.models.generateContent({
              model: activeModel,
              contents,
              config,
            });
          } else {
            throw secondErr;
          }
        }
      }

      const replyText = (response.text || "").trim();
      const { sources, searchQueries } = extractGroundingSources(response);

      return res.json({
        model: activeModel,
        mode,
        reply: replyText || "No se generó contenido textual para esta consulta.",
        sources,
        searchQueries,
      });
    } catch (error: any) {
      const mapped = mapGeminiError(error, model);
      console.error("[/api/ai/chat]", mapped.status, mapped.code, error?.message || error);
      return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  /** Transcripción de audio desde micrófono o archivo con gemini-3.5-transcribe */
  app.post("/api/ai/transcribe", async (req: Request, res: Response) => {
    const model = "gemini-3.5-transcribe";
    try {
      const audioBase64 = typeof req.body?.audioBase64 === "string" ? req.body.audioBase64.trim() : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "audio/webm";
      const customPrompt =
        typeof req.body?.prompt === "string" && req.body.prompt.trim()
          ? req.body.prompt.trim().slice(0, 400)
          : "Transcribe con precisión este audio en español manteniendo términos de esports (callouts, mapas, agentes, armas, torneos).";

      if (!audioBase64 || audioBase64.length < 32) {
        return res.status(400).json({ error: "No se recibió un archivo de audio válido para transcribir." });
      }
      if (!/^audio\/[a-z0-9.+-]+$/i.test(mimeType)) {
        return res.status(400).json({ error: "Formato de audio no compatible." });
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: customPrompt },
              {
                inlineData: {
                  mimeType,
                  data: audioBase64,
                },
              },
            ],
          },
        ],
      });

      const transcript = (response.text || "").trim();
      return res.json({
        model,
        transcript: transcript || "(No se detectó voz reconocible en la grabación.)",
      });
    } catch (error: any) {
      const mapped = mapGeminiError(error, model);
      console.error("[/api/ai/transcribe]", mapped.status, mapped.code, error?.message || error);
      return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  /** Generación y edición de imágenes con gemini-nano-banana-2.1 */
  app.post("/api/ai/image", async (req: Request, res: Response) => {
    const model = "gemini-nano-banana-2.1";
    try {
      const prompt = String(req.body?.prompt || "").trim();
      const aspectRatio = ALLOWED_ASPECT_RATIOS.has(req.body?.aspectRatio) ? req.body.aspectRatio : "16:9";
      const imageSize = ALLOWED_IMAGE_SIZES.has(req.body?.imageSize) ? req.body.imageSize : "1K";
      const sourceImageBase64 =
        typeof req.body?.sourceImageBase64 === "string" && req.body.sourceImageBase64.trim()
          ? req.body.sourceImageBase64.trim()
          : null;
      const sourceMimeType =
        typeof req.body?.sourceMimeType === "string" && /^image\/(png|jpeg|webp)$/i.test(req.body.sourceMimeType)
          ? req.body.sourceMimeType
          : "image/png";

      if (!prompt || prompt.length > 2000) {
        return res.status(400).json({ error: "Describe la imagen o edición que deseas generar (1 a 2000 caracteres)." });
      }

      const parts: any[] = [];
      if (sourceImageBase64) {
        parts.push({
          inlineData: {
            mimeType: sourceMimeType,
            data: sourceImageBase64,
          },
        });
      }
      parts.push({ text: prompt });

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });

      let imageDataUrl: string | null = null;
      const textNotes: string[] = [];
      const responseParts = response.candidates?.[0]?.content?.parts || [];
      for (const part of responseParts) {
        if ((part as any).inlineData?.data) {
          const mime = (part as any).inlineData.mimeType || "image/png";
          imageDataUrl = `data:${mime};base64,${(part as any).inlineData.data}`;
        } else if (typeof (part as any).text === "string" && (part as any).text.trim()) {
          textNotes.push((part as any).text.trim());
        }
      }

      if (!imageDataUrl) {
        return res.status(422).json({
          error: textNotes.join(" ") || "El modelo no devolvió una imagen para este prompt. Intenta reformularlo.",
        });
      }

      return res.json({
        model,
        aspectRatio,
        imageSize,
        imageDataUrl,
        text: textNotes.join("\n"),
      });
    } catch (error: any) {
      const mapped = mapGeminiError(error, model);
      console.error("[/api/ai/image]", mapped.status, mapped.code, error?.message || error);
      return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });

  /** Generación de música para intros de torneo con Lyria 3 (clip 30s o pro) */
  app.post("/api/ai/music", async (req: Request, res: Response) => {
    const mode = req.body?.mode === "pro" ? "pro" : "clip";
    const model = mode === "pro" ? "lyria-3-pro-preview" : "lyria-3-clip-preview";

    try {
      const prompt = String(req.body?.prompt || "").trim();
      if (!prompt || prompt.length > 1500) {
        return res.status(400).json({ error: "Describe el estilo, BPM e instrumentos del track (1 a 1500 caracteres)." });
      }

      const ai = getGeminiClient();
      // Lyria 3 requiere generateContentStream y NO debe incluir responseModalities
      const stream = await ai.models.generateContentStream({
        model,
        contents: prompt,
      });

      const audioChunks: Buffer[] = [];
      let audioMime = "audio/mpeg";
      let lyrics = "";

      for await (const chunk of stream) {
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if ((part as any).inlineData?.data) {
            if ((part as any).inlineData.mimeType) {
              audioMime = (part as any).inlineData.mimeType;
            }
            audioChunks.push(Buffer.from((part as any).inlineData.data, "base64"));
          } else if (typeof (part as any).text === "string") {
            lyrics += (part as any).text;
          }
        }
      }

      if (audioChunks.length === 0) {
        return res.status(422).json({
          error: "Lyria no devolvió audio para esta solicitud. Intenta describir género, tempo y energía sin mencionar artistas específicos.",
        });
      }

      const audioBuffer = Buffer.concat(audioChunks);
      return res.json({
        model,
        mode,
        audioDataUrl: `data:${audioMime};base64,${audioBuffer.toString("base64")}`,
        lyrics: lyrics.trim(),
      });
    } catch (error: any) {
      const mapped = mapGeminiError(error, model);
      console.error("[/api/ai/music]", mapped.status, mapped.code, error?.message || error);
      return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    }
  });
}
