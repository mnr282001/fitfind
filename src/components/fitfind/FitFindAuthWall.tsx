"use client";

import Link from "next/link";
import { JSX } from "react";

export function FitFindAuthWall(): JSX.Element {
  return (
    <div style={{ paddingTop: 20, paddingBottom: 14 }}>
      <div className="ff-panel card-enter" style={{ padding: "30px 22px 22px", maxWidth: 500, margin: "0 auto 12px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(30px, 8vw, 44px)", fontWeight: 400, lineHeight: 1.08, marginBottom: 12 }}>
          Find every piece
          <br />
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
  );
}
