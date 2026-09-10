// sync-calendars
//
// Pulls every subscribed .ics feed (an Apple/iCloud published calendar, or
// any other webcal/https calendar URL) server-side and mirrors it into
// `calendar_events`, so the dashboard's read-only "today" strip can just
// query Postgres instead of fighting CORS against Apple/Google/etc.
//
// Invoked two ways:
//   - POST {} (or no body) by pg_cron on a schedule: syncs every enabled
//     subscription for every user.
//   - POST { subscription_id } by the app's "Sync now" button: syncs just
//     that one subscription (regardless of its enabled flag).
//
// Each subscription is fetched, parsed and written independently inside its
// own try/catch - one bad or slow feed must never take down the rest of the
// run, and a failed fetch/parse must never touch that subscription's
// previously-synced (still good) events.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import ICAL from "ical.js";

// The generated ical.js typings expose classes only as values on the default
// export, not as a type namespace - these aliases let us annotate with them.
type ICalComponent = InstanceType<typeof ICAL.Component>;
type ICalEvent = InstanceType<typeof ICAL.Event>;
type ICalTime = InstanceType<typeof ICAL.Time>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_PAST_MS = ONE_DAY_MS; // 1 day ago
const WINDOW_FUTURE_MS = 14 * ONE_DAY_MS; // 14 days ahead
const MAX_OCCURRENCES_PER_EVENT = 5000; // safety valve against runaway/open-ended RRULEs
const DB_BATCH_SIZE = 200;
const MAX_EXTERNAL_ID_LEN = 512;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = "PersonalDashboard-CalendarSync/1.0";

// ---------- types ----------

interface SubscriptionRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  colour: string;
  enabled: boolean;
}

interface CalendarEventInsert {
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  category: string;
  source: "ical";
  external_id: string;
  subscription_id: string;
}

interface SyncResult {
  ok: boolean;
  eventCount: number;
  error?: string;
}

interface RunSummary {
  subscriptions: number;
  synced: number;
  failed: number;
  events: number;
  errors: string[];
}

// ---------- URL + fetch ----------

/**
 * Apple hands out `webcal://` links for published calendars, and `fetch`
 * has no handler for that scheme. webcal is defined as "https with a
 * different scheme name", so a straight rewrite is all that's needed.
 * Anything that isn't http/https after normalising is rejected.
 */
function normalizeUrl(raw: string): URL | null {
  let candidate = raw.trim();
  const lower = candidate.toLowerCase();
  if (lower.startsWith("webcal://")) {
    candidate = "https://" + candidate.slice("webcal://".length);
  } else if (lower.startsWith("webcals://")) {
    candidate = "https://" + candidate.slice("webcals://".length);
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url;
}

async function fetchIcs(url: URL): Promise<string> {
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "text/calendar, text/plain, */*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`fetch failed with status ${res.status}`);
  }
  return await res.text();
}

function parseCalendar(icsText: string): ICalComponent {
  const jcal = ICAL.parse(icsText);
  return new ICAL.Component(jcal);
}

/** VTIMEZONEs must be registered before events are expanded, or any TZID
 * reference in the feed falls back to a floating/UTC guess instead of the
 * feed's real offset rules. */
function registerTimezones(comp: ICalComponent, subscriptionId: string): void {
  for (const vt of comp.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(vt);
    } catch (err) {
      console.warn(`sync-calendars: could not register a timezone for subscription ${subscriptionId}`, err);
    }
  }
}

// ---------- expansion ----------

interface VeventGroup {
  master: ICalComponent | null;
  exceptions: ICalComponent[];
}

/** Groups VEVENTs by UID: a plain event or the "master" of a recurring
 * series has no RECURRENCE-ID; each RECURRENCE-ID sibling overrides one
 * occurrence of that series (a moved/edited/cancelled instance). */
function groupVevents(comp: ICalComponent): Map<string, VeventGroup> {
  const groups = new Map<string, VeventGroup>();
  for (const vevent of comp.getAllSubcomponents("vevent")) {
    const uid = vevent.getFirstPropertyValue("uid");
    if (!uid) continue; // no stable key to store it under
    const key = String(uid);
    let group = groups.get(key);
    if (!group) {
      group = { master: null, exceptions: [] };
      groups.set(key, group);
    }
    if (vevent.hasProperty("recurrence-id")) {
      group.exceptions.push(vevent);
    } else {
      group.master = vevent;
    }
  }
  return groups;
}

function isCancelled(comp: ICalComponent): boolean {
  const status = comp.getFirstPropertyValue("status");
  return typeof status === "string" && status.toUpperCase() === "CANCELLED";
}

/**
 * All-day events (`DTSTART;VALUE=DATE`) carry no timezone at all, so we
 * anchor the calendar date to UTC midnight rather than the edge runtime's
 * local clock - deterministic no matter where this function runs. Either
 * way, a malformed feed (e.g. DTEND == DTSTART, or a zero/negative-duration
 * timed event) is clamped forward so we never hand the DB an `ends_at` that
 * fails the `ends_at > starts_at` check and aborts the whole batch.
 */
function occurrenceRange(start: ICalTime, end: ICalTime): { startsAt: Date; endsAt: Date } {
  if (start.isDate) {
    const startsAt = new Date(Date.UTC(start.year, start.month - 1, start.day));
    let endsAt = new Date(Date.UTC(end.year, end.month - 1, end.day));
    if (endsAt.getTime() <= startsAt.getTime()) {
      endsAt = new Date(startsAt.getTime() + ONE_DAY_MS);
    }
    return { startsAt, endsAt };
  }

  const startsAt = new Date(start.toUnixTime() * 1000);
  let endsAt = new Date(end.toUnixTime() * 1000);
  if (endsAt.getTime() <= startsAt.getTime()) {
    endsAt = new Date(startsAt.getTime() + 60_000);
  }
  return { startsAt, endsAt };
}

function buildExternalId(uid: string, recurrenceId?: ICalTime): string {
  const id = recurrenceId ? `${uid}::${recurrenceId.toICALString()}` : uid;
  return id.length > MAX_EXTERNAL_ID_LEN ? id.slice(0, MAX_EXTERNAL_ID_LEN) : id;
}

function toRow(
  sub: SubscriptionRow,
  event: ICalEvent,
  startsAt: Date,
  endsAt: Date,
  uid: string,
  recurrenceId: ICalTime | undefined,
): CalendarEventInsert {
  const rawTitle = event.summary;
  const title = (typeof rawTitle === "string" ? rawTitle : "").trim() || "(untitled event)";
  return {
    user_id: sub.user_id,
    title,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    category: sub.colour || "default",
    source: "ical",
    external_id: buildExternalId(uid, recurrenceId),
    subscription_id: sub.id,
  };
}

function expandEvents(sub: SubscriptionRow, comp: ICalComponent, now: Date): CalendarEventInsert[] {
  const windowStart = new Date(now.getTime() - WINDOW_PAST_MS).getTime();
  const windowEnd = new Date(now.getTime() + WINDOW_FUTURE_MS).getTime();
  const rows: CalendarEventInsert[] = [];

  for (const [uid, group] of groupVevents(comp)) {
    try {
      if (group.master) {
        const exceptionEvents = group.exceptions.map((c) => new ICAL.Event(c));
        const event = new ICAL.Event(group.master, { exceptions: exceptionEvents });

        if (event.isRecurring()) {
          // Expand RRULE/RDATE occurrences one at a time, starting from the
          // event's *true* DTSTART. We deliberately never seed the iterator
          // with a later "start near the window" date as an optimisation:
          // ical.js's RecurIterator has no notion of the rule's original
          // phase, so an arbitrary later dtstart silently misaligns any
          // INTERVAL>1 / BYDAY rule (e.g. "every other Tuesday"). We just
          // walk forward and skip/break based on the window instead.
          const iterator = event.iterator();
          let occurrenceTime: ICalTime | null;
          let iterations = 0;
          while ((occurrenceTime = iterator.next()) && iterations < MAX_OCCURRENCES_PER_EVENT) {
            iterations++;
            const details = event.getOccurrenceDetails(occurrenceTime);
            const { startsAt, endsAt } = occurrenceRange(details.startDate, details.endDate);
            if (startsAt.getTime() >= windowEnd) break; // occurrences come out in chronological order
            if (startsAt.getTime() < windowStart) continue;
            if (isCancelled(details.item.component)) continue;
            rows.push(toRow(sub, details.item, startsAt, endsAt, uid, details.recurrenceId));
          }
        } else {
          const { startsAt, endsAt } = occurrenceRange(event.startDate, event.endDate);
          if (startsAt.getTime() >= windowStart && startsAt.getTime() < windowEnd && !isCancelled(event.component)) {
            rows.push(toRow(sub, event, startsAt, endsAt, uid, undefined));
          }
        }
      } else {
        // Orphan RECURRENCE-ID overrides with no master in this feed
        // (e.g. the export window clipped it out): treat each as its own
        // standalone occurrence.
        for (const excComp of group.exceptions) {
          const excEvent = new ICAL.Event(excComp);
          const { startsAt, endsAt } = occurrenceRange(excEvent.startDate, excEvent.endDate);
          if (startsAt.getTime() >= windowStart && startsAt.getTime() < windowEnd && !isCancelled(excComp)) {
            rows.push(toRow(sub, excEvent, startsAt, endsAt, uid, excEvent.recurrenceId ?? undefined));
          }
        }
      }
    } catch (err) {
      // One malformed VEVENT (bad RRULE, etc.) must not sink the rest of
      // this feed's events.
      console.warn(`sync-calendars: failed to expand an event in subscription ${sub.id}`, err);
    }
  }

  return rows;
}

// ---------- persistence ----------

/**
 * Replace, don't accumulate: upsert the freshly-parsed occurrences first
 * (on conflict of subscription_id+external_id), then delete whatever was
 * already stored for this subscription in the sync window but is *not* in
 * the new set - that's how a deleted or moved event disappears instead of
 * lingering forever. Deleting only happens after every upsert batch has
 * landed, so a failure partway through never destroys previously-synced
 * (still good) events.
 */
async function replaceEvents(sub: SubscriptionRow, rows: CalendarEventInsert[], now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() - WINDOW_PAST_MS).toISOString();
  const windowEnd = new Date(now.getTime() + WINDOW_FUTURE_MS).toISOString();

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    const { error } = await admin
      .from("calendar_events")
      .upsert(batch, { onConflict: "subscription_id,external_id" });
    if (error) throw error;
  }

  const keepIds = new Set(rows.map((r) => r.external_id));

  const { data: existing, error: selectError } = await admin
    .from("calendar_events")
    .select("id, external_id")
    .eq("subscription_id", sub.id)
    .gte("starts_at", windowStart)
    .lt("starts_at", windowEnd);
  if (selectError) throw selectError;

  const staleIds = (existing ?? [])
    .filter((row: { id: string; external_id: string | null }) => !row.external_id || !keepIds.has(row.external_id))
    .map((row: { id: string }) => row.id);

  for (let i = 0; i < staleIds.length; i += DB_BATCH_SIZE) {
    const batch = staleIds.slice(i, i + DB_BATCH_SIZE);
    const { error } = await admin.from("calendar_events").delete().in("id", batch);
    if (error) throw error;
  }
}

/** last_event_count is left untouched on failure so it keeps reflecting the
 * last *successful* sync rather than being zeroed out by a transient error. */
async function recordFailure(subscriptionId: string, message: string): Promise<void> {
  const { error } = await admin
    .from("calendar_subscriptions")
    .update({ last_synced_at: new Date().toISOString(), last_error: message.slice(0, 2000) })
    .eq("id", subscriptionId);
  if (error) {
    console.error(`sync-calendars: failed to record failure for subscription ${subscriptionId}`, error);
  }
}

async function recordSuccess(subscriptionId: string, eventCount: number): Promise<void> {
  const { error } = await admin
    .from("calendar_subscriptions")
    .update({ last_synced_at: new Date().toISOString(), last_event_count: eventCount, last_error: null })
    .eq("id", subscriptionId);
  if (error) {
    console.error(`sync-calendars: failed to record success for subscription ${subscriptionId}`, error);
  }
}

// ---------- per-subscription sync ----------

async function syncSubscription(sub: SubscriptionRow, now: Date): Promise<SyncResult> {
  // Never log sub.url anywhere below - it's a read credential for someone's
  // calendar. The subscription id is the only identifier that goes to logs.
  const url = normalizeUrl(sub.url);
  if (!url) {
    const message = "invalid subscription URL (must be http(s):// or webcal://)";
    await recordFailure(sub.id, message);
    return { ok: false, eventCount: 0, error: message };
  }

  let icsText: string;
  try {
    icsText = await fetchIcs(url);
  } catch (err) {
    const message = describeError(err);
    console.error(`sync-calendars: fetch failed for subscription ${sub.id}: ${message}`);
    await recordFailure(sub.id, `fetch failed: ${message}`);
    return { ok: false, eventCount: 0, error: message };
  }

  let comp: ICalComponent;
  try {
    comp = parseCalendar(icsText);
  } catch (err) {
    const message = describeError(err);
    console.error(`sync-calendars: parse failed for subscription ${sub.id}: ${message}`);
    await recordFailure(sub.id, `parse failed: ${message}`);
    return { ok: false, eventCount: 0, error: message };
  }

  registerTimezones(comp, sub.id);

  let rows: CalendarEventInsert[];
  try {
    rows = expandEvents(sub, comp, now);
  } catch (err) {
    const message = describeError(err);
    console.error(`sync-calendars: expansion failed for subscription ${sub.id}: ${message}`);
    await recordFailure(sub.id, `expansion failed: ${message}`);
    return { ok: false, eventCount: 0, error: message };
  }

  try {
    await replaceEvents(sub, rows, now);
  } catch (err) {
    const message = describeError(err);
    console.error(`sync-calendars: database write failed for subscription ${sub.id}: ${message}`);
    await recordFailure(sub.id, `database write failed: ${message}`);
    return { ok: false, eventCount: 0, error: message };
  }

  await recordSuccess(sub.id, rows.length);
  return { ok: true, eventCount: rows.length };
}

// ---------- entrypoint ----------


/**
 * Supabase client errors are plain objects, not Error instances, so the usual
 * `err instanceof Error ? err.message : String(err)` collapses them to the
 * useless "[object Object]". Pull a message out of whatever shape arrived.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" | ");
    try {
      return JSON.stringify(err);
    } catch {
      return "unserialisable error object";
    }
  }
  return String(err);
}

// Both browser-invoked functions need CORS. supabase-js sends Content-Type and
// Authorization, which makes the browser fire an OPTIONS preflight first; with
// no handler for it the call is blocked before it ever reaches this code and
// surfaces as "Failed to send a request to the Edge Function".
//
// Allowing any origin is safe here because verify_jwt is enabled: a caller
// still needs a valid Supabase JWT, which another site cannot obtain.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  ...CORS_HEADERS,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  let subscriptionId: string | undefined;
  const bodyText = await req.text();
  if (bodyText.trim().length > 0) {
    try {
      const body = JSON.parse(bodyText) as { subscription_id?: string };
      subscriptionId = body.subscription_id;
    } catch {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }
  }

  const baseQuery = admin.from("calendar_subscriptions").select("id, user_id, name, url, colour, enabled");
  const { data: subs, error: subsError } = subscriptionId
    ? await baseQuery.eq("id", subscriptionId)
    : await baseQuery.eq("enabled", true);

  if (subsError) {
    console.error("sync-calendars: failed to load subscriptions", subsError);
    return new Response(
      JSON.stringify({ error: "failed to load subscriptions", detail: subsError.message }),
      { status: 500, headers: JSON_HEADERS },
    );
  }

  const subscriptions = (subs ?? []) as SubscriptionRow[];
  const now = new Date();

  const summary: RunSummary = {
    subscriptions: subscriptions.length,
    synced: 0,
    failed: 0,
    events: 0,
    errors: [],
  };

  // Each subscription is isolated: one bad or slow feed must not stop the
  // rest of the run.
  for (const sub of subscriptions) {
    try {
      const result = await syncSubscription(sub, now);
      if (result.ok) {
        summary.synced++;
        summary.events += result.eventCount;
      } else {
        summary.failed++;
        summary.errors.push(`${sub.id}: ${result.error ?? "unknown error"}`);
      }
    } catch (err) {
      summary.failed++;
      const message = describeError(err);
      console.error(`sync-calendars: unexpected failure for subscription ${sub.id}`, err);
      summary.errors.push(`${sub.id}: ${message}`);
    }
  }

  return new Response(JSON.stringify(summary), { headers: JSON_HEADERS });
});
