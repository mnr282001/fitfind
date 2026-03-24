import { requireUser } from "@/lib/auth/require-user";
import { buildAffiliateUrl } from "@/lib/affiliate";
import { createServiceClient } from "@/lib/supabase/service";

// ─── PARTNER PRIORITY CONFIG ──────────────────────────────────────────────────
// Set to [] to disable all partnerships (no priority boosting).
// Matched against the `source` (retailer name) field, case-insensitive.
const PARTNER_TIERS: { names: string[]; tier: number }[] = [
  // Tier 1 — highest priority (testing only, no real partnership)
  // { names: ["zara", "uniqlo", "h&m"], tier: 2 },
  // // Tier 2 — secondary priority (testing only, no real partnership)
  // { names: ["alfani", "banana republic"], tier: 1 },
];
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED = ["collectivevoice.com", "shopstyle.com", "shareasale.com"];

// Minimum score to show a specific product. Below this, fall back to "similar items" only.
// Score breakdown: partner tier ×10, has price +3, has thumbnail +1.
// A score of 3 means: non-partner with a price. Raise to require partner matches.
const MIN_SCORE = 3;

interface SerpMatch {
  product_link?: string;
  title?: string;
  source?: string;
  price?: string;
  thumbnail?: string;
}

const MAX_SEARCH_QUERY_LENGTH = 300;
const MAX_BRAND_GUESS_LENGTH = 120;
const MAX_CATEGORY_LENGTH = 80;
const UUID_V4_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchBody = {
  searchQuery: string;
  brandGuess: string;
  category: string | null;
  analysisRunId: string | null;
};

function normalizeInputString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length > maxLen) return null;
  return normalized;
}

function parseSearchBody(raw: unknown): { ok: true; value: SearchBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;
  const searchQuery = normalizeInputString(body.searchQuery, MAX_SEARCH_QUERY_LENGTH);
  if (searchQuery === null || searchQuery.length === 0) {
    return { ok: false, error: "searchQuery must be a non-empty string up to 300 chars" };
  }

  const brandGuessNorm = normalizeInputString(body.brandGuess, MAX_BRAND_GUESS_LENGTH);
  const brandGuess = brandGuessNorm ?? "";

  const categoryNorm = normalizeInputString(body.category, MAX_CATEGORY_LENGTH);
  if (body.category !== undefined && categoryNorm === null) {
    return { ok: false, error: "category must be a string up to 80 chars" };
  }
  const category = categoryNorm && categoryNorm.length > 0 ? categoryNorm : null;

  const analysisRunIdNorm = normalizeInputString(body.analysisRunId, 64);
  if (body.analysisRunId !== undefined) {
    if (analysisRunIdNorm === null || analysisRunIdNorm.length === 0 || !UUID_V4_LIKE_RE.test(analysisRunIdNorm)) {
      return { ok: false, error: "analysisRunId must be a valid UUID string" };
    }
  }

  return {
    ok: true,
    value: {
      searchQuery,
      brandGuess,
      category,
      analysisRunId: analysisRunIdNorm && analysisRunIdNorm.length > 0 ? analysisRunIdNorm : null,
    },
  };
}

function parseSerpMatches(raw: unknown): SerpMatch[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => ({
      product_link: typeof entry.product_link === "string" ? entry.product_link : undefined,
      title: typeof entry.title === "string" ? entry.title : undefined,
      source: typeof entry.source === "string" ? entry.source : undefined,
      price: typeof entry.price === "string" ? entry.price : undefined,
      thumbnail: typeof entry.thumbnail === "string" ? entry.thumbnail : undefined,
    }));
}

function getPartnerTier(source: string): number {
  const s = source.toLowerCase();
  for (const { names, tier } of PARTNER_TIERS) {
    if (names.some((n) => s.includes(n))) return tier;
  }
  return 0;
}

function scoreMatch(m: SerpMatch): number {
  if (!m.product_link) return -1;
  try {
    const host = new URL(m.product_link).hostname.toLowerCase();
    if (BLOCKED.some((b) => host.includes(b))) return -1;
  } catch {
    return -1;
  }

  let score = getPartnerTier(m.source ?? "") * 10;
  if (m.price) score += 3;
  if (m.thumbnail) score += 1;
  return score;
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const { user, unauthorized } = await requireUser();
  if (!user) return unauthorized;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsedBody = parseSearchBody(rawBody);
  if (!parsedBody.ok) {
    return Response.json({ error: parsedBody.error }, { status: 400 });
  }
  const { searchQuery, brandGuess, category, analysisRunId: analysisRunIdIn } = parsedBody.value;

  console.log(
    JSON.stringify({
      event: "search_request",
      userId: user.id,
      email: user.email,
      query: searchQuery,
    })
  );

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: searchQuery,
    api_key: process.env.SERPAPI_KEY || "",
    hl: "en",
    gl: "us",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let serpStatus: "ok" | "error" = "ok";
  let rawError: string | null = null;
  let data: Record<string, unknown> = {};

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal });
    data = await res.json();
    if (!res.ok) {
      serpStatus = "error";
      rawError = JSON.stringify(data).slice(0, 4000);
    }
  } catch (err) {
    serpStatus = "error";
    rawError = err instanceof Error ? err.message : String(err);
    console.error("[FitFind search] fetch failed:", err);
  } finally {
    clearTimeout(timeout);
  }

  const matches = parseSerpMatches((data as { shopping_results?: unknown }).shopping_results);

  const scored = matches
    .map((m) => ({ m, score: scoreMatch(m) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  let responseBody: Record<string, unknown>;

  if (best && best.score >= MIN_SCORE) {
    const top = best.m;
    responseBody = {
      product_name: top.title || searchQuery,
      brand: top.source || brandGuess,
      price: top.price || null,
      url: buildAffiliateUrl(top.product_link!),
      retailer: top.source || "Unknown",
      thumbnail: top.thumbnail || null,
      match_confidence: top.price ? "high" : "medium",
    };
  } else {
    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop`;
    responseBody = {
      product_name: searchQuery,
      brand: brandGuess,
      price: null,
      url: buildAffiliateUrl(fallbackUrl),
      retailer: "Google Shopping",
      match_confidence: "low",
    };
  }

  const svc = createServiceClient();
  if (svc) {
    let linkedRunId: string | null = analysisRunIdIn;
    if (linkedRunId) {
      const { data: row } = await svc
        .from("analysis_runs")
        .select("user_id")
        .eq("id", linkedRunId)
        .maybeSingle();
      if (!row || row.user_id !== user.id) linkedRunId = null;
    }

    await svc.from("search_requests").insert({
      user_id: user.id,
      analysis_run_id: linkedRunId,
      search_query: searchQuery,
      brand_guess: brandGuess || null,
      category,
      response: responseBody,
      latency_ms: Date.now() - t0,
      status: serpStatus,
      raw_error: rawError,
    });
  }

  return Response.json(responseBody);
}
