"use client";

import { LayoutGrid, Moon, Settings, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/hooks/use-theme";
import { hhmm, longDateLabel } from "@/lib/format";

const MAC_NAV = [
  { href: "/", label: "Dashboard", icon: Target },
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/review", label: "Review", icon: Moon },
  { href: "/settings", label: "Settings", icon: Settings },
];

function MacNavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Target;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="mono-meta flex items-center rounded-[6px] font-semibold"
      style={{
        gap: 6,
        padding: "6px 9px",
        fontSize: 11,
        color: active ? "var(--ink-1)" : "var(--ink-3)",
        background: active ? "var(--chip-fill-strong)" : "transparent",
      }}
    >
      <Icon size={12} strokeWidth={2.25} />
      {label}
    </Link>
  );
}

export function MacHeader({ online }: { online: boolean }) {
  const { theme, setTheme } = useTheme();
  const [now, setNow] = useState<Date | null>(null);

  // Rendered client-side only: a server-rendered clock would hydrate mismatched.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="flex shrink-0 items-center justify-between"
      style={{
        height: 56,
        padding: "0 24px",
        background: "var(--bg-chrome)",
        borderBottom: "1px solid var(--line-softer)",
      }}
    >
      <div className="flex items-center" style={{ gap: 10 }}>
        <span
          style={{ width: 9, height: 9, borderRadius: 2, background: "var(--accent)" }}
          aria-hidden
        />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>Dashboard</span>

        {/* The phone reaches Settings via the tab bar; the Mac has no tab bar,
            so without this Settings, Habits, Calendars and the evening review
            are unreachable on desktop entirely. */}
        <nav className="flex items-center" style={{ gap: 2, marginLeft: 18 }} aria-label="Sections">
          {MAC_NAV.map(({ href, label, icon: Icon }) => (
            <MacNavLink key={href} href={href} label={label} icon={Icon} />
          ))}
        </nav>
      </div>

      <div className="flex items-center" style={{ gap: 18 }}>
        {now && (
          <span className="mono-meta font-medium" style={{ fontSize: 12, color: "var(--ink-3)", letterSpacing: "0.03em" }}>
            {longDateLabel(now)} · {hhmm(now)}
          </span>
        )}

        <span className="flex items-center" style={{ gap: 7 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: online ? "var(--status-done)" : "var(--status-inprog)",
            }}
            aria-hidden
          />
          <span className="mono-meta font-medium" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {online ? "Synced" : "Offline"}
          </span>
        </span>

        <div
          className="flex"
          style={{ borderRadius: 7, border: "1px solid var(--line)", overflow: "hidden" }}
          role="group"
          aria-label="Theme"
        >
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(theme === t ? "system" : t)}
              aria-pressed={theme === t}
              className="mono-meta font-medium"
              style={{
                padding: "6px 10px",
                fontSize: 11,
                background: theme === t ? "var(--chip-fill-strong)" : "transparent",
                color: theme === t ? "var(--ink-1)" : "var(--ink-3)",
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

const TABS = [
  { href: "/", label: "Focus", icon: Target },
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function PhoneTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="safe-bottom shrink-0"
      style={{ background: "var(--bg-chrome)", borderTop: "1px solid var(--line-soft)" }}
      aria-label="Main"
    >
      <div className="flex" style={{ height: 56 }}>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center justify-center"
              style={{ minWidth: 44, gap: 4, color: active ? "var(--accent)" : "var(--ink-3)" }}
            >
              <Icon size={15} strokeWidth={2.25} />
              <span className="mono-meta font-semibold" style={{ fontSize: 9.5, letterSpacing: "0.06em" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** iOS status-bar inset. Never hardcode the artboard's 59px. */
export function SafeTop() {
  return <div className="safe-top shrink-0" style={{ background: "var(--bg-chrome)" }} />;
}
