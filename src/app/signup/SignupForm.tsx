"use client";

import { useState, type CSSProperties, type FormEvent, type JSX } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupForm(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
      setMessage("Check your email to confirm your account, then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#08080a",
        color: "#eae6df",
        fontFamily: "'Outfit','Helvetica Neue',sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}>FIT</span>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "#d1a38b" }}>
            FIND
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 20, color: "#ccc" }}>Create account</h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            Password must be at least 6 characters (Supabase default).
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#888" }}>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#888" }}>
            Password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </label>

          {error && (
            <div
              style={{
                fontSize: 13,
                color: "#f87171",
                padding: "10px 12px",
                background: "rgba(248,113,113,.08)",
                borderRadius: 10,
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                fontSize: 13,
                color: "#34d399",
                padding: "10px 12px",
                background: "rgba(52,211,153,.08)",
                borderRadius: 10,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: "linear-gradient(135deg, #d1a38b, #b8806a)",
              color: "#08080a",
              border: "none",
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Creating…" : "Sign up"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#666" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#d1a38b", fontWeight: 500 }}>
            Sign in
          </Link>
        </p>
        <p style={{ textAlign: "center", marginTop: 12 }}>
          <Link href="/" style={{ fontSize: 12, color: "#555" }}>
            ← Back to app
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: "rgba(0,0,0,.35)",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 10,
  padding: "11px 14px",
  fontSize: 15,
  color: "#eae6df",
  fontFamily: "inherit",
  outline: "none",
};
