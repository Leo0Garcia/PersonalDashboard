"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/components/providers";

/**
 * Sets a password on the signed-in account.
 *
 * Accounts created by a magic link have no usable password — Supabase writes a
 * placeholder hash — so signing in with a password fails, and signing up again
 * is refused because the account already exists. updateUser closes that gap
 * using the session the user already has, which is the only route in that
 * needs no email delivery.
 */
export function AccountPassword() {
  const { supabase } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !busy;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    setDone(false);

    const { error } = await supabase.auth.updateUser({ password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setDone(true);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 16,
    background: "var(--bg-card)",
    border: "1px solid var(--line-soft)",
    borderRadius: 8,
    padding: "12px 13px",
    minHeight: 44,
    caretColor: "var(--accent)",
    color: "var(--ink-1)",
  };

  return (
    <section style={{ marginTop: 26 }}>
      <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
        Account
      </span>

      <div
        className="rounded-[12px]"
        style={{
          marginTop: 10,
          background: "var(--bg-panel)",
          border: "1px solid var(--line-soft)",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 15.5, fontWeight: 500, color: "var(--ink-1)" }}>
          Set a password
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-3)", marginTop: 4 }}>
          Lets you sign in on another device without an email round-trip.
        </p>

        <form onSubmit={save} style={{ marginTop: 12 }}>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            style={fieldStyle}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            aria-label="Confirm password"
            style={{ ...fieldStyle, marginTop: 8 }}
          />

          {tooShort && (
            <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
              At least 8 characters.
            </p>
          )}
          {mismatch && (
            <p style={{ fontSize: 12, color: "var(--status-overdue)", marginTop: 6 }}>
              Those don&rsquo;t match.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mono-meta w-full font-semibold disabled:opacity-40"
            style={{
              marginTop: 10,
              minHeight: 44,
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--on-accent)",
              fontSize: 11,
              letterSpacing: "0.06em",
            }}
          >
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>

        {done && (
          <p style={{ fontSize: 12.5, color: "var(--status-done)", marginTop: 10 }}>
            Password set. Sign in on your phone with this email and password.
          </p>
        )}
        {error && (
          <p style={{ fontSize: 12.5, color: "var(--status-overdue)", marginTop: 10 }}>{error}</p>
        )}

        <div style={{ borderTop: "1px solid var(--line-softer)", marginTop: 16, paddingTop: 12 }}>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="mono-meta flex items-center font-semibold"
            style={{ gap: 7, fontSize: 11, color: "var(--ink-3)", minHeight: 44 }}
          >
            <LogOut size={13} strokeWidth={2.25} />
            Sign out
          </button>
        </div>
      </div>
    </section>
  );
}
