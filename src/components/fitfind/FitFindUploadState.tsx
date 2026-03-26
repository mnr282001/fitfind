"use client";

import { ChangeEvent, DragEvent, JSX, RefObject } from "react";
import { CONFIG } from "@/components/fitfind/shared";

type Props = {
  isAdmin?: boolean;
  adminSummary?: unknown;
  adminSummaryError?: string;
  dragOver: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  error: string;
  showUpgrade: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onOpenPicker: () => void;
  onFileInput: (e: ChangeEvent<HTMLInputElement>) => void;
};

export function FitFindUploadState({
  dragOver,
  fileRef,
  error,
  showUpgrade,
  onDragOver,
  onDragLeave,
  onDrop,
  onOpenPicker,
  onFileInput,
}: Props): JSX.Element {
  return (
    <div style={{ paddingTop: 20 }}>
      <div className="ff-panel card-enter" style={{ padding: "28px 18px 20px", marginBottom: 14 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 400, lineHeight: 1.15, marginBottom: 10 }}>
            Snap a fit.
            <br />
            <span style={{ fontStyle: "italic", color: "#d1a38b" }}>Shop every piece.</span>
          </h1>
          <p style={{ fontSize: 14, color: "#9e958c", fontWeight: 300, maxWidth: 300, margin: "0 auto", lineHeight: 1.55 }}>
            Upload any outfit photo and we&apos;ll identify each item with links to buy.
          </p>
        </div>

        <div
          className="upload-zone"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={onOpenPicker}
          style={{
            width: "100%",
            aspectRatio: "3/4",
            maxHeight: "55dvh",
            borderRadius: 20,
            border: `1.5px dashed ${dragOver ? "#d1a38b" : "rgba(255,255,255,.18)"}`,
            background: dragOver ? "rgba(209,163,139,.06)" : "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileInput} />
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
            <span key={t} style={{ fontSize: 11, color: "#91877d", border: "1px solid rgba(255,255,255,.09)", borderRadius: 100, padding: "6px 12px", background: "rgba(255,255,255,.015)" }}>
              {t}
            </span>
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
              Go Pro - ${CONFIG.tiers.pro.priceMonthly}/mo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
