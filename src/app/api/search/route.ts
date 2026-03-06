import { buildAffiliateUrl } from "@/lib/affiliate";

// ─── PARTNER PRIORITY CONFIG ──────────────────────────────────────────────────
// Set to [] to disable all partnerships (no priority boosting).
// Tier values: higher = more priority. Only boosts when there's a real match.
const PARTNER_TIERS: { domains: string[]; tier: number }[] = [
  // Tier 1 — highest priority (testing only, no real partnership)
  { domains: ["zara.com", "uniqlo.com", "hm.com"], tier: 2 },
  // Tier 2 — secondary priority (testing only, no real partnership)
  { domains: ["alfani.com", "bananarepublic.com", "bananarepublic.gap.com"], tier: 1 },
];
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED = ["collectivevoice.com", "shopstyle.com", "shareasale.com"];

interface SerpMatch {
  link?: string;
  title?: string;
  source?: string;
  price?: string;
  thumbnail?: string;
}

function getPartnerTier(hostname: string): number {
  for (const { domains, tier } of PARTNER_TIERS) {
    if (domains.some((d) => hostname.includes(d))) return tier;
  }
  return 0;
}

function scoreMatch(m: SerpMatch): number {
  if (!m.link) return -1;
  try {
    const host = new URL(m.link).hostname.toLowerCase();
    if (BLOCKED.some((b) => host.includes(b))) return -1;

    let score = getPartnerTier(host) * 10; // partner boost
    if (m.price) score += 3;               // has a price = stronger match signal
    if (m.thumbnail) score += 1;
    return score;
  } catch {
    return -1;
  }
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

  const res = await fetch(`https://serpapi.com/search.json?${params}`);
  const data = await res.json();

  const matches: SerpMatch[] = data.shopping_results || [];

  // Score all matches and pick the best one
  const scored = matches
    .map((m) => ({ m, score: scoreMatch(m) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  console.log("[FitFind search]", searchQuery, scored.slice(0, 5).map(({ m, score }) => ({
    source: m.source,
    score,
    host: m.link ? (() => { try { return new URL(m.link).hostname; } catch { return m.link; } })() : null,
    price: m.price,
  })));

  const top = scored[0]?.m;

  if (top) {
    return Response.json({
      product_name: top.title || searchQuery,
      brand: top.source || brandGuess,
      price: top.price || null,
      url: buildAffiliateUrl(top.link!),
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
