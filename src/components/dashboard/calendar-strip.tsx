"use client";

import Link from "next/link";
import { useTodaysEvents } from "@/lib/hooks/use-data";
import { clearAfter, totalBookedMinutes } from "@/lib/derive";
import { durationLabel, hhmm } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types";

const CATEGORY_COLOUR: Record<string, string> = {
  default: "var(--status-todo)",
  meeting: "var(--status-inprog)",
  focus: "var(--accent)",
  personal: "var(--status-done)",
};

/** Minutes since midnight, local. */
function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The artboard hardcodes pixel offsets. Here positions are computed from each
 * event's start/end against the day's visible window, which defaults to
 * 08:00–18:00 and widens to fit anything outside it.
 */
function visibleWindow(events: CalendarEvent[]): { start: number; end: number } {
  let start = 8 * 60;
  let end = 18 * 60;
  for (const e of events) {
    start = Math.min(start, minutesOfDay(e.starts_at));
    end = Math.max(end, minutesOfDay(e.ends_at));
  }
  // Always keep at least a 4-hour window so a single short event isn't stretched.
  if (end - start < 240) end = start + 240;
  return { start, end };
}

export function CalendarStrip() {
  const { data: events } = useTodaysEvents();
  const list = events ?? [];

  // The strip holds its place even with nothing in it: a row that appears and
  // disappears makes the whole dashboard jump, and "nothing today" is itself
  // useful information when you are picking three things to focus on.
  if (list.length === 0) {
    return (
      <div
        className="flex flex-wrap items-baseline justify-between rounded-[10px]"
        style={{
          background: "var(--bg-chrome)",
          border: "1px solid var(--line-softer)",
          padding: "13px 16px",
          gap: 10,
        }}
      >
        <div className="flex flex-wrap items-baseline" style={{ gap: 12 }}>
          <span className="mono-label" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Today&rsquo;s Calendar
          </span>
          <span
            className="mono-meta font-medium"
            style={{ fontSize: 11, color: "var(--ink-3-quiet)" }}
          >
            Nothing scheduled today · read only
          </span>
        </div>
        <Link
          href="/settings"
          className="mono-meta font-medium"
          style={{ fontSize: 11, color: "var(--accent)" }}
        >
          Manage calendars
        </Link>
      </div>
    );
  }

  const { start, end } = visibleWindow(list);
  const span = end - start;
  const pct = (mins: number) => ((mins - start) / span) * 100;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowVisible = nowMins >= start && nowMins <= end;

  const booked = totalBookedMinutes(list);
  const clear = clearAfter(list);

  return (
    <div
      className="rounded-[10px]"
      style={{
        background: "var(--bg-chrome)",
        border: "1px solid var(--line-softer)",
        padding: "13px 16px 15px",
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
        <div className="flex flex-wrap items-baseline" style={{ gap: 12 }}>
          <span className="mono-label" style={{ fontSize: 11, color: "var(--ink-3)" }}>
            Today&rsquo;s Calendar
          </span>
          <span
            className="mono-meta font-medium"
            style={{ fontSize: 11, color: "var(--ink-3-quiet)" }}
          >
            {list.length} event{list.length === 1 ? "" : "s"} · {durationLabel(booked)} booked ·
            read only
          </span>
        </div>
        {clear && (
          <span className="mono-meta font-medium" style={{ fontSize: 11, color: "var(--accent)" }}>
            Clear after {hhmm(clear)}
          </span>
        )}
      </div>

      <div className="relative" style={{ height: 40, marginTop: 12 }}>
        <div
          className="absolute inset-x-0"
          style={{ top: 14, height: 1, background: "var(--line-softer)" }}
        />

        {list.map((event) => {
          const from = minutesOfDay(event.starts_at);
          const to = minutesOfDay(event.ends_at);
          const left = Math.max(0, pct(from));
          const width = Math.max(pct(to) - pct(from), 6);

          return (
            <div
              key={event.id}
              className="absolute flex items-center overflow-hidden"
              style={{
                left: `${left}%`,
                width: `${Math.min(width, 100 - left)}%`,
                top: 0,
                height: 28,
                borderRadius: 6,
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                borderLeft: `2px solid ${CATEGORY_COLOUR[event.category] ?? CATEGORY_COLOUR.default}`,
                padding: "0 11px",
                gap: 8,
              }}
              title={`${hhmm(new Date(event.starts_at))} ${event.title}`}
            >
              <span
                className="mono-meta shrink-0 font-semibold"
                style={{ fontSize: 10.5, color: "var(--ink-3)" }}
              >
                {hhmm(new Date(event.starts_at))}
              </span>
              <span
                className="min-w-0 flex-1 truncate"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-1)" }}
              >
                {event.title}
              </span>
              <span
                className="mono-meta hidden shrink-0 sm:inline"
                style={{ fontSize: 10, color: "var(--ink-3-quiet)" }}
              >
                {durationLabel(to - from)}
              </span>
            </div>
          );
        })}

        {nowVisible && (
          <div
            className="absolute"
            style={{ left: `${pct(nowMins)}%`, top: 0, bottom: 0 }}
            aria-hidden
          >
            <div style={{ width: 1.5, height: 28, background: "var(--accent)" }} />
            <span
              className="mono-meta absolute font-semibold"
              style={{ fontSize: 9.5, color: "var(--accent)", top: 29, left: -8 }}
            >
              Now
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
