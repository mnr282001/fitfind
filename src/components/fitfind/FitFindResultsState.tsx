"use client";

import { CSSProperties, JSX, RefObject } from "react";
import {
  buildAffiliateUrl,
  CONF,
  CONF_LABEL,
  CONF_TEXT,
  MatchConfidence,
  OutfitItem,
  Phase,
  TIMELINE_STEPS,
  getTimelineStep,
} from "@/components/fitfind/shared";

function CatIcon({ cat }: { cat: string }): JSX.Element {
  const c = cat.toLowerCase();
  const s: CSSProperties = { width: "100%", height: "100%" };
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: s,
  };

  if (["top", "shirt", "blouse", "jacket", "outerwear", "coat", "sweater", "hoodie"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <path d="M12 3L8 7H4v4l-1.5 1.5V20h19v-7.5L20 11V7h-4l-4-4z" />
      </svg>
    );
  }
  if (["bottom", "pant", "jean", "skirt", "short", "trouser"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <path d="M6 2h12v7l-2 13h-3L12 12l-1 10H8L6 9V2z" />
      </svg>
    );
  }
  if (["shoe", "sneaker", "boot", "sandal", "heel"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <path d="M3 18h18v2H3zM5 14l4-6h4l5 2 3-1v5H5z" />
      </svg>
    );
  }
  if (["bag", "purse", "clutch", "tote", "backpack"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <path d="M6 8V6a6 6 0 0112 0v2" />
        <rect x="3" y="8" width="18" height="14" rx="2" />
      </svg>
    );
  }
  if (["hat", "cap", "beanie"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <path d="M3 16h18M5 16c0-4 2.5-8 7-10 4.5 2 7 6 7 10" />
      </svg>
    );
  }
  if (["glass", "eyewear", "sunglass"].some((k) => c.includes(k))) {
    return (
      <svg {...props}>
        <circle cx="7" cy="14" r="4" />
        <circle cx="17" cy="14" r="4" />
        <path d="M11 14h2M3 14H2M22 14h-1M7 10V6M17 10V6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l2 2" />
    </svg>
  );
}

type Props = {
  image: string;
  phase: Phase;
  identifiedCount: number;
  items: OutfitItem[];
  total: number;
  progress: string;
  expandedItem: number | null;
  timelineRef: RefObject<HTMLDivElement | null>;
  resultsAnchorRef: RefObject<HTMLDivElement | null>;
  onToggleExpanded: (idx: number) => void;
  onShopClick: (item: OutfitItem) => void;
};

export function FitFindResultsState({
  image,
  phase,
  identifiedCount,
  items,
  total,
  progress,
  expandedItem,
  timelineRef,
  resultsAnchorRef,
  onToggleExpanded,
  onShopClick,
}: Props): JSX.Element {
  const timelineStep = getTimelineStep(phase);
  const isProcessing = phase === "analyzing" || phase === "searching";
  const resolvedCount = items.filter((it) => Boolean(it.product)).length;

  return (
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
            {phase === "done" && <span className="ff-tag">Estimated total {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>}
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
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: done ? "#6ee7b7" : active ? "#e7bfab" : "#867b72", marginBottom: 6 }}>{done ? "Done" : active ? "Active" : "Waiting"}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#efe7de" }}>{step}</div>
              </div>
            );
          })}
        </div>
      )}

      {progress && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div className="dot-loading" style={{ display: "flex", gap: 4 }}>
            <span />
            <span />
            <span />
          </div>
          <span style={{ fontSize: 13 }}>{progress}</span>
        </div>
      )}

      {items.length > 0 && (
        <div>
          {phase === "done" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "linear-gradient(135deg, rgba(209,163,139,.10), rgba(209,163,139,.04))", border: "1px solid rgba(209,163,139,.18)", borderRadius: 14, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: "#b9afa5" }}>Estimated total</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: "#d1a38b" }}>{total.toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
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
                <div key={`${it.category}-${idx}`} className={`result-item ${resolved ? "resolved" : "pending"} item-row`} onClick={() => (resolved ? onToggleExpanded(idx) : undefined)} style={{ cursor: resolved ? "pointer" : "default" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(209,163,139,.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#d1a38b" }}>
                      <CatIcon cat={it.category} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#e2dbd2", marginBottom: 3 }}>{it.category}</div>
                      <div style={{ fontSize: 11, color: "#9e958c", lineHeight: 1.35 }}>{it.description}</div>
                      {resolved ? (
                        <div style={{ fontSize: 10, color: "#d1a38b", marginTop: 4, fontWeight: 500 }}>
                          {it.product?.brand} - {it.product?.retailer}
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
                            <div style={{ fontSize: 9, fontWeight: 600, color: CONF_TEXT[it.product.match_confidence as MatchConfidence], background: CONF[it.product.match_confidence as MatchConfidence], padding: "3px 8px", borderRadius: 6 }}>
                              {CONF_LABEL[it.product.match_confidence as MatchConfidence]}
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
                      {it.product.thumbnail && <img src={it.product.thumbnail} alt={it.product.product_name} style={{ width: "100%", borderRadius: 8, marginBottom: 10, maxHeight: 180, objectFit: "cover" }} />}
                      <div style={{ fontSize: 12, color: "#d3cbc2", marginBottom: 10 }}>{it.product.product_name}</div>
                      {it.product.match_confidence !== "low" && (
                        <button
                          className="shop-btn"
                          onClick={() => {
                            onShopClick(it);
                            window.open(buildAffiliateUrl(it.product!.url), "_blank");
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
  );
}
