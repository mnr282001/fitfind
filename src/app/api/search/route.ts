import { requireUser } from "@/lib/auth/require-user";
import { buildAffiliateUrl } from "@/lib/affiliate";
import { logApiError } from "@/lib/monitoring";
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
const TRUSTED_RETAILERS = [
  "nordstrom",
  "ssense",
  "farfetch",
  "net-a-porter",
  "shopbop",
  "revolve",
  "zara",
  "uniqlo",
  "aritzia",
  "madewell",
  "abercrombie",
];
const MARKETPLACE_RETAILERS = ["ebay", "poshmark", "mercari", "depop", "etsy", "facebook"];

// Minimum score to show a specific product. Below this, fall back to "similar items" only.
// Score breakdown: partner tier ×10, has price +3, has thumbnail +1.
// A score of 3 means: non-partner with a price. Raise to require partner matches.
const MIN_SCORE = 6;

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
const MAX_DESCRIPTION_LENGTH = 400;
const MAX_QUERY_VARIANTS = 2;
const SERP_TIMEOUT_MS = 4500;
const SERP_RESULTS_PER_QUERY = "12";
const UUID_V4_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchBody = {
  searchQuery: string;
  brandGuess: string;
  category: string | null;
  description: string;
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

  const descriptionNorm = normalizeInputString(body.description, MAX_DESCRIPTION_LENGTH);
  if (body.description !== undefined && descriptionNorm === null) {
    return { ok: false, error: "description must be a string up to 400 chars" };
  }
  const description = descriptionNorm ?? "";

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
      description,
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

function normalizeCategory(category: string | null): string | null {
  if (!category) return null;
  const c = category.toLowerCase();
  if (/(top|shirt|blouse|tee|tank)/.test(c)) return "top";
  if (/(outerwear|jacket|coat|blazer|hoodie|sweater)/.test(c)) return "outerwear";
  if (/(dress|gown)/.test(c)) return "dress";
  if (/(bottom|pant|trouser|jean|short|skirt|legging)/.test(c)) return "bottom";
  if (/(shoe|sneaker|boot|sandal|heel|loafer)/.test(c)) return "shoes";
  if (/(bag|purse|tote|clutch|backpack|handbag)/.test(c)) return "bag";
  if (/(accessory|hat|cap|belt|scarf|glass|sunglass|jewel|watch)/.test(c)) return "accessory";
  return c;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function isAggregatorHost(host: string): boolean {
  return /(google\.com|shopping\.yahoo\.com|bing\.com)/.test(host);
}

function makeSearchQueries(searchQuery: string, brandGuess: string, category: string | null, description: string): string[] {
  const normalizedCategory = normalizeCategory(category);
  const base = searchQuery.trim();
  const queries: string[] = [base];
  const brand = brandGuess.trim();
  const descTokens = tokenize(description)
    .filter((t) => !["women", "womens", "men", "mens", "outfit", "look"].includes(t))
    .slice(0, 4);

  if (normalizedCategory && !base.toLowerCase().includes(normalizedCategory)) {
    queries.push(`${base} ${normalizedCategory}`);
  }
  if (brand && brand.toLowerCase() !== "unknown" && !base.toLowerCase().includes(brand.toLowerCase())) {
    queries.push(`${brand} ${base}`);
  }
  if (descTokens.length > 0) {
    queries.push(`${base} ${descTokens.join(" ")}`);
  }
  if (normalizedCategory && descTokens.length > 0) {
    queries.push(`${normalizedCategory} ${descTokens.join(" ")}`);
  }
  return Array.from(new Set(queries.map((q) => q.trim()).filter((q) => q.length > 0))).slice(0, MAX_QUERY_VARIANTS);
}

function categoryGuardrailScore(title: string, normalizedCategory: string | null): number {
  if (!normalizedCategory) return 0;
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    top: ["top", "shirt", "tee", "blouse", "tank", "camisole"],
    outerwear: ["jacket", "coat", "blazer", "hoodie", "cardigan", "sweater"],
    dress: ["dress", "gown"],
    bottom: ["pants", "jeans", "trouser", "skirt", "shorts", "legging"],
    shoes: ["shoe", "sneaker", "boot", "sandal", "heel", "loafer"],
    bag: ["bag", "purse", "tote", "clutch", "backpack", "handbag"],
    accessory: ["hat", "cap", "belt", "scarf", "sunglasses", "jewelry", "watch"],
  };
  const allCategories = Object.keys(CATEGORY_KEYWORDS);
  const expectedKeywords = CATEGORY_KEYWORDS[normalizedCategory] ?? [];
  const hitExpected = expectedKeywords.some((k) => title.includes(k));
  if (hitExpected) return 5;

  const hasOtherCategoryHit = allCategories
    .filter((cat) => cat !== normalizedCategory)
    .some((cat) => CATEGORY_KEYWORDS[cat].some((k) => title.includes(k)));
  return hasOtherCategoryHit ? -6 : -2;
}

function retailerQualityScore(source: string): number {
  const s = source.toLowerCase();
  if (TRUSTED_RETAILERS.some((name) => s.includes(name))) return 3;
  if (MARKETPLACE_RETAILERS.some((name) => s.includes(name))) return -3;
  return 0;
}

function relevanceScore(m: SerpMatch, searchQuery: string, brandGuess: string, category: string | null, description: string): number {
  const title = (m.title || "").toLowerCase();
  const source = (m.source || "").toLowerCase();
  const queryTokens = tokenize(searchQuery);
  const descTokens = tokenize(description).slice(0, 6);
  const brandTokens = tokenize(brandGuess).filter((t) => t !== "unknown");
  const normalizedCategory = normalizeCategory(category);

  let score = 0;

  // Reward lexical overlap with query title.
  const overlap = queryTokens.reduce((acc, token) => (title.includes(token) ? acc + 1 : acc), 0);
  score += Math.min(8, overlap);
  const descOverlap = descTokens.reduce((acc, token) => (title.includes(token) ? acc + 1 : acc), 0);
  score += Math.min(4, descOverlap);

  // Strongly reward matching brand signal when provided.
  if (brandTokens.length > 0) {
    const brandHit = brandTokens.some((token) => title.includes(token) || source.includes(token));
    if (brandHit) score += 6;
    else score -= 4;
  }

  // Category-aware hard guardrail.
  score += categoryGuardrailScore(title, normalizedCategory);
  score += retailerQualityScore(source);

  if (m.product_link) {
    try {
      const host = new URL(m.product_link).hostname.toLowerCase();
      if (BLOCKED.some((b) => host.includes(b))) return -1;
      if (isAggregatorHost(host)) score -= 2;
    } catch {
      return -1;
    }
  } else {
    return -1;
  }

  return score;
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
  const { searchQuery, brandGuess, category, description, analysisRunId: analysisRunIdIn } = parsedBody.value;

  console.log(
    JSON.stringify({
      event: "search_request",
      userId: user.id,
      email: user.email,
      query: searchQuery,
    })
  );

  const queries = makeSearchQueries(searchQuery, brandGuess, category, description);

  let serpStatus: "ok" | "error" = "ok";
  let rawError: string | null = null;
  const mergedMatches: SerpMatch[] = [];
  let successCount = 0;
  let failureCount = 0;

  const queryResults = await Promise.allSettled(
    queries.map(async (q) => {
      const params = new URLSearchParams({
        engine: "google_shopping",
        q,
        api_key: process.env.SERPAPI_KEY || "",
        hl: "en",
        gl: "us",
        num: SERP_RESULTS_PER_QUERY,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SERP_TIMEOUT_MS);
      try {
        const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal });
        const data = (await res.json()) as Record<string, unknown>;
        return { ok: res.ok, data, query: q };
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  for (const result of queryResults) {
    if (result.status === "rejected") {
      failureCount += 1;
      rawError = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error("[FitFind search] fetch failed:", result.reason);
      continue;
    }

    const { ok, data } = result.value;
    if (!ok) {
      failureCount += 1;
      rawError = JSON.stringify(data).slice(0, 4000);
      continue;
    }
    successCount += 1;
    mergedMatches.push(...parseSerpMatches((data as { shopping_results?: unknown }).shopping_results));
  }

  const allQueriesFailed = failureCount > 0 && successCount === 0;
  const partialQueryFailure = failureCount > 0 && successCount > 0;
  if (allQueriesFailed) {
    serpStatus = "error";
  } else if (partialQueryFailure) {
    console.warn(
      JSON.stringify({
        event: "search_partial_upstream_failure",
        userId: user.id,
        queryCount: queries.length,
        successCount,
        failureCount,
      })
    );
  }

  const matchesByUrl = new Map<string, SerpMatch>();
  for (const match of mergedMatches) {
    if (!match.product_link) continue;
    if (!matchesByUrl.has(match.product_link)) {
      matchesByUrl.set(match.product_link, match);
    }
  }
  const matches = Array.from(matchesByUrl.values());

  const scored = matches
    .map((m) => ({ m, score: scoreMatch(m) + relevanceScore(m, searchQuery, brandGuess, category, description) }))
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
      match_confidence: best.score >= 16 ? "high" : best.score >= 10 ? "medium" : "low",
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
  if (allQueriesFailed && rawError) {
    await logApiError(svc, {
      userId: user.id,
      endpoint: "/api/search",
      provider: "serpapi",
      model: "google_shopping",
      analysisRunId: analysisRunIdIn,
      httpStatus: 502,
      errorCode: "upstream_error",
      message: "All SerpAPI requests failed",
      details: rawError,
      metadata: { queryCount: queries.length, queries, successCount, failureCount },
    });
  }
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
