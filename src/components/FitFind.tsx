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

import { useState, useEffect, useRef, useCallback, type CSSProperties, JSX } from "react";

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
      if (!f.type.startsWith("image/")) return { ok: false, reason: "Only images accepted." };
      if (f.size > MAX_MB * 1024 * 1024) return { ok: false, reason: `Max ${MAX_MB}MB.` };
      return { ok: true };
    },
  };
})();

/* ═══════════════════════════════════════════════
   FILE HELPERS
   ═══════════════════════════════════════════════ */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1]);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ═══════════════════════════════════════════════
   API CALLS
   Routes through Next.js API routes in production
   ═══════════════════════════════════════════════ */

async function identifyOutfit(base64: string, mediaType: string): Promise<IdentifiedItem[]> {
  const res = await fetch("/api/analyze", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ image: base64, mediaType }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error ?? "Analyze request failed");
return data.items;
}

async function searchProduct(item: IdentifiedItem): Promise<ProductResult> {
  const res = await fetch("/api/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    searchQuery: item.search_query,
    category: item.category,
    brandGuess: item.brand_guess,
  }),
});
return await res.json();
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

export default function FitFind(): JSX.Element {
  const [image, setImage] = useState<string | null>(null);
  const [items, setItems] = useState<OutfitItem[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<string>("");
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [remaining, setRemaining] = useState<number>(RateLimiter.LIMIT);
  const [showUpgrade, setShowUpgrade] = useState<boolean>(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRemaining(RateLimiter.remaining());
  }, []);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError("");

    const fileCheck = RateLimiter.validateFile(file);
    if (!fileCheck.ok) { setError(fileCheck.reason!); return; }

    const rateCheck = RateLimiter.check();
    if (!rateCheck.ok) { setError(rateCheck.reason!); setShowUpgrade(true); return; }

    const left = RateLimiter.consume();
    setRemaining(left);
    setImage(URL.createObjectURL(file));
    setItems([]);
    setPhase("analyzing");
    setProgress("Scanning your fit...");
    setExpandedItem(null);
    setShowUpgrade(false);

    try {
      const base64 = await fileToBase64(file);
      const identified = await identifyOutfit(base64, file.type || "image/jpeg");
      setProgress(`${identified.length} pieces found — shopping...`);
      setPhase("searching");

      const results: OutfitItem[] = [];
      for (let i = 0; i < identified.length; i++) {
        setProgress(`Finding ${identified[i].category.toLowerCase()} (${i + 1}/${identified.length})`);
        const product = await searchProduct(identified[i]);
        results.push({ ...identified[i], product });
        setItems([...results]);
      }

      setPhase("done");
      setProgress("");
    } catch (err) {
      console.error(err);
      setPhase("idle");
      setProgress("Couldn't analyze — try another photo.");
    }
  }, []);

  const reset = (): void => {
    setImage(null);
    setItems([]);
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

  /* ─── RENDER ─── */
  return (
    <div style={{ minHeight: "100dvh", background: "#08080a", color: "#eae6df", fontFamily: "'Outfit','Helvetica Neue',sans-serif", WebkitFontSmoothing: "antialiased", overflowX: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
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
      `}</style>

      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "0 16px", paddingBottom: "env(safe-area-inset-bottom, 20px)" }}>

        {/* ─── NAV ─── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", position: "sticky", top: 0, zIndex: 20, background: "linear-gradient(to bottom, #08080a 60%, transparent)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>FIT</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#d1a38b" }}>FIND</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "#555", marginLeft: 8 }}>
              {remaining}/{RateLimiter.LIMIT}
            </span>
          </div>
          {phase === "done" && (
            <button
              onClick={reset}
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 100, color: "#aaa", padding: "7px 16px", fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
            >
              + New
            </button>
          )}
        </div>

        {/* ─── UPLOAD STATE ─── */}
        {!image && (
          <div style={{ paddingTop: 20 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 400, lineHeight: 1.15, marginBottom: 10 }}>
                Snap a fit.<br />
                <span style={{ fontStyle: "italic", color: "#d1a38b" }}>Shop every piece.</span>
              </h1>
              <p style={{ fontSize: 14, color: "#666", fontWeight: 300, maxWidth: 280, margin: "0 auto" }}>
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
                border: `1.5px dashed ${dragOver ? "#d1a38b" : "#222"}`,
                background: dragOver ? "rgba(209,163,139,.04)" : "rgba(255,255,255,.015)",
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
              <span style={{ fontSize: 15, fontWeight: 500, color: "#ccc", position: "relative", zIndex: 1 }}>Upload outfit photo</span>
              <span style={{ fontSize: 12, color: "#555", marginTop: 6, position: "relative", zIndex: 1 }}>or drag & drop here</span>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              {["Street style", "Mirror selfie", "Flat lay", "Full body"].map((t) => (
                <span key={t} style={{ fontSize: 11, color: "#555", border: "1px solid #1a1a1a", borderRadius: 100, padding: "5px 12px" }}>{t}</span>
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
        )}

        {/* ─── RESULTS STATE ─── */}
        {image && (
          <div>
            {/* Photo */}
            <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 20 }}>
              <img src={image} alt="Uploaded outfit" style={{ width: "100%", display: "block", borderRadius: 18 }} />
              {(phase === "analyzing" || phase === "searching") && (
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  <div className="scan-line" style={{ position: "absolute", left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg, transparent 0%, #d1a38b 30%, #d1a38b 70%, transparent 100%)", boxShadow: "0 0 16px 3px rgba(209,163,139,.25)" }} />
                  <div style={{ position: "absolute", inset: 0, background: "rgba(8,8,10,.2)" }} />
                </div>
              )}
              {items.length > 0 && (
                <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(8,8,10,.8)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: "#d1a38b" }}>{items.length}</span>
                  <span style={{ fontSize: 11, color: "#999", lineHeight: 1.2 }}>pieces<br />found</span>
                </div>
              )}
            </div>

            {/* Progress */}
            {progress && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20, padding: "12px 0" }}>
                <div className="dot-loading" style={{ display: "flex", gap: 4 }}><span /><span /><span /></div>
                <span style={{ fontSize: 13, color: "#888" }}>{progress}</span>
              </div>
            )}

            {/* Results */}
            {items.length > 0 && (
              <div>
                {/* Total bar */}
                {phase === "done" && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(209,163,139,.04)", border: "1px solid rgba(209,163,139,.08)", borderRadius: 12, marginBottom: 14 }}>
                    <span style={{ fontSize: 12, color: "#888" }}>Estimated total</span>
                                        <span style={{ fontSize: 18, fontWeight: 600, color: "#d1a38b" }}>
                                          {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                                        </span>
                                      </div>
                                    )}
                    
                                    {/* Item list */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                      {items.map((it, idx) => (
                                        <div
                                          key={idx}
                                          className="item-row"
                                          onClick={() => setExpandedItem(expandedItem === idx ? null : idx)}
                                          style={{
                                            padding: "14px 16px",
                                            background: expandedItem === idx ? "#151518" : "rgba(255,255,255,.02)",
                                            border: "1px solid rgba(255,255,255,.06)",
                                            borderRadius: 12,
                                            cursor: "pointer",
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(209,163,139,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#d1a38b" }}>
                                              <CatIcon cat={it.category} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: 13, fontWeight: 500, color: "#ccc", marginBottom: 3 }}>{it.category}</div>
                                              <div style={{ fontSize: 11, color: "#666", lineHeight: 1.3 }}>{it.description}</div>
                                              {it.product && (
                                                <div style={{ fontSize: 10, color: "#d1a38b", marginTop: 4, fontWeight: 500 }}>
                                                  {it.product.brand} · {it.product.retailer}
                                                </div>
                                              )}
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                                              {it.product?.price && (
                                                <div style={{ fontSize: 12, fontWeight: 600, color: "#d1a38b" }}>
                                                  {it.product.price}
                                                </div>
                                              )}
                                              {it.product?.match_confidence && (
                                                <div
                                                  style={{
                                                    fontSize: 9,
                                                    fontWeight: 600,
                                                    color: "#08080a",
                                                    background: CONF[it.product.match_confidence],
                                                    padding: "3px 8px",
                                                    borderRadius: 6,
                                                  }}
                                                >
                                                  {CONF_LABEL[it.product.match_confidence]}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                    
                                          {expandedItem === idx && it.product && (
                                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.04)" }}>
                                              {it.product.thumbnail && (
                                                <img
                                                  src={it.product.thumbnail}
                                                  alt={it.product.product_name}
                                                  style={{ width: "100%", borderRadius: 8, marginBottom: 10, maxHeight: 180, objectFit: "cover" }}
                                                />
                                              )}
                                              <div style={{ fontSize: 12, color: "#bbb", marginBottom: 10 }}>
                                                {it.product.product_name}
                                              </div>
                                              {it.product.match_confidence !== "low" && (
                                                <button
                                                  className="shop-btn"
                                                  onClick={() => {
                                                    handleShopClick(it);
                                                    window.open(buildAffiliateUrl(it.product!.url, it.product!.retailer), "_blank");
                                                  }}
                                                  style={{
                                                    width: "100%",
                                                    background: "linear-gradient(135deg, #d1a38b, #b8806a)",
                                                    color: "#08080a",
                                                    border: "none",
                                                    padding: "11px 16px",
                                                    borderRadius: 10,
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    fontFamily: "inherit",
                                                    cursor: "pointer",
                                                  }}
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
                                                style={{
                                                  width: "100%",
                                                  background: it.product.match_confidence === "low" ? "rgba(255,255,255,.04)" : "transparent",
                                                  color: it.product.match_confidence === "low" ? "#ccc" : "#888",
                                                  border: "1px solid rgba(255,255,255,.08)",
                                                  padding: "10px 16px",
                                                  borderRadius: 10,
                                                  fontSize: 12,
                                                  fontWeight: it.product.match_confidence === "low" ? 600 : 500,
                                                  fontFamily: "inherit",
                                                  cursor: "pointer",
                                                  marginTop: it.product.match_confidence === "low" ? 0 : 8,
                                                }}
                                              >
                                                {it.product.match_confidence === "low" ? "Browse similar items" : "Find similar on Google"}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }