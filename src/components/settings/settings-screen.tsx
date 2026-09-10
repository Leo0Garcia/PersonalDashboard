"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useSession } from "@/components/providers";
import { keys, useNotificationPreferences } from "@/lib/hooks/use-data";
import { updateNotificationPreferences } from "@/lib/db/profile";
import {
  disablePush,
  enablePush,
  hasPushSubscription,
  pushState,
  type PushState,
} from "@/lib/push/subscribe";
import { isStandalone } from "@/lib/pwa/register-sw";
import { MonoLabel, Panel, Segmented, Toggle } from "@/components/ui/primitives";
import type { NotificationPreferences, Theme } from "@/lib/types";

const THEME_KEY = "dashboard-theme";

/**
 * Theme preference lives outside React state (localStorage + a DOM attribute),
 * so it is read via useSyncExternalStore rather than mirrored into state with
 * an effect — that keeps SSR safe (server snapshot is always "system") and
 * avoids a synchronous setState-in-effect on mount.
 */
const themeListeners = new Set<() => void>();

function getThemeSnapshot(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // localStorage unavailable — fall back to "system".
  }
  return "system";
}

function getThemeServerSnapshot(): Theme {
  return "system";
}

function subscribeTheme(callback: () => void): () => void {
  themeListeners.add(callback);
  return () => themeListeners.delete(callback);
}

function setStoredTheme(next: Theme) {
  try {
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
    window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Best effort — DOM attribute still applied where possible.
  }
  themeListeners.forEach((cb) => cb());
}

function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeServerSnapshot);
}

/** Standalone (installed-PWA) display mode doesn't change mid-session, so a static, non-notifying store is enough. */
function useStandalone(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => isStandalone(),
    () => false,
  );
}

const rowTitleStyle: CSSProperties = {
  fontSize: 15.5,
  fontWeight: 500,
  color: "var(--ink-1)",
};

const rowDescStyle: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
  color: "var(--ink-3)",
  marginTop: 2,
};

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function Divider() {
  return <div style={{ height: 1, background: "var(--line-softer)" }} />;
}

function StepButton({
  direction,
  onClick,
  label,
}: {
  direction: "up" | "down";
  onClick: () => void;
  label: string;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex items-center justify-center"
      style={{ width: 26, height: 16, borderRadius: 4, background: "var(--chip-fill)" }}
    >
      <Icon size={11} strokeWidth={2.5} style={{ color: "var(--ink-2)" }} />
    </button>
  );
}

function HourPicker({
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
}: {
  hour: number;
  minute: 0 | 30;
  onChangeHour: (next: number) => void;
  onChangeMinute: (next: 0 | 30) => void;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: 10,
        background: "var(--bg-base)",
        border: "1px solid var(--line-soft)",
        borderRadius: 9,
        padding: "9px 11px",
      }}
    >
      <MonoLabel size={10.5} style={{ color: "var(--ink-3)" }}>
        SEND AT
      </MonoLabel>
      <div className="flex items-center" style={{ gap: 6, marginLeft: "auto" }}>
        <span className="mono-col" style={{ fontSize: 20, fontWeight: 600, color: "var(--accent)" }}>
          {pad2(hour)}
        </span>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <StepButton direction="up" label="Increase digest hour" onClick={() => onChangeHour((hour + 1) % 24)} />
          <StepButton
            direction="down"
            label="Decrease digest hour"
            onClick={() => onChangeHour((hour + 23) % 24)}
          />
        </div>
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--ink-4)" }}>:</span>
        <span className="mono-col" style={{ fontSize: 20, fontWeight: 600, color: "var(--ink-1)" }}>
          {pad2(minute)}
        </span>
        <div className="flex flex-col" style={{ gap: 2 }}>
          <StepButton
            direction="up"
            label="Switch digest minute"
            onClick={() => onChangeMinute(minute === 0 ? 30 : 0)}
          />
          <StepButton
            direction="down"
            label="Switch digest minute"
            onClick={() => onChangeMinute(minute === 0 ? 30 : 0)}
          />
        </div>
      </div>
    </div>
  );
}

function PushPermissionBlock({
  state,
  busy,
  subscribed,
  message,
  onEnable,
  onDisable,
}: {
  state: PushState;
  busy: boolean;
  subscribed: boolean;
  message: string | null;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const enableButton = (
    <button
      type="button"
      onClick={onEnable}
      disabled={busy}
      className="mono-meta font-semibold"
      style={{
        fontSize: 12,
        letterSpacing: "0.07em",
        color: "var(--accent)",
        opacity: busy ? 0.5 : 1,
      }}
    >
      {busy ? "ENABLING…" : "ENABLE NOTIFICATIONS"}
    </button>
  );

  let body: React.ReactNode;
  if (state === "needs-install") {
    body = (
      <p style={rowDescStyle}>
        Add Dashboard to your Home Screen to receive notifications — tap Share, then Add to Home
        Screen.
      </p>
    );
  } else if (state === "denied") {
    body = (
      <p style={rowDescStyle}>
        Notifications are blocked in your browser settings. Re-enable them there to receive
        alerts.
      </p>
    );
  } else if (state === "unsupported") {
    body = <p style={rowDescStyle}>Push notifications aren&apos;t supported on this browser.</p>;
  } else if (state === "granted" && subscribed) {
    body = (
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        <span style={rowDescStyle}>Notifications are on for this device.</span>
        <button
          type="button"
          onClick={onDisable}
          disabled={busy}
          className="mono-meta font-semibold"
          style={{ fontSize: 12, letterSpacing: "0.07em", color: "var(--status-overdue)", opacity: busy ? 0.5 : 1 }}
        >
          TURN OFF
        </button>
      </div>
    );
  } else {
    body = enableButton;
  }

  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      {body}
      {message && (
        <span className="mono-meta" style={{ fontSize: 10.5, color: "var(--ink-3-quiet)" }}>
          {message}
        </span>
      )}
    </div>
  );
}

function NavRow({
  title,
  value,
  valueColor,
  onClick,
  expanded,
}: {
  title: string;
  value?: string;
  valueColor?: string;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const content = (
    <div className="flex items-center justify-between" style={{ minHeight: 44, padding: "14px 16px", gap: 12 }}>
      <span style={rowTitleStyle}>{title}</span>
      <div className="flex items-center" style={{ gap: 6 }}>
        {value && (
          <span className="mono-meta" style={{ fontSize: 12, color: valueColor ?? "var(--ink-3)" }}>
            {value}
          </span>
        )}
        <ChevronRight
          size={16}
          style={{
            color: "var(--ink-4)",
            transform: expanded ? "rotate(90deg)" : undefined,
          }}
        />
      </div>
    </div>
  );

  if (!onClick) return content;

  return (
    <button type="button" onClick={onClick} className="block w-full text-left" aria-expanded={expanded}>
      {content}
    </button>
  );
}

export function SettingsScreen({ onOpenHabits }: { onOpenHabits: () => void }) {
  const { supabase, userId } = useSession();
  const qc = useQueryClient();
  const { data: prefs } = useNotificationPreferences();

  const standalone = useStandalone();
  const permissionState: PushState = pushState(standalone);
  const [subscribed, setSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const theme = useTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasPushSubscription()
      .then((v) => {
        if (!cancelled) setSubscribed(v);
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permissionState]);

  async function patchPrefs(patch: Partial<Omit<NotificationPreferences, "user_id">>) {
    if (!prefs) return;
    const previous = prefs;
    qc.setQueryData<NotificationPreferences>(keys.prefs, { ...previous, ...patch });
    try {
      await updateNotificationPreferences(supabase, userId, patch);
    } catch {
      qc.setQueryData(keys.prefs, previous);
    } finally {
      void qc.invalidateQueries({ queryKey: keys.prefs });
    }
  }

  async function handleEnable() {
    setPushBusy(true);
    setPushMessage(null);
    const res = await enablePush(supabase, userId);
    setPushBusy(false);
    if (res.ok) {
      setSubscribed(true);
      setPushMessage("Notifications are on.");
    } else {
      setPushMessage(res.reason ?? "Could not enable notifications.");
    }
  }

  async function handleDisable() {
    setPushBusy(true);
    try {
      await disablePush(supabase, userId);
      setSubscribed(false);
      setPushMessage("Notifications turned off.");
    } catch {
      setPushMessage("Could not turn off notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function handleTestNotification() {
    setTestBusy(true);
    setTestMessage(null);
    try {
      const { error } = await supabase.functions.invoke("send-push", {
        body: {
          user_id: userId,
          title: "Dashboard",
          body: "3 in focus, 1 overdue. First up: Reply to Mark about the Q3 numbers.",
        },
      });
      if (error) throw error;
      setTestMessage("Test notification sent.");
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : "Failed to send test notification.");
    } finally {
      setTestBusy(false);
    }
  }

  const eveningHourLabel = `${pad2(prefs?.evening_nudge_hour ?? 22)}:00`;
  const themeLabel = theme === "system" ? "System" : theme === "light" ? "Light" : "Dark";

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 560, padding: "24px 16px 56px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-1)", marginBottom: 24 }}>
        Settings
      </h1>

      <section style={{ marginBottom: 28 }}>
        <MonoLabel size={10.5} style={{ color: "var(--ink-3)", display: "block", marginBottom: 10 }}>
          PUSH NOTIFICATIONS
        </MonoLabel>

        <Panel style={{ borderRadius: 12, overflow: "hidden" }}>
          <PushPermissionBlock
            state={permissionState}
            busy={pushBusy}
            subscribed={subscribed}
            message={pushMessage}
            onEnable={handleEnable}
            onDisable={handleDisable}
          />
          <Divider />

          <div style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-between" style={{ minHeight: 44, gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={rowTitleStyle}>Morning digest</div>
                <div style={rowDescStyle}>Today&apos;s Focus and anything due</div>
              </div>
              <Toggle
                checked={prefs?.morning_digest ?? false}
                onChange={(next) => patchPrefs({ morning_digest: next })}
                label="Morning digest"
                disabled={!prefs}
                size="large"
              />
            </div>
            {prefs?.morning_digest && (
              <div style={{ marginTop: 10 }}>
                <HourPicker
                  hour={prefs.digest_hour}
                  minute={prefs.digest_minute}
                  onChangeHour={(h) => patchPrefs({ digest_hour: h })}
                  onChangeMinute={(m) => patchPrefs({ digest_minute: m })}
                />
              </div>
            )}
          </div>
          <Divider />

          <div className="flex items-center justify-between" style={{ minHeight: 44, padding: "14px 16px", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={rowTitleStyle}>Evening nudge</div>
              <div style={rowDescStyle}>{eveningHourLabel} — clear Done, pick tomorrow&apos;s three</div>
            </div>
            <Toggle
              checked={prefs?.evening_nudge ?? false}
              onChange={(next) => patchPrefs({ evening_nudge: next })}
              label="Evening nudge"
              disabled={!prefs}
              size="large"
            />
          </div>
          <Divider />

          <div className="flex items-center justify-between" style={{ minHeight: 44, padding: "14px 16px", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={rowTitleStyle}>Due reminders</div>
              <div style={rowDescStyle}>One hour before a task is due</div>
            </div>
            <Toggle
              checked={prefs?.due_reminders ?? false}
              onChange={(next) => patchPrefs({ due_reminders: next })}
              label="Due reminders"
              disabled={!prefs}
              size="large"
            />
          </div>
          <Divider />

          <div className="flex items-center justify-between" style={{ minHeight: 44, padding: "14px 16px", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={rowTitleStyle}>Threshold alerts</div>
              <div style={rowDescStyle}>When In Progress goes over 3 cards</div>
            </div>
            <Toggle
              checked={prefs?.threshold_alerts ?? false}
              onChange={(next) => patchPrefs({ threshold_alerts: next })}
              label="Threshold alerts"
              disabled={!prefs}
              size="large"
            />
          </div>
        </Panel>

        <button
          type="button"
          onClick={handleTestNotification}
          disabled={permissionState !== "granted" || testBusy}
          className="mono-meta w-full font-semibold"
          style={{
            marginTop: 14,
            height: 50,
            borderRadius: 10,
            background: "var(--bg-card)",
            border: "1px solid var(--line-strong)",
            color: "var(--ink-1)",
            fontSize: 12,
            letterSpacing: "0.07em",
            opacity: permissionState !== "granted" ? 0.45 : 1,
          }}
        >
          {testBusy ? "SENDING…" : "SEND TEST NOTIFICATION"}
        </button>
        {testMessage && (
          <div
            className="mono-meta"
            style={{ marginTop: 8, fontSize: 10.5, color: "var(--ink-3-quiet)", textAlign: "center" }}
          >
            {testMessage}
          </div>
        )}

        <div
          className="flex items-start"
          style={{
            marginTop: 14,
            gap: 10,
            padding: 12,
            borderRadius: 10,
            background: "var(--bg-panel)",
            border: "1px solid var(--line-soft)",
          }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent)" }}
          >
            <span style={{ color: "var(--on-accent)", fontWeight: 700, fontSize: 14 }}>D</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)" }}>Dashboard</span>
              <span className="mono-label" style={{ fontSize: 10, color: "var(--ink-3)" }}>
                now
              </span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.4, color: "var(--ink-2)", marginTop: 2 }}>
              3 in focus, 1 overdue. First up: Reply to Mark about the Q3 numbers.
            </div>
          </div>
        </div>
      </section>

      <section>
        <MonoLabel size={10.5} style={{ color: "var(--ink-3)", display: "block", marginBottom: 10 }}>
          APP
        </MonoLabel>
        <Panel style={{ borderRadius: 12, overflow: "hidden" }}>
          <NavRow
            title="Appearance"
            value={themeLabel}
            onClick={() => setAppearanceOpen((v) => !v)}
            expanded={appearanceOpen}
          />
          {appearanceOpen && (
            <div style={{ padding: "0 16px 14px" }}>
              <Segmented
                options={[
                  { value: "system", label: "System" },
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                value={theme}
                onChange={setStoredTheme}
              />
            </div>
          )}
          <Divider />
          <NavRow title="Offline cache" value="Up to date" valueColor="var(--status-done)" />
          <Divider />
          <NavRow title="Habits" onClick={onOpenHabits} />
        </Panel>
      </section>
    </div>
  );
}
