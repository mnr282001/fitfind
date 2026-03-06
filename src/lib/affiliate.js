const AMAZON_TAG = process.env.AMAZON_AFFILIATE_TAG || "fitfind-20";
const SHOPSTYLE_PID = process.env.SHOPSTYLE_PID || "";

export function buildAffiliateUrl(rawUrl) {
  if (!rawUrl) return "#";
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    // Amazon — append associate tag
    if (host.includes("amazon")) {
      url.searchParams.set("tag", AMAZON_TAG);
      return url.toString();
    }

    // Major retailers — route through ShopStyle for commission
    // ShopStyle Collective supports: Nordstrom, ASOS, Net-a-Porter,
    // Revolve, Shopbop, Macy's, Bloomingdale's, Saks, etc.
    if (SHOPSTYLE_PID) {
      return `https://api.shopstylecollective.com/action/click?pid=${SHOPSTYLE_PID}&url=${encodeURIComponent(rawUrl)}`;
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}