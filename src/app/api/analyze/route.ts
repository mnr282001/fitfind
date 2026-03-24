import { randomUUID } from "crypto";
import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/service";

const MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

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

  let body: { image?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const image = body.image;
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
  if (typeof image !== "string" || image.length === 0) {
    return Response.json({ error: "Missing image" }, { status: 400 });
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(image, "base64");
  } catch {
    return Response.json({ error: "Invalid image encoding" }, { status: 400 });
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

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  const cleaned = text.replace(/```json\n?|```/g, "").trim();

  try {
    const items = JSON.parse(cleaned);
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
