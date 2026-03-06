const AMAZON_TAG = process.env.AMAZON_AFFILIATE_TAG || "fitfind-20";

export function buildAffiliateUrl(rawUrl: string | URL) {
  if (!rawUrl) return "#";
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    // Amazon — append associate tag
    if (host.includes("amazon")) {
      url.searchParams.set("tag", AMAZON_TAG);
      return url.toString();
    }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}