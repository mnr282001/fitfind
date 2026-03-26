// "use client";
// // In identifyOutfit — replace the entire fetch block:
// const res = await fetch("/api/analyze", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ image: base64, mediaType }),
// });
// const data = await res.json();
// return data.items;

// // In searchProduct — replace the entire fetch block:
// const res = await fetch("/api/search", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     searchQuery: item.search_query,
//     category: item.category,
//     brandGuess: item.brand_guess,
//   }),
// });
// return await res.json();

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, type CSSProperties, JSX } from "react";
import { createClient } from "@/lib/supabase/client";

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

type MatchConfidence = "high" | "medium" | "low";
type Phase = "idle" | "analyzing" | "searching" | "done";

interface ProductResult {
  product_name: string;
  brand: string;
  price: string | null;
  url: string;
  retailer: string;
  match_confidence: MatchConfidence;
  thumbnail?: string | null;
}

interface IdentifiedItem {
  category: string;
  description: string;
  brand_guess: string;
  search_query: string;
  price_estimate: string;
}

interface OutfitItem extends IdentifiedItem {
  product?: ProductResult;
}

interface RateLimitResult {
  ok: boolean;
  reason?: string;
}

interface RateLimiterType {
  LIMIT: number;
  check: () => RateLimitResult;
  consume: () => number;
  remaining: () => number;
  validateFile: (f: File) => RateLimitResult;
}

export interface FitFindUser {
  id: string;
  email: string | null;
}

/* ═══════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════ */

const CONFIG = {
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

/* ═══════════════════════════════════════════════
   AFFILIATE LINK BUILDER
   ═══════════════════════════════════════════════ */

function buildAffiliateUrl(rawUrl: string, _retailer?: string): string {
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

/* ═══════════════════════════════════════════════
   ANALYTICS
   ═══════════════════════════════════════════════ */

function trackClick(item: OutfitItem, source: string): void {
  if (!CONFIG.affiliate.trackClicks) return;
  // Production: POST to /api/analytics/click
  console.log("[FITFIND Analytics]", {
    category: item.category,
    brand: item.product?.brand,
    retailer: item.product?.retailer,
    source,
  });
}

/* ═══════════════════════════════════════════════
   RATE LIMITER (client-side UX layer)
   Server-side enforcement lives in API routes
   ═══════════════════════════════════════════════ */

interface RateLimitState {
  count: number;
  day: string;
  lastScan: number;
}

const IS_DEV = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const RateLimiter: RateLimiterType = (() => {
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
      // Storage unavailable
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

/* ═══════════════════════════════════════════════
   FILE HELPERS
   ═══════════════════════════════════════════════ */

function isHeicLike(file: File): boolean {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  return t === "image/heic" || t === "image/heif" || n.endsWith(".heic") || n.endsWith(".heif");
}

/** iPhone HEIC/HEIF is not drawable in most desktop browsers; convert to JPEG for preview + API. */
async function normalizeImageFileForWeb(file: File): Promise<File> {
  if (!isHeicLike(file)) return file;
  try {
    const { default: heic2any } = await import("heic2any");
    const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(result) ? result[0] : result;
    const base = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch (e) {
    console.error("[FitFind] HEIC conversion failed:", e);
    throw new Error(
      "Could not convert this photo. Export as JPEG from Photos, or try another image."
    );
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

/* ═══════════════════════════════════════════════
   API CALLS
   Routes through Next.js API routes in production
   ═══════════════════════════════════════════════ */

async function identifyOutfit(
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

async function searchProduct(item: IdentifiedItem, analysisRunId?: string): Promise<ProductResult> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchQuery: item.search_query,
      category: item.category,
      brandGuess: item.brand_guess,
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

/* ═══════════════════════════════════════════════
   UI CONSTANTS
   ═══════════════════════════════════════════════ */

const CONF: Record<MatchConfidence, string> = {
  high: "#34d399",
  medium: "#fbbf24",
  low: "#f87171",
};

const CONF_LABEL: Record<MatchConfidence, string> = {
  high: "Exact",
  medium: "Close",
  low: "Similar",
};

const TIMELINE_STEPS = ["Analyzing photo", "Identifying pieces", "Finding product matches"] as const;

function getTimelineStep(phase: Phase): number {
  if (phase === "analyzing") return 0;
  if (phase === "searching") return 2;
  if (phase === "done") return 3;
  return -1;
}

/* ═══════════════════════════════════════════════
   CATEGORY ICON
   ═══════════════════════════════════════════════ */

function CatIcon({ cat }: { cat: string }): JSX.Element {
  const c = cat.toLowerCase();
  const s: CSSProperties = { width: "100%", height: "100%" };
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: s };

  if (["top", "shirt", "blouse", "jacket", "outerwear", "coat", "sweater", "hoodie"].some((k) => c.includes(k)))
    return <svg {...props}><path d="M12 3L8 7H4v4l-1.5 1.5V20h19v-7.5L20 11V7h-4l-4-4z" /></svg>;
  if (["bottom", "pant", "jean", "skirt", "short", "trouser"].some((k) => c.includes(k)))
    return <svg {...props}><path d="M6 2h12v7l-2 13h-3L12 12l-1 10H8L6 9V2z" /></svg>;
  if (["shoe", "sneaker", "boot", "sandal", "heel"].some((k) => c.includes(k)))
    return <svg {...props}><path d="M3 18h18v2H3zM5 14l4-6h4l5 2 3-1v5H5z" /></svg>;
  if (["bag", "purse", "clutch", "tote", "backpack"].some((k) => c.includes(k)))
    return <svg {...props}><path d="M6 8V6a6 6 0 0112 0v2" /><rect x="3" y="8" width="18" height="14" rx="2" /></svg>;
  if (["hat", "cap", "beanie"].some((k) => c.includes(k)))
    return <svg {...props}><path d="M3 16h18M5 16c0-4 2.5-8 7-10 4.5 2 7 6 7 10" /></svg>;
  if (["glass", "eyewear", "sunglass"].some((k) => c.includes(k)))
    return <svg {...props}><circle cx="7" cy="14" r="4" /><circle cx="17" cy="14" r="4" /><path d="M11 14h2M3 14H2M22 14h-1M7 10V6M17 10V6" /></svg>;

  return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 8v4l2 2" /></svg>;
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function FitFind({ user }: { user: FitFindUser | null }): JSX.Element {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [items, setItems] = useState<OutfitItem[]>([]);
  const [identifiedCount, setIdentifiedCount] = useState<number>(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [remaining, setRemaining] = useState<number>(RateLimiter.LIMIT);
  const [showUpgrade, setShowUpgrade] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const resultsAnchorRef = useRef<HTMLDivElement | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRemaining(RateLimiter.remaining());
  }, []);

  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  const scrollToResults = useCallback(() => {
    const target = timelineRef.current ?? resultsAnchorRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    if (!image) return;
    if (phase !== "analyzing" && phase !== "searching") return;
    const id = window.setTimeout(() => {
      // Double RAF ensures layout has committed before scrolling.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => scrollToResults());
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [image, phase, items.length, scrollToResults]);

  const handleSignOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    }
    router.refresh();
  }, [router]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");

    const fileCheck = RateLimiter.validateFile(file);
    if (!fileCheck.ok) { setError(fileCheck.reason!); return; }

    const rateCheck = RateLimiter.check();
    if (!rateCheck.ok) { setError(rateCheck.reason!); setShowUpgrade(true); return; }

    const left = RateLimiter.consume();
    setRemaining(left);
    setItems([]);
    setIdentifiedCount(0);
    setPhase("analyzing");
    setProgress("Scanning your fit...");
    setExpandedItem(null);
    setShowUpgrade(false);

    revokePreviewUrl();

    let working: File;
    try {
      working = await normalizeImageFileForWeb(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare this image.");
      setPhase("idle");
      setProgress("");
      return;
    }

    let previewUrl: string;
    try {
      previewUrl = URL.createObjectURL(working);
    } catch {
      setError("Could not create a preview for this file.");
      setPhase("idle");
      setProgress("");
      return;
    }
    previewBlobUrlRef.current = previewUrl;
    setImage(previewUrl);

    try {
      const base64 = await fileToBase64(working);
      const mediaType = working.type || "image/jpeg";
      const { items: identified, analysisRunId } = await identifyOutfit(base64, mediaType);
      setIdentifiedCount(identified.length);
      setItems(identified.map((it) => ({ ...it })));
      setProgress(`${identified.length} pieces found — shopping...`);
      setPhase("searching");

      for (let i = 0; i < identified.length; i++) {
        setProgress(`Finding ${identified[i].category.toLowerCase()} (${i + 1}/${identified.length})`);
        const product = await searchProduct(identified[i], analysisRunId || undefined);
        setItems((prev) => prev.map((entry, idx) => (idx === i ? { ...entry, product } : entry)));
      }

      setPhase("done");
      setProgress("");
    } catch (err) {
      console.error(err);
      setPhase("idle");
      setIdentifiedCount(0);
      setProgress("Couldn't analyze — try another photo.");
    }
  }, [revokePreviewUrl]);

  const reset = (): void => {
    revokePreviewUrl();
    setImage(null);
    setItems([]);
    setIdentifiedCount(0);
    setPhase("idle");
    setProgress("");
    setExpandedItem(null);
    setError("");
    setShowUpgrade(false);
    setRemaining(RateLimiter.remaining());
    if (fileRef.current) fileRef.current.value = "";
  };

  const total = items.reduce((sum, it) => {
    if (it.product?.price) {
      const p = it.product.price.replace(/[^0-9.]/g, "");
      const n = parseFloat(p);
      if (!isNaN(n) && n > 0) return sum + n;
    }
    // Fall back to Gemini's price_estimate — take the lower bound of any range
    if (it.price_estimate) {
      const nums = it.price_estimate.match(/\d+(\.\d+)?/g);
      if (nums) return sum + parseFloat(nums[0]);
    }
    return sum;
  }, 0);

  const handleShopClick = (item: OutfitItem): void => {
    trackClick(item, item.product?.url || "direct");
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    handleFile(e.target.files?.[0]);
  };

  const timelineStep = getTimelineStep(phase);
  const isProcessing = phase === "analyzing" || phase === "searching";
  const resolvedCount = items.filter((it) => Boolean(it.product)).length;

  /* ─── RENDER ─── */
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(1200px 700px at 8% -10%, rgba(209,163,139,.22), transparent 58%), radial-gradient(900px 520px at 94% 8%, rgba(118,136,255,.12), transparent 48%), #07070a",
        color: "#f1ede7",
        fontFamily: "'Outfit','Helvetica Neue',sans-serif",
        WebkitFontSmoothing: "antialiased",
        overflowX: "hidden",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --ff-bg:#07070a;
          --ff-surface:rgba(255,255,255,.03);
          --ff-surface-strong:rgba(255,255,255,.05);
          --ff-stroke:rgba(255,255,255,.10);
          --ff-stroke-soft:rgba(255,255,255,.06);
          --ff-text:#f1ede7;
          --ff-muted:#9e958c;
          --ff-accent:#d1a38b;
          --ff-accent-2:#b8806a;
        }
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scanMove{0%{top:-2px}100%{top:calc(100% + 2px)}}
        @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}
        @keyframes dotPulse{0%,80%,100%{transform:scale(0);opacity:.5}40%{transform:scale(1);opacity:1}}
        @keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        .card-enter{animation:fadeUp .45s cubic-bezier(.22,1,.36,1) both}
        .scan-line{animation:scanMove 1.8s ease-in-out infinite alternate}
        .breathe{animation:breathe 3s ease-in-out infinite}
        .shop-btn{transition:all .2s cubic-bezier(.22,1,.36,1);-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .shop-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(209,163,139,.35)}
        .shop-btn:active{transform:scale(.97)}
        .upload-zone{transition:all .3s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .upload-zone:active{transform:scale(.985)}
        .item-row{transition:all .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
        .item-row:active{background:#1a1a1e!important}
        .dot-loading span{display:inline-block;width:5px;height:5px;border-radius:50%;background:#d1a38b;animation:dotPulse 1.4s ease-in-out infinite}
        .dot-loading span:nth-child(2){animation-delay:.2s}
        .dot-loading span:nth-child(3){animation-delay:.4s}
        input[type="file"]{display:none}
        @media(hover:hover){.item-row:hover{background:#151518!important}}
        .upgrade-card{position:relative;overflow:hidden}
        .upgrade-card::before{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(209,163,139,.06),transparent);animation:shimmer 3s ease-in-out infinite}
        .fitfind-email{display:none}
        @media(min-width:380px){.fitfind-email{display:inline-block!important}}
        .ff-shell{
          position:relative;
          isolation:isolate;
          width:100%;
          max-width:560px;
          margin:0 auto;
          padding:0 16px env(safe-area-inset-bottom, 20px);
        }
        .ff-shell::before{
          content:'';
          position:fixed;
          inset:0;
          pointer-events:none;
          background-image:radial-gradient(rgba(255,255,255,.035) 1px, transparent 1px);
          background-size:3px 3px;
          opacity:.2;
          z-index:-2;
        }
        .ff-nav{
          backdrop-filter:blur(14px);
          -webkit-backdrop-filter:blur(14px);
          border-bottom:1px solid rgba(255,255,255,.06);
        }
        .ff-panel{
          background:linear-gradient(165deg, rgba(255,255,255,.045), rgba(255,255,255,.015));
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 26px 80px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06);
          border-radius:24px;
        }
        .ff-tag{
          font-size:11px;
          letter-spacing:.06em;
          text-transform:uppercase;
          color:var(--ff-muted);
          padding:6px 11px;
          border-radius:999px;
          border:1px solid var(--ff-stroke-soft);
          background:rgba(255,255,255,.02);
        }
        .ff-soft-text{color:var(--ff-muted)}
        .results-hero{
          position:relative;
          overflow:hidden;
          border-radius:22px;
          border:1px solid rgba(255,255,255,.09);
          background:rgba(255,255,255,.02);
        }
        .results-overlay{
          position:absolute;
          inset:auto 0 0 0;
          padding:16px 14px;
          background:linear-gradient(180deg, rgba(10,10,12,0) 0%, rgba(10,10,12,.8) 100%);
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .timeline-shell{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:8px;
          margin:14px 0;
        }
        .timeline-step{
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          padding:10px;
          background:rgba(255,255,255,.02);
          transform:translateY(0);
          transition:transform .24s ease, border-color .24s ease, background .24s ease, opacity .24s ease;
        }
        .timeline-step.active{
          border-color:rgba(209,163,139,.42);
          background:rgba(209,163,139,.09);
          transform:translateY(-2px);
        }
        .timeline-step.done{
          border-color:rgba(52,211,153,.3);
          background:rgba(52,211,153,.1);
        }
        .result-item{
          border:1px solid rgba(255,255,255,.1);
          border-radius:16px;
          background:linear-gradient(165deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
          padding:14px;
          margin-bottom:10px;
          animation:fadeUp .35s cubic-bezier(.22,1,.36,1) both;
          transition:border-color .22s ease, background .22s ease, transform .22s ease;
        }
        .result-item.pending{
          opacity:.78;
        }
        .result-item.resolved{
          border-color:rgba(209,163,139,.22);
          background:linear-gradient(165deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
        }
        .skeleton-line{
          position:relative;
          overflow:hidden;
        }
        .skeleton-line::after{
          content:'';
          position:absolute;
          inset:0;
          background:linear-gradient(90deg, transparent, rgba(255,255,255,.15), transparent);
          transform:translateX(-100%);
          animation:shimmer 1.9s ease-in-out infinite;
        }
      `}</style>

      <div className="ff-shell">

        {/* ─── NAV ─── */}
        <div className="ff-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", position: "sticky", top: 0, zIndex: 20, background: "linear-gradient(to bottom, rgba(7,7,10,.88) 72%, transparent)", gap: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>FIT</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#d1a38b" }}>FIND</span>
            {user && (
              <span style={{ fontSize: 10, fontWeight: 500, color: "#555", marginLeft: 8 }}>
                {remaining}/{RateLimiter.LIMIT}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {user && (
              <>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: "#666",
                    maxWidth: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  className="fitfind-email"
                  title={user.email ?? user.id}
                >
                  {user.email ?? `${user.id.slice(0, 8)}…`}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,.1)",
                    borderRadius: 100,
                    color: "#c2b8ad",
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  Sign out
                </button>
              </>
            )}
            {!user && (
              <>
                <Link
                  href="/login"
                  style={{ fontSize: 12, fontWeight: 500, color: "#c8c1b8", textDecoration: "none", padding: "6px 10px" }}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#120f0c",
                    background: "linear-gradient(135deg, #d1a38b, #b8806a)",
                    textDecoration: "none",
                    padding: "6px 12px",
                    borderRadius: 100,
                  }}
                >
                  Sign up
                </Link>
              </>
            )}
            {user && phase === "done" && (
              <button
                onClick={reset}
                style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 100, color: "#aaa", padding: "7px 16px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
              >
                + New
              </button>
            )}
          </div>
        </div>

        {/* ─── AUTH WALL ─── */}
        {!user && (
          <div style={{ paddingTop: 20, paddingBottom: 14 }}>
            <div className="ff-panel card-enter" style={{ padding: "30px 22px 22px", maxWidth: 500, margin: "0 auto 12px", textAlign: "center" }}>
              <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(30px, 8vw, 44px)", fontWeight: 400, lineHeight: 1.08, marginBottom: 12 }}>
                Find every piece<br />
                <span style={{ fontStyle: "italic", color: "#d1a38b" }}>FitFind</span>
              </h1>
              <p style={{ fontSize: 14, color: "#9e958c", fontWeight: 300, maxWidth: 360, margin: "0 auto 20px", lineHeight: 1.58 }}>
                Upload one outfit photo and get item-level matches, prices, and places to buy in seconds.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
                {[
                  { k: "Item detection", v: "tops, pants, shoes, accessories" },
                  { k: "Price view", v: "quick estimate + live links" },
                  { k: "Better matches", v: "brand + category signals" },
                  { k: "Your history", v: "past scans saved to profile" },
                ].map((f) => (
                  <div key={f.k} style={{ textAlign: "left", padding: "10px 11px", borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.02)" }}>
                    <div style={{ fontSize: 11, color: "#e2dbd2", fontWeight: 500, marginBottom: 3 }}>{f.k}</div>
                    <div style={{ fontSize: 10, color: "#9b9188", lineHeight: 1.4 }}>{f.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
              <Link
                href="/login"
                style={{
                  display: "block",
                  background: "linear-gradient(135deg, #d1a38b, #b8806a)",
                  color: "#120f0c",
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  padding: "14px 20px",
                  borderRadius: 14,
                  textAlign: "center",
                  boxShadow: "0 12px 30px rgba(209,163,139,.25)",
                }}
              >
                Sign in to try FitFind
              </Link>
              <Link
                href="/signup"
                style={{
                  display: "block",
                  background: "rgba(255,255,255,.035)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "#d9d2c8",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  padding: "12px 20px",
                  borderRadius: 14,
                  textAlign: "center",
                }}
              >
                Create free account
              </Link>
            </div>
            </div>
            <div className="ff-panel card-enter" style={{ padding: "14px 16px", maxWidth: 500, margin: "0 auto" }}>
              <div style={{ fontSize: 11, color: "#cfc7bd", fontWeight: 600, marginBottom: 10, letterSpacing: ".05em", textTransform: "uppercase" }}>How it works</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "Upload a mirror selfie, flat lay, or street-style photo.",
                  "FitFind detects each visible clothing item.",
                  "Open matches to shop, compare, or browse similar pieces.",
                ].map((step, i) => (
                  <div key={step} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0" }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid rgba(209,163,139,.45)", background: "rgba(209,163,139,.12)", color: "#d1a38b", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 12, color: "#9f958c", lineHeight: 1.45, paddingTop: 2 }}>{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── UPLOAD STATE ─── */}
        {user && !image && (
          <div style={{ paddingTop: 20 }}>
            <div className="ff-panel card-enter" style={{ padding: "28px 18px 20px", marginBottom: 14 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 400, lineHeight: 1.15, marginBottom: 10 }}>
                Snap a fit.<br />
                <span style={{ fontStyle: "italic", color: "#d1a38b" }}>Shop every piece.</span>
              </h1>
              <p style={{ fontSize: 14, color: "#9e958c", fontWeight: 300, maxWidth: 300, margin: "0 auto", lineHeight: 1.55 }}>
                Upload any outfit photo and we&apos;ll identify each item with links to buy.
              </p>
            </div>

            <div
              className="upload-zone"
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                width: "100%", aspectRatio: "3/4", maxHeight: "55dvh", borderRadius: 20,
                border: `1.5px dashed ${dragOver ? "#d1a38b" : "rgba(255,255,255,.18)"}`,
                background: dragOver ? "rgba(209,163,139,.06)" : "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: "pointer", position: "relative", overflow: "hidden",
              }}
            >
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} />
              <div style={{ position: "absolute", width: 140, height: 140, borderRadius: "50%", border: "1px solid rgba(209,163,139,.08)", pointerEvents: "none" }} className="breathe" />
              <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: "1px solid rgba(209,163,139,.04)", pointerEvents: "none" }} />
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(209,163,139,.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, position: "relative", zIndex: 1 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d1a38b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 500, color: "#dfd7ce", position: "relative", zIndex: 1 }}>Upload outfit photo</span>
              <span style={{ fontSize: 12, color: "#978f86", marginTop: 6, position: "relative", zIndex: 1 }}>or drag & drop here</span>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              {["Street style", "Mirror selfie", "Flat lay", "Full body"].map((t) => (
                <span key={t} style={{ fontSize: 11, color: "#91877d", border: "1px solid rgba(255,255,255,.09)", borderRadius: 100, padding: "6px 12px", background: "rgba(255,255,255,.015)" }}>{t}</span>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 16, textAlign: "center", padding: "12px 16px", background: "rgba(248,113,113,.06)", border: "1px solid rgba(248,113,113,.15)", borderRadius: 12 }}>
                <span style={{ fontSize: 13, color: "#f87171" }}>{error}</span>
              </div>
            )}

            {showUpgrade && (
              <div className="upgrade-card" style={{ marginTop: 12, padding: "16px 20px", background: "linear-gradient(135deg, rgba(209,163,139,.08), rgba(209,163,139,.03))", border: "1px solid rgba(209,163,139,.15)", borderRadius: 14, textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Unlock unlimited scans</div>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Get 50 scans/day, no ads, and priority results</div>
                <button style={{ background: "linear-gradient(135deg, #d1a38b, #b8806a)", color: "#08080a", fontSize: 14, fontWeight: 600, fontFamily: "inherit", padding: "11px 32px", borderRadius: 10, border: "none", cursor: "pointer" }}>
                  Go Pro — ${CONFIG.tiers.pro.priceMonthly}/mo
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {/* ─── RESULTS STATE ─── */}
        {user && image && (
          <div className="card-enter">
            <div className="ff-panel" style={{ padding: 10, marginBottom: 12 }}>
              <div className="results-hero">
                <img src={image} alt="Uploaded outfit" style={{ width: "100%", display: "block" }} />
                {isProcessing && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <div className="scan-line" style={{ position: "absolute", left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg, transparent 0%, #d1a38b 30%, #d1a38b 70%, transparent 100%)", boxShadow: "0 0 16px 3px rgba(209,163,139,.25)" }} />
                    <div style={{ position: "absolute", inset: 0, background: "rgba(8,8,10,.2)" }} />
                  </div>
                )}
                <div className="results-overlay">
                  <span className="ff-tag">{identifiedCount || items.length} pieces detected</span>
                  {phase === "done" && (
                    <span className="ff-tag">Estimated total {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                  )}
                  {isProcessing && <span className="ff-tag">AI in progress</span>}
                </div>
              </div>
            </div>

            {(isProcessing || phase === "done") && (
              <div ref={timelineRef} className="timeline-shell">
                {TIMELINE_STEPS.map((step, idx) => {
                  const done = timelineStep > idx;
                  const active = timelineStep === idx;
                  return (
                    <div key={step} className={`timeline-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: done ? "#6ee7b7" : active ? "#e7bfab" : "#867b72", marginBottom: 6 }}>
                        {done ? "Done" : active ? "Active" : "Waiting"}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#efe7de" }}>{step}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {progress && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div className="dot-loading" style={{ display: "flex", gap: 4 }}><span /><span /><span /></div>
                <span className="ff-text-muted" style={{ fontSize: 13 }}>{progress}</span>
              </div>
            )}

            {items.length > 0 && (
              <div>
                {phase === "done" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "linear-gradient(135deg, rgba(209,163,139,.10), rgba(209,163,139,.04))", border: "1px solid rgba(209,163,139,.18)", borderRadius: 14, marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: "#b9afa5" }}>Estimated total</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: "#d1a38b" }}>
                      {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 400 }}>Found Pieces</h2>
                  {isProcessing && (
                    <span style={{ fontSize: 11, color: "#9f958c" }}>
                      {resolvedCount}/{identifiedCount || items.length} matched
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((it, idx) => {
                    const resolved = Boolean(it.product);
                    return (
                      <div
                        key={`${it.category}-${idx}`}
                        className={`result-item ${resolved ? "resolved" : "pending"} item-row`}
                        onClick={() => {
                          if (!resolved) return;
                          setExpandedItem(expandedItem === idx ? null : idx);
                        }}
                        style={{ cursor: resolved ? "pointer" : "default" }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(209,163,139,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#d1a38b" }}>
                            <CatIcon cat={it.category} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#e2dbd2", marginBottom: 3 }}>{it.category}</div>
                            <div style={{ fontSize: 11, color: "#9e958c", lineHeight: 1.35 }}>{it.description}</div>
                            {resolved ? (
                              <div style={{ fontSize: 10, color: "#d1a38b", marginTop: 4, fontWeight: 500 }}>
                                {it.product?.brand} · {it.product?.retailer}
                              </div>
                            ) : (
                              <div className="skeleton-line" style={{ marginTop: 8, height: 8, width: "64%", borderRadius: 99, background: "rgba(255,255,255,.08)" }} />
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            {resolved ? (
                              <>
                                {it.product?.price && <div style={{ fontSize: 12, fontWeight: 600, color: "#d1a38b" }}>{it.product.price}</div>}
                                {it.product?.match_confidence && (
                                  <div style={{ fontSize: 9, fontWeight: 600, color: "#08080a", background: CONF[it.product.match_confidence], padding: "3px 8px", borderRadius: 6 }}>
                                    {CONF_LABEL[it.product.match_confidence]}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="ff-tag">Matching...</span>
                            )}
                          </div>
                        </div>

                        {resolved && expandedItem === idx && it.product && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.04)" }}>
                            {it.product.thumbnail && (
                              <img
                                src={it.product.thumbnail}
                                alt={it.product.product_name}
                                style={{ width: "100%", borderRadius: 8, marginBottom: 10, maxHeight: 180, objectFit: "cover" }}
                              />
                            )}
                            <div style={{ fontSize: 12, color: "#d3cbc2", marginBottom: 10 }}>{it.product.product_name}</div>
                            {it.product.match_confidence !== "low" && (
                              <button
                                className="shop-btn"
                                onClick={() => {
                                  handleShopClick(it);
                                  window.open(buildAffiliateUrl(it.product!.url, it.product!.retailer), "_blank");
                                }}
                                style={{ width: "100%", background: "linear-gradient(135deg, #d1a38b, #b8806a)", color: "#08080a", border: "none", padding: "11px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
                              >
                                Shop on {it.product.retailer}
                              </button>
                            )}
                            <button
                              className="shop-btn"
                              onClick={() => {
                                const q = encodeURIComponent(it.product!.product_name || it.search_query);
                                window.open(`https://www.google.com/search?q=${q}&tbm=shop`, "_blank");
                              }}
                              style={{ width: "100%", background: it.product.match_confidence === "low" ? "rgba(255,255,255,.04)" : "transparent", color: it.product.match_confidence === "low" ? "#ccc" : "#9f958c", border: "1px solid rgba(255,255,255,.08)", padding: "10px 16px", borderRadius: 10, fontSize: 12, fontWeight: it.product.match_confidence === "low" ? 600 : 500, fontFamily: "inherit", cursor: "pointer", marginTop: it.product.match_confidence === "low" ? 0 : 8 }}
                            >
                              {it.product.match_confidence === "low" ? "Browse similar items" : "Find similar on Google"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div ref={resultsAnchorRef} style={{ height: 1 }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}