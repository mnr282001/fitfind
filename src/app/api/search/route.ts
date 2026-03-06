import { buildAffiliateUrl } from "@/lib/affiliate";

export async function POST(req: Request) {
  const { searchQuery, category, brandGuess } = await req.json();

  // Google Lens via SerpApi — ~$0.02 per search
  // For best results, use the text+image search mode
  const params = new URLSearchParams({
    engine: "google_lens",
    search_type: "products",
    q: searchQuery,
    api_key: process.env.SERPAPI_KEY || "",
    hl: "en",
    country: "us",
  });

  const res = await fetch(
    `https://serpapi.com/search.json?${params}`
  );
  const data = await res.json();

  // Extract best product match — skip affiliate redirect links (e.g. collectivevoice.com)
  const matches = data.visual_matches || data.shopping_results || [];
  const BLOCKED = ["collectivevoice.com", "shopstyle.com", "shareasale.com"];
  const top = matches.find((m: { link?: string }) => {
    if (!m.link) return false;
    try {
      const host = new URL(m.link).hostname;
      return !BLOCKED.some((b) => host.includes(b));
    } catch {
      return false;
    }
  });

  if (top) {
    return Response.json({
      product_name: top.title || searchQuery,
      brand: top.source || brandGuess,
      price: top.price || null,
      url: buildAffiliateUrl(top.link),
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