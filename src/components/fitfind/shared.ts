"use client";

export type MatchConfidence = "high" | "medium" | "low";
export type Phase = "idle" | "analyzing" | "searching" | "done";

export interface ProductResult {
  product_name: string;
  brand: string;
  price: string | null;
  url: string;
  retailer: string;
  match_confidence: MatchConfidence;
  thumbnail?: string | null;
}

export interface IdentifiedItem {
  category: string;
  description: string;
  brand_guess: string;
  search_query: string;
  price_estimate: string;
}

export interface OutfitItem extends IdentifiedItem {
  product?: ProductResult;
}

export interface FitFindUser {
  id: string;
  email: string | null;
}

interface RateLimitResult {
  ok: boolean;
  reason?: string;
}

interface RateLimitState {
  count: number;
  day: string;
  lastScan: number;
}

export const CONFIG = {
  affiliate: {
    amazonTag: "fitfind-20",
    rakutenMid: "fitfind",
    shopstylePid: "uid1234-12345678-00",
    trackClicks: true,
  },
  tiers: {
    free: { scansPerDay: 3, showSponsored: true },
    pro: { scansPerDay: 50, showSponsored: false, priceMonthly: 4.99 },
  },
  rateLimit: { scansPerDay: 3, cooldownMs: 15000, maxFileMb: 10 },
} as const;

const IS_DEV =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

export const RateLimiter = (() => {
  const { scansPerDay: LIMIT, cooldownMs: COOLDOWN, maxFileMb: MAX_MB } = CONFIG.rateLimit;
  const KEY = "fitfind_rl";

  const today = (): string => new Date().toISOString().slice(0, 10);

  const getState = (): RateLimitState => {
    try {
      const raw = JSON.parse(window.name || "{}") as Record<string, RateLimitState>;
      const s = raw[KEY];
      if (!s || s.day !== today()) return { count: 0, day: today(), lastScan: 0 };
      return s;
    } catch {
      return { count: 0, day: today(), lastScan: 0 };
    }
  };

  const setState = (s: RateLimitState): void => {
    try {
      const raw = JSON.parse(window.name || "{}") as Record<string, RateLimitState>;
      raw[KEY] = s;
      window.name = JSON.stringify(raw);
    } catch {
      // Storage unavailable.
    }
  };

  return {
    LIMIT,
    check(): RateLimitResult {
      if (IS_DEV) return { ok: true };
      const s = getState();
      if (s.count >= LIMIT) {
        return { ok: false, reason: `Daily limit reached (${LIMIT} free scans). Upgrade to Pro for 50/day.` };
      }
      const elapsed = Date.now() - (s.lastScan || 0);
      if (elapsed < COOLDOWN) {
        return { ok: false, reason: `Try again in ${Math.ceil((COOLDOWN - elapsed) / 1000)}s.` };
      }
      return { ok: true };
    },
    consume(): number {
      if (IS_DEV) return LIMIT;
      const s = getState();
      s.count++;
      s.lastScan = Date.now();
      s.day = today();
      setState(s);
      return LIMIT - s.count;
    },
    remaining(): number {
      if (IS_DEV) return LIMIT;
      const s = getState();
      return Math.max(0, LIMIT - s.count);
    },
    validateFile(f: File): RateLimitResult {
      const extOk = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(f.name);
      if (!f.type.startsWith("image/") && !extOk) {
        return { ok: false, reason: "Only images accepted." };
      }
      if (f.size > MAX_MB * 1024 * 1024) return { ok: false, reason: `Max ${MAX_MB}MB.` };
      return { ok: true };
    },
  };
})();

export const CONF: Record<MatchConfidence, string> = {
  high: "#6ee7b7",
  medium: "#fcd34d",
  low: "#94a3b8",
};

export const CONF_LABEL: Record<MatchConfidence, string> = {
  high: "Exact",
  medium: "Close",
  low: "Similar",
};

export const CONF_TEXT: Record<MatchConfidence, string> = {
  high: "#052e16",
  medium: "#3f2a00",
  low: "#0f172a",
};

export const TIMELINE_STEPS = ["Analyzing photo", "Identifying pieces", "Finding product matches"] as const;

export function getTimelineStep(phase: Phase): number {
  if (phase === "analyzing") return 0;
  if (phase === "searching") return 2;
  if (phase === "done") return 3;
  return -1;
}

export function buildAffiliateUrl(rawUrl: string): string {
  if (!rawUrl) return "#";
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes("amazon")) {
      url.searchParams.set("tag", CONFIG.affiliate.amazonTag);
      return url.toString();
    }
    if (host.includes("nordstrom") || host.includes("shopbop") || host.includes("net-a-porter")) {
      url.searchParams.set("mid", CONFIG.affiliate.rakutenMid);
      return url.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function trackClick(item: OutfitItem, source: string): void {
  if (!CONFIG.affiliate.trackClicks) return;
  console.log("[FITFIND Analytics]", {
    category: item.category,
    brand: item.product?.brand,
    retailer: item.product?.retailer,
    source,
  });
}

function isHeicLike(file: File): boolean {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  return t === "image/heic" || t === "image/heif" || n.endsWith(".heic") || n.endsWith(".heif");
}

export async function normalizeImageFileForWeb(file: File): Promise<File> {
  if (!isHeicLike(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    const base = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch (e) {
    console.error("[FitFind] HEIC conversion failed:", e);
    throw new Error("Could not convert this photo. Export as JPEG from Photos, or try another image.");
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

export async function identifyOutfit(
  base64: string,
  mediaType: string
): Promise<{ items: IdentifiedItem[]; analysisRunId: string }> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mediaType }),
  });
  const data = (await res.json()) as {
    items?: IdentifiedItem[];
    analysisRunId?: string;
    error?: string;
  };
  if (!res.ok) {
    if (res.status === 401) throw new Error("Sign in to analyze outfits.");
    throw new Error(typeof data.error === "string" ? data.error : "Analyze request failed");
  }
  return { items: data.items ?? [], analysisRunId: data.analysisRunId ?? "" };
}

export async function searchProduct(item: IdentifiedItem, analysisRunId?: string): Promise<ProductResult> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchQuery: item.search_query,
      category: item.category,
      brandGuess: item.brand_guess,
      description: item.description,
      ...(analysisRunId ? { analysisRunId } : {}),
    }),
  });
  const data = (await res.json()) as ProductResult & { error?: string };
  if (!res.ok) {
    if (res.status === 401) throw new Error("Sign in required for search.");
    throw new Error(typeof data.error === "string" ? data.error : "Search request failed");
  }
  return data;
}
