"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div
      className="safe-x flex items-center justify-center"
      style={{ minHeight: "100dvh", background: "var(--bg-base)", padding: 24 }}
    >
      <div style={{ width: "100%", maxWidth: 340 }}>
        <span
          style={{ display: "block", width: 11, height: 11, borderRadius: 2, background: "var(--accent)", marginBottom: 18 }}
          aria-hidden
        />
        <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.15 }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 10 }}>
          {status === "sent"
            ? "Check your email — the link signs you in on this device."
            : "Sign in with a magic link. No password to forget."}
        </p>

        {status !== "sent" && (
          <form onSubmit={submit} style={{ marginTop: 22 }}>
            <input
              type="email"
              required
              autoComplete="email"
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
              disabled={status === "sending"}
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
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p style={{ fontSize: 13, color: "var(--status-overdue)", marginTop: 12 }}>{message}</p>
        )}
      </div>
    </div>
  );
}
