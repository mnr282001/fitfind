import { buildAffiliateUrl } from "@/lib/affiliate";

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

  let score = getPartnerTier(m.source ?? "") * 10; // partner boost
  if (m.price) score += 3;                          // has a price = stronger match signal
  if (m.thumbnail) score += 1;
  return score;
}

export async function POST(req: Request) {
  const { searchQuery, brandGuess } = await req.json();

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: searchQuery,
    api_key: process.env.SERPAPI_KEY || "",
    hl: "en",
    gl: "us",
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let data: Record<string, unknown> = {};
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal });
    data = await res.json();
  } catch (err) {
    console.error("[FitFind search] fetch failed:", err);
  } finally {
    clearTimeout(timeout);
  }

  const matches: SerpMatch[] = (data.shopping_results as SerpMatch[]) || [];

  // Score all matches and pick the best one
  const scored = matches
    .map((m) => ({ m, score: scoreMatch(m) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];

  if (best && best.score >= MIN_SCORE) {
    const top = best.m;
    return Response.json({
      product_name: top.title || searchQuery,
      brand: top.source || brandGuess,
      price: top.price || null,
      url: buildAffiliateUrl(top.product_link!),
      retailer: top.source || "Unknown",
      thumbnail: top.thumbnail || null,
      match_confidence: top.price ? "high" : "medium",
    });
  }

  // Fallback: Google Shopping search
  const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&tbm=shop`;
  return Response.json({
    product_name: searchQuery,
    brand: brandGuess,
    price: null,
    url: buildAffiliateUrl(fallbackUrl),
    retailer: "Google Shopping",
    match_confidence: "low",
  });
}
