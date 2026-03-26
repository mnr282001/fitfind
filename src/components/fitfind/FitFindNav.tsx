"use client";

import Link from "next/link";
import { JSX } from "react";
import { FitFindUser } from "@/components/fitfind/shared";

type Props = {
  user: FitFindUser | null;
  isAdmin: boolean;
  remaining: number;
  limit: number;
  showReset: boolean;
  onReset: () => void;
  onSignOut: () => void;
};

export function FitFindNav({ user, isAdmin, remaining, limit, showReset, onReset, onSignOut }: Props): JSX.Element {
  return (
    <div
      className="ff-nav"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 0",
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(to bottom, rgba(7,7,10,.88) 72%, transparent)",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>FIT</span>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#d1a38b" }}>FIND</span>
        {user && (
          <span style={{ fontSize: 10, fontWeight: 500, color: "#555", marginLeft: 8 }}>
            {remaining}/{limit}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {user && (
          <>
            {isAdmin && (
              <Link
                href="/admin"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#d1a38b",
                  textDecoration: "none",
                  border: "1px solid rgba(209,163,139,.35)",
                  borderRadius: 999,
                  padding: "6px 10px",
                }}
              >
                Admin
              </Link>
            )}
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
              {user.email ?? `${user.id.slice(0, 8)}...`}
            </span>
            <button
              type="button"
              onClick={onSignOut}
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
        {user && showReset && (
          <button
            onClick={onReset}
            style={{
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 100,
              color: "#aaa",
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            + New
          </button>
        )}
      </div>
    </div>
  );
}
