"use client";

import { CalendarPlus, Check, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/components/providers";
import { keys } from "@/lib/hooks/use-data";
import {
  addSubscription,
  deleteSubscription,
  fetchSubscriptions,
  isValidIcsUrl,
  syncCalendars,
  updateSubscription,
} from "@/lib/db/calendar";
import { hhmm, shortDate } from "@/lib/format";
import { Toggle } from "@/components/ui/primitives";
import type { CalendarSubscription } from "@/lib/types";

const SUBS_KEY = ["calendar_subscriptions"] as const;

const COLOURS: { value: CalendarSubscription["colour"]; label: string; token: string }[] = [
  { value: "meeting", label: "Amber", token: "var(--status-inprog)" },
  { value: "default", label: "Grey", token: "var(--status-todo)" },
  { value: "personal", label: "Green", token: "var(--status-done)" },
  { value: "focus", label: "Accent", token: "var(--accent)" },
];

/**
 * Apple Calendar and Google both expose a plain .ics feed. The browser can't
 * read one directly (CORS), so the URL is stored and an edge function fetches
 * it on a schedule.
 */
export function CalendarSubscriptions() {
  const { supabase, userId } = useSession();
  const qc = useQueryClient();
  const { data: subs, isLoading } = useQuery({
    queryKey: SUBS_KEY,
    queryFn: () => fetchSubscriptions(supabase),
  });

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const list = subs ?? [];
  const urlOk = url.trim() === "" || isValidIcsUrl(url);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: SUBS_KEY });
    await qc.invalidateQueries({ queryKey: keys.events });
  }

  async function add() {
    if (!isValidIcsUrl(url)) return;
    setBusy("add");
    try {
      const created = await addSubscription(supabase, userId, name, url);
      setName("");
      setUrl("");
      setAdding(false);
      await refresh();
      setNote("Added — fetching events…");
      const res = await syncCalendars(supabase, created.id);
      setNote(res.ok ? "Calendar synced." : `Sync failed: ${res.error}`);
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not add that calendar.");
    } finally {
      setBusy(null);
    }
  }

  async function sync(id?: string) {
    setBusy(id ?? "all");
    setNote(null);
    try {
      const res = await syncCalendars(supabase, id);
      setNote(res.ok ? "Synced." : `Sync failed: ${res.error}`);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section style={{ marginTop: 26 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
        <span className="mono-label" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
          Calendars
        </span>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy !== null}
            className="mono-meta font-semibold disabled:opacity-40"
            style={{ fontSize: 10.5, color: "var(--accent)", minHeight: 44 }}
          >
            <RefreshCw
              size={11}
              strokeWidth={2.5}
              className={`mr-1.5 inline align-[-1px] ${busy === "all" ? "animate-spin" : ""}`}
            />
            Sync all
          </button>
        )}
      </div>

      <div
        className="overflow-hidden rounded-[12px]"
        style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
      >
        {isLoading && (
          <p style={{ padding: 16, fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>
        )}

        {!isLoading && list.length === 0 && !adding && (
          <p style={{ padding: 16, fontSize: 13, lineHeight: 1.5, color: "var(--ink-3)" }}>
            No calendars yet. Add your Apple Calendar to see today&rsquo;s events above the
            board.
          </p>
        )}

        {list.map((sub, i) => (
          <div
            key={sub.id}
            style={{
              padding: "14px 16px",
              borderTop: i === 0 ? undefined : "1px solid var(--line-softer)",
            }}
          >
            <div className="flex items-center" style={{ gap: 11 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  flexShrink: 0,
                  background:
                    COLOURS.find((c) => c.value === sub.colour)?.token ?? "var(--status-todo)",
                }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div style={{ fontSize: 15.5, fontWeight: 500, color: "var(--ink-1)" }}>
                  {sub.name}
                </div>
                <div
                  className="mono-meta"
                  style={{ fontSize: 10, marginTop: 3, color: "var(--ink-3)" }}
                >
                  {sub.last_error ? (
                    <span style={{ color: "var(--status-overdue)" }}>
                      <TriangleAlert size={10} className="mr-1 inline align-[-1px]" />
                      {sub.last_error.slice(0, 60)}
                    </span>
                  ) : sub.last_synced_at ? (
                    <>
                      {sub.last_event_count ?? 0} events · synced{" "}
                      {shortDate(new Date(sub.last_synced_at))}{" "}
                      {hhmm(new Date(sub.last_synced_at))}
                    </>
                  ) : (
                    "Not synced yet"
                  )}
                </div>
              </div>

              <Toggle
                checked={sub.enabled}
                label={`${sub.name} enabled`}
                size="small"
                onChange={async (v) => {
                  await updateSubscription(supabase, sub.id, { enabled: v });
                  await refresh();
                }}
              />
            </div>

            <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => void sync(sub.id)}
                disabled={busy !== null}
                className="mono-meta flex items-center justify-center rounded-[8px] font-semibold disabled:opacity-40"
                style={{
                  minHeight: 44,
                  flex: 1,
                  gap: 6,
                  fontSize: 10.5,
                  background: "var(--bg-base)",
                  border: "1px solid var(--line-soft)",
                  color: "var(--ink-2)",
                }}
              >
                <RefreshCw size={12} className={busy === sub.id ? "animate-spin" : ""} />
                Sync now
              </button>

              <div className="flex" style={{ gap: 4 }}>
                {COLOURS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-label={`Colour ${c.label}`}
                    onClick={async () => {
                      await updateSubscription(supabase, sub.id, { colour: c.value });
                      await refresh();
                    }}
                    className="flex items-center justify-center rounded-[6px]"
                    style={{
                      width: 32,
                      height: 44,
                      border:
                        sub.colour === c.value
                          ? "1px solid var(--line-strong)"
                          : "1px solid transparent",
                    }}
                  >
                    <span
                      style={{ width: 12, height: 12, borderRadius: 3, background: c.token }}
                    />
                  </button>
                ))}
              </div>

              <button
                type="button"
                aria-label={`Remove ${sub.name}`}
                onClick={async () => {
                  if (confirmDelete !== sub.id) return setConfirmDelete(sub.id);
                  await deleteSubscription(supabase, sub.id);
                  setConfirmDelete(null);
                  await refresh();
                }}
                onBlur={() => setConfirmDelete(null)}
                className="mono-meta flex items-center justify-center rounded-[8px] font-semibold"
                style={{
                  minHeight: 44,
                  padding: "0 10px",
                  fontSize: 10.5,
                  border: "1px solid var(--line-soft)",
                  color: "var(--status-overdue)",
                }}
              >
                {confirmDelete === sub.id ? "Sure?" : <Trash2 size={13} />}
              </button>
            </div>
          </div>
        ))}

        {adding && (
          <div
            style={{
              padding: 16,
              borderTop: list.length ? "1px solid var(--line-softer)" : undefined,
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Calendar name"
              aria-label="Calendar name"
              style={{
                width: "100%",
                fontSize: 15,
                minHeight: 44,
                background: "var(--bg-card)",
                border: "1px solid var(--line-soft)",
                borderRadius: 8,
                padding: "0 12px",
                color: "var(--ink-1)",
              }}
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="webcal://p01-calendars.icloud.com/published/…"
              aria-label="iCal URL"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: "100%",
                marginTop: 8,
                fontSize: 13,
                minHeight: 44,
                background: "var(--bg-card)",
                border: `1px solid ${urlOk ? "var(--line-strong)" : "var(--status-overdue)"}`,
                borderRadius: 8,
                padding: "0 12px",
                color: "var(--ink-1)",
                caretColor: "var(--accent)",
              }}
            />
            {!urlOk && (
              <p style={{ fontSize: 12, color: "var(--status-overdue)", marginTop: 6 }}>
                That doesn&rsquo;t look like a webcal:// or https:// .ics link.
              </p>
            )}
            <div className="flex" style={{ gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => void add()}
                disabled={!isValidIcsUrl(url) || busy !== null}
                className="mono-meta flex-1 rounded-[8px] font-semibold disabled:opacity-40"
                style={{
                  minHeight: 44,
                  fontSize: 11,
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                }}
              >
                <Check size={12} className="mr-1.5 inline align-[-1px]" />
                Add calendar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setUrl("");
                  setName("");
                }}
                className="mono-meta rounded-[8px] font-semibold"
                style={{
                  minHeight: 44,
                  padding: "0 14px",
                  fontSize: 11,
                  border: "1px solid var(--line-soft)",
                  color: "var(--ink-3)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mono-meta flex w-full items-center justify-center font-semibold"
          style={{
            marginTop: 10,
            minHeight: 48,
            gap: 7,
            borderRadius: 10,
            border: "1px dashed var(--line-dashed)",
            color: "var(--accent)",
            fontSize: 11,
          }}
        >
          <CalendarPlus size={13} strokeWidth={2.25} />
          Add calendar
        </button>
      )}

      {note && (
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10 }}>{note}</p>
      )}

      <details style={{ marginTop: 12 }}>
        <summary
          className="mono-meta"
          style={{ fontSize: 10.5, color: "var(--ink-3)", cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}
        >
          How do I get my Apple Calendar link?
        </summary>
        <div
          style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 6 }}
        >
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--ink-1)" }}>On a Mac:</strong> open Calendar,
            right-click the calendar in the sidebar → Share Calendar → tick{" "}
            <em>Public Calendar</em>, then copy the <code>webcal://</code> link.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: "var(--ink-1)" }}>On iPhone:</strong> Calendar → Calendars
            → the ⓘ next to a calendar → turn on <em>Public Calendar</em> → Share Link.
          </p>
          <p style={{ color: "var(--ink-3)" }}>
            Anyone with that link can read the calendar, so treat it like a password. It syncs
            one-way and read-only — nothing here ever writes back to Apple.
          </p>
        </div>
      </details>
    </section>
  );
}
