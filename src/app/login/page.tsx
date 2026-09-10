"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Email and password, deliberately.
 *
 * Magic links cannot work reliably for an installed PWA: the PKCE code
 * verifier lives in the browser that requested the link, but the email opens
 * in whatever the default browser is — and on iOS a home-screen web app has
 * its own storage jar, separate from Safari. The verifier is missing, the
 * exchange fails, and the user lands back on this form.
 *
 * A six-digit code would fix that, but Supabase only emails one if the Magic
 * Link template is edited, which requires custom SMTP. A password needs no
 * email delivery at all, and the session is written by the app the credentials
 * were typed into — which is exactly what an installed PWA needs.
 */
export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;

    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }

      // With email confirmations enabled Supabase returns a user but no
      // session, and nothing further can happen without a delivered email.
      if (!data.session) {
        setBusy(false);
        setNotice(
          "Account created, but email confirmation is switched on — turn it off in Supabase under Authentication → Providers → Email, then sign in.",
        );
        setMode("signin");
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
    }

    // Full navigation, so the server sees the freshly written auth cookies on
    // the very next request rather than after a client-side route change.
    window.location.href = "/";
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    // 16px minimum, or iOS zooms the page on focus.
    fontSize: 16,
    background: "var(--bg-card)",
    border: "1px solid var(--line-strong)",
    borderRadius: 10,
    padding: "14px 13px",
    caretColor: "var(--accent)",
    color: "var(--ink-1)",
  };

  return (
    <div
      className="safe-x flex items-center justify-center"
      style={{ minHeight: "100dvh", background: "var(--bg-base)", padding: 24 }}
    >
      <div style={{ width: "100%", maxWidth: 340 }}>
        <span
          style={{
            display: "block",
            width: 11,
            height: 11,
            borderRadius: 2,
            background: "var(--accent)",
            marginBottom: 18,
          }}
          aria-hidden
        />
        <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
          {mode === "signin"
            ? "Sign in to your board."
            : "Create your account. You only do this once."}
        </p>

        <form onSubmit={submit} style={{ marginTop: 22 }}>
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email address"
            style={{ ...fieldStyle, boxShadow: "var(--glow-accent)" }}
          />
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            style={{ ...fieldStyle, marginTop: 10 }}
          />
          <button
            type="submit"
            disabled={busy}
            className="mono-meta w-full font-semibold disabled:opacity-50"
            style={{
              marginTop: 12,
              minHeight: 50,
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontSize: 12,
              letterSpacing: "0.07em",
            }}
          >
            {busy
              ? mode === "signin"
                ? "Signing in…"
                : "Creating…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          className="mono-meta"
          style={{ marginTop: 14, fontSize: 11, color: "var(--ink-3)", minHeight: 44 }}
        >
          {mode === "signin" ? "Create an account" : "I already have an account"}
        </button>

        {error && (
          <p style={{ fontSize: 13, color: "var(--status-overdue)", marginTop: 8 }}>{error}</p>
        )}
        {notice && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--status-inprog)", marginTop: 8 }}>
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
