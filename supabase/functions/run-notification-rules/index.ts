// run-notification-rules
//
// Invoked hourly by pg_cron (via a plain HTTP POST with the service role key
// as bearer token). For every user who has at least one push subscription,
// evaluates the four notification rules below and delivers any that are due
// by calling the `send-push` function.
//
// Two things make this function tricky and are worth reading before editing:
//
// 1. Timezones. pg_cron fires in UTC on a fixed hourly cadence, but users'
//    "8am digest" preference is a *local* time, and the UK (and any other
//    configured zone) shifts across a DST boundary. We never compare a UTC
//    hour to the stored preference hour — instead we ask `Intl.DateTimeFormat`
//    what the wall-clock hour is *right now* in the user's IANA timezone
//    (`profiles.timezone`). The formatter itself knows the DST rules, so this
//    is correct across the GMT/BST transition without any manual offset math.
//
// 2. Deduplication. Because this runs every hour, a rule that "fires when
//    local hour == digest_hour" would fire on every tick within that hour
//    unless we remember we already sent it. We insert a `notification_log`
//    row (unique on (user_id, dedupe_key)) *before* sending; a unique
//    violation (Postgres error code 23505) means another tick already
//    claimed this notification, so we skip it. This is deliberately
//    insert-first: it favours "never spam" over "never miss one" — if the
//    push delivery itself fails after the log row is written, we do not
//    retry within the same dedupe window (the next distinct dedupe key,
//    e.g. tomorrow's date, will send normally).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * ONE_HOUR_MS;

// ---------- types ----------

interface Profile {
  id: string;
  timezone: string;
  wip_limit: number | null;
}

interface NotificationPreferences {
  user_id: string;
  morning_digest: boolean;
  digest_hour: number;
  digest_minute: number;
  evening_nudge: boolean;
  evening_nudge_hour: number;
  due_reminders: boolean;
  threshold_alerts: boolean;
}

interface TaskRow {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  due_at: string | null;
  focus_position: number | null;
  status_changed_at: string | null;
}

interface RunSummary {
  users_with_subscriptions: number;
  morning_digest: number;
  evening_nudge: number;
  due_reminders: number;
  threshold_alerts: number;
  stale_wip_alerts: number;
  errors: string[];
}

// ---------- timezone helpers ----------

/**
 * Local wall-clock hour (0-23) and calendar date (YYYY-MM-DD) for `date` in
 * `timeZone`, computed via Intl so DST transitions are handled for us.
 */
function localParts(date: Date, timeZone: string): { hour: number; dateStr: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23", // avoids the "24:00 at midnight" quirk hour12:false can hit in some ICU builds
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
  return { hour, dateStr };
}

// ---------- dedupe + delivery ----------

/**
 * Atomically "claims" a notification slot by inserting into notification_log
 * first. Returns true if this call claimed it (i.e. it had not already been
 * sent), false if it was a duplicate or the insert itself failed.
 */
async function claimDedupe(
  db: SupabaseClient,
  userId: string,
  rule: string,
  dedupeKey: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await db.from("notification_log").insert({
    user_id: userId,
    rule,
    dedupe_key: dedupeKey,
    payload,
    sent_at: new Date().toISOString(),
  });

  if (!error) return true;

  if (error.code === "23505") {
    // Unique violation on (user_id, dedupe_key): already sent, this is expected on every
    // hourly tick after the first within the dedupe window.
    return false;
  }

  console.error(`run-notification-rules: notification_log insert failed for ${rule}/${dedupeKey}`, error);
  return false;
}

async function sendPush(
  userId: string,
  title: string,
  body: string,
  url?: string,
  tag?: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ user_id: userId, title, body, url, tag }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`send-push responded ${res.status}: ${text}`);
  }
}

/** claimDedupe + sendPush, so each rule below is a one-liner. */
async function fireIfUnclaimed(
  db: SupabaseClient,
  userId: string,
  rule: string,
  dedupeKey: string,
  notification: { title: string; body: string; url?: string; tag?: string },
): Promise<boolean> {
  const claimed = await claimDedupe(db, userId, rule, dedupeKey, notification);
  if (!claimed) return false;
  await sendPush(userId, notification.title, notification.body, notification.url, notification.tag);
  return true;
}

// ---------- per-user rule evaluation ----------

async function processUser(userId: string, now: Date, summary: RunSummary): Promise<void> {
  const [{ data: profile, error: profileError }, { data: prefs, error: prefsError }] = await Promise.all([
    admin.from("profiles").select("id, timezone, wip_limit").eq("id", userId).maybeSingle(),
    admin.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (prefsError) throw prefsError;
  if (!profile || !prefs) return; // no profile or no preferences row: nothing to evaluate

  const p = profile as Profile;
  const pr = prefs as NotificationPreferences;

  const { hour: localHour, dateStr } = localParts(now, p.timezone);

  const { data: taskRows, error: tasksError } = await admin
    .from("tasks")
    .select("id, title, status, due_at, focus_position, status_changed_at")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (tasksError) throw tasksError;
  const tasks = (taskRows ?? []) as TaskRow[];

  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");

  // ---- 1. morning_digest ----
  if (pr.morning_digest && localHour === pr.digest_hour) {
    const focusTasks = tasks.filter((t) => t.focus_position != null);
    const overdueTasks = tasks.filter(
      (t) => t.status !== "done" && t.due_at !== null && new Date(t.due_at) < now,
    );
    const firstUp = focusTasks.find((t) => t.focus_position === 1);

    let body = `${focusTasks.length} in focus, ${overdueTasks.length} overdue.`;
    if (firstUp) body += ` First up: ${firstUp.title}.`;

    const fired = await fireIfUnclaimed(admin, userId, "morning_digest", `morning_digest:${dateStr}`, {
      title: "Morning digest",
      body,
      url: "/",
      tag: "morning-digest",
    });
    if (fired) summary.morning_digest++;
  }

  // ---- 2. evening_nudge ----
  if (pr.evening_nudge && localHour === pr.evening_nudge_hour) {
    const count = inProgressTasks.length;
    const body = `${count} task${count === 1 ? "" : "s"} still in progress. Time for your evening review.`;

    const fired = await fireIfUnclaimed(admin, userId, "evening_nudge", `evening_nudge:${dateStr}`, {
      title: "Evening review",
      body,
      url: "/review",
      tag: "evening-nudge",
    });
    if (fired) summary.evening_nudge++;
  }

  // ---- 3. due_reminders ----
  if (pr.due_reminders) {
    const dueSoon = tasks.filter((t) => {
      if (t.status === "done" || t.due_at === null) return false;
      const dueAt = new Date(t.due_at).getTime();
      return dueAt >= now.getTime() && dueAt <= now.getTime() + ONE_HOUR_MS;
    });

    for (const task of dueSoon) {
      const fired = await fireIfUnclaimed(admin, userId, "due_reminders", `due:${task.id}`, {
        title: "Due soon",
        body: `"${task.title}" is due within the hour.`,
        url: "/",
        tag: `due-${task.id}`,
      });
      if (fired) summary.due_reminders++;
    }
  }

  // ---- 4. threshold_alerts ----
  if (pr.threshold_alerts) {
    const wipLimit = p.wip_limit ?? 3;
    if (inProgressTasks.length > wipLimit) {
      const fired = await fireIfUnclaimed(admin, userId, "threshold_alerts", `wip:${dateStr}`, {
        title: "WIP limit exceeded",
        body:
          `You have ${inProgressTasks.length} tasks in progress (limit ${wipLimit}). ` +
          `Consider wrapping one up before starting another.`,
        url: "/",
        tag: "wip-threshold",
      });
      if (fired) summary.threshold_alerts++;
    }

    const staleTasks = inProgressTasks.filter(
      (t) => t.status_changed_at !== null && now.getTime() - new Date(t.status_changed_at).getTime() > THREE_DAYS_MS,
    );
    for (const task of staleTasks) {
      const fired = await fireIfUnclaimed(
        admin,
        userId,
        "threshold_alerts",
        `stale:${task.id}:${dateStr}`,
        {
          title: "Stale in-progress task",
          body: `"${task.title}" has been in progress for over 3 days.`,
          url: "/",
          tag: `stale-${task.id}`,
        },
      );
      if (fired) summary.stale_wip_alerts++;
    }
  }
}

// ---------- entrypoint ----------

Deno.serve(async (_req: Request) => {
  const summary: RunSummary = {
    users_with_subscriptions: 0,
    morning_digest: 0,
    evening_nudge: 0,
    due_reminders: 0,
    threshold_alerts: 0,
    stale_wip_alerts: 0,
    errors: [],
  };

  try {
    const { data: subRows, error: subsError } = await admin.from("push_subscriptions").select("user_id");
    if (subsError) throw subsError;

    const userIds = [...new Set((subRows ?? []).map((r: { user_id: string }) => r.user_id))];
    summary.users_with_subscriptions = userIds.length;

    const now = new Date();

    // Each user is isolated: one user's bad data or a transient DB/fetch error
    // must not stop the rest of the run.
    for (const userId of userIds) {
      try {
        await processUser(userId, now, summary);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`run-notification-rules: failed for user ${userId}`, err);
        summary.errors.push(`${userId}: ${message}`);
      }
    }
  } catch (err) {
    console.error("run-notification-rules: top-level failure", err);
    return new Response(
      JSON.stringify({ error: "internal error", detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});
