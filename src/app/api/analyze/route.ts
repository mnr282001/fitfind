import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/service";

const MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_BASE64_LENGTH = 20 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/avif",
]);
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

type AnalyzeBody = { image: string; mediaType: string };

function normalizeSimpleString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLen) return null;
  return normalized;
}

function parseAnalyzeBody(raw: unknown): { ok: true; value: AnalyzeBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }
  const body = raw as Record<string, unknown>;

  const image = normalizeSimpleString(body.image, MAX_BASE64_LENGTH);
  if (!image) {
    return { ok: false, error: "image must be a non-empty base64 string" };
  }
  if (!BASE64_RE.test(image)) {
    return { ok: false, error: "image must be valid base64 characters only" };
  }
  // Base64 length must be divisible by 4.
  if (image.length % 4 !== 0) {
    return { ok: false, error: "image has invalid base64 length" };
  }

  const mediaTypeInput = normalizeSimpleString(body.mediaType, 64) ?? "image/jpeg";
  const mediaType = mediaTypeInput.toLowerCase();
  if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
    return { ok: false, error: "mediaType is not supported" };
  }

  return { ok: true, value: { image, mediaType } };
}

function sanitizeModelItems(raw: unknown): Record<string, string>[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      category: typeof entry.category === "string" ? entry.category.trim().slice(0, 120) : "",
      description: typeof entry.description === "string" ? entry.description.trim().slice(0, 400) : "",
      brand_guess:
        typeof entry.brand_guess === "string" && entry.brand_guess.trim().length > 0
          ? entry.brand_guess.trim().slice(0, 120)
          : "Unknown",
      search_query: typeof entry.search_query === "string" ? entry.search_query.trim().slice(0, 300) : "",
      price_estimate: typeof entry.price_estimate === "string" ? entry.price_estimate.trim().slice(0, 80) : "",
    }))
    .filter((item) => item.category.length > 0 && item.search_query.length > 0);
}

function extForMediaType(mt: string): string {
  const m = mt.toLowerCase();
  if (m.includes("jpeg") || m === "image/jpg") return ".jpg";
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  return ".bin";
}

export async function POST(req: Request) {
  const started = Date.now();
  const { user, unauthorized } = await requireUser();
  if (!user) return unauthorized;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedBody = parseAnalyzeBody(rawBody);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: 400 });
  }
  const { image, mediaType } = parsedBody.value;

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(image, "base64");
  } catch {
    return Response.json({ error: "Invalid image encoding" }, { status: 400 });
  }
  // Invalid base64 can silently decode to empty/truncated buffers; reject if decoded bytes are empty.
  if (imageBuffer.length === 0) {
    return Response.json({ error: "Invalid image data" }, { status: 400 });
  }
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Image too large" }, { status: 413 });
  }

  const runId = randomUUID();
  let storagePath: string | null = null;
  const svc = createServiceClient();

  if (!svc) {
    console.warn(
      "[FitFind analyze] Persistence off: missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL — no Storage upload or DB rows. Add the service role key and run supabase/migrations/20250326120000_data_layer.sql."
    );
  }

  if (svc) {
    try {
      const objectPath = `${user.id}/${runId}${extForMediaType(mediaType)}`;
      const { error: upErr } = await svc.storage.from("uploads").upload(objectPath, imageBuffer, {
        contentType: mediaType,
        upsert: false,
      });
      if (upErr) {
        console.error("[FitFind analyze] storage upload failed:", upErr);
      } else {
        storagePath = objectPath;
      }
    } catch (e) {
      console.error("[FitFind analyze] storage error:", e);
    }
  }

  console.log(
    JSON.stringify({
      event: "analyze_request",
      userId: user.id,
      email: user.email,
      analysisRunId: runId,
      persist: Boolean(svc),
    })
  );

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: mediaType, data: image } },
              {
                text: `You are an expert fashion stylist. For each visible clothing item, accessory, and footwear, return a JSON array with objects containing:
- "category": garment type
- "description": specific details (color, fabric, silhouette, fit, logos)
- "brand_guess": brand if visible, otherwise "Unknown"
- "search_query": shopping search query to find this item
- "price_estimate": USD price range

Respond ONLY with valid JSON array. No markdown.`,
              },
            ],
          },
        ],
      }),
    }
  );

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    const err = await res.text();
    if (svc) {
      await svc.from("analysis_runs").insert({
        id: runId,
        user_id: user.id,
        storage_path: storagePath,
        media_type: mediaType,
        model: MODEL,
        status: "error",
        latency_ms: latencyMs,
        items: null,
        raw_error: err.slice(0, 8000),
      });
    }
    return Response.json({ error: "Gemini API error", detail: err }, { status: 502 });
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const cleaned = text.replace(/```json\n?|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as unknown;
    const items = sanitizeModelItems(parsed);
    if (svc) {
      await svc.from("analysis_runs").insert({
        id: runId,
        user_id: user.id,
        storage_path: storagePath,
        media_type: mediaType,
        model: MODEL,
        status: "ok",
        latency_ms: Date.now() - started,
        items,
        raw_error: null,
      });
    }
    return Response.json({
      items,
      analysisRunId: runId,
      imageStored: storagePath !== null,
    });
  } catch {
    if (svc) {
      await svc.from("analysis_runs").insert({
        id: runId,
        user_id: user.id,
        storage_path: storagePath,
        media_type: mediaType,
        model: MODEL,
        status: "error",
        latency_ms: Date.now() - started,
        items: null,
        raw_error: cleaned.slice(0, 8000),
      });
    }
    return Response.json({ error: "Failed to parse model response", raw: cleaned }, { status: 500 });
  }
}
