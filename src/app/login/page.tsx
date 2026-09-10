"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in uses a 6-digit code rather than a magic link.
 *
 * A magic link cannot work reliably for an installed PWA: the PKCE code
 * verifier is stored by the browser that requested the link, but the email
 * opens in whatever the default browser is — and on iOS a home-screen web app
 * has its own storage jar separate from Safari. The verifier is then missing,
 * the exchange fails, and the user is bounced back to the email form. Typing a
 * code keeps the whole exchange inside the app that asked for it.
 */
export default function LoginPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });

    setBusy(false);
    if (error) setError(error.message);
    else {
      setCode("");
      setStep("code");
    }
  }

  async function verify(token: string) {
    if (busy) return;
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });

    if (error) {
      setBusy(false);
      setError(error.message);
      setCode("");
      codeRef.current?.focus();
      return;
    }

    // Full navigation rather than a client route change, so the server picks up
    // the freshly written auth cookies on the very next request.
    window.location.href = "/";
  }

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

        {step === "email" ? (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
              Enter your email and we&rsquo;ll send you a six-digit code.
            </p>

            <form onSubmit={sendCode} style={{ marginTop: 22 }}>
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
                style={{
                  width: "100%",
                  fontSize: 16,
                  background: "var(--bg-card)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  padding: "14px 13px",
                  boxShadow: "var(--glow-accent)",
                  caretColor: "var(--accent)",
                  color: "var(--ink-1)",
                }}
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
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          </>
        ) : (
          <>
            <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
              Enter the six-digit code sent to <strong style={{ color: "var(--ink-1)" }}>{email}</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length === 6) void verify(code);
              }}
              style={{ marginTop: 22 }}
            >
              <input
                ref={codeRef}
                required
                inputMode="numeric"
                // Lets iOS offer the code straight from the Mail notification.
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                  if (next.length === 6) void verify(next);
                }}
                placeholder="000000"
                aria-label="Six-digit code"
                className="mono-meta"
                style={{
                  width: "100%",
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: "0.28em",
                  textAlign: "center",
                  background: "var(--bg-card)",
                  border: "1px solid var(--line-strong)",
                  borderRadius: 10,
                  padding: "14px 13px",
                  boxShadow: "var(--glow-accent)",
                  caretColor: "var(--accent)",
                  color: "var(--ink-1)",
                }}
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
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
                {busy ? "Checking…" : "Sign in"}
              </button>
            </form>

            <div className="flex items-center justify-between" style={{ marginTop: 16, gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                  setCode("");
                }}
                className="mono-meta"
                style={{ fontSize: 11, color: "var(--ink-3)", minHeight: 44 }}
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={busy}
                className="mono-meta disabled:opacity-50"
                style={{ fontSize: 11, color: "var(--accent)", minHeight: 44 }}
              >
                Resend code
              </button>
            </div>
          </>
        )}

        {error && (
          <p style={{ fontSize: 13, color: "var(--status-overdue)", marginTop: 12 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
