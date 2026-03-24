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

  let body: {
    searchQuery?: string;
    brandGuess?: string;
    category?: string;
    analysisRunId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const searchQuery = body.searchQuery;
  const brandGuess = typeof body.brandGuess === "string" ? body.brandGuess : "";
  const category = typeof body.category === "string" ? body.category : null;
  const analysisRunIdIn = body.analysisRunId;

  if (typeof searchQuery !== "string" || !searchQuery.trim()) {
    return Response.json({ error: "Missing searchQuery" }, { status: 400 });
  }

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

  const matches: SerpMatch[] = (data.shopping_results as SerpMatch[]) || [];

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
    let linkedRunId: string | null =
      typeof analysisRunIdIn === "string" && analysisRunIdIn.length > 0 ? analysisRunIdIn : null;
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
