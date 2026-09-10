"use client";

import type { ReactNode } from "react";

export function MonoLabel({
  children,
  className = "",
  size = 11,
  style,
}: {
  children: ReactNode;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`mono-label ${className}`}
      style={{ fontSize: size, ...style }}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  variant = "neutral",
  size = 10.5,
}: {
  children: ReactNode;
  variant?: "neutral" | "today" | "overdue" | "tag";
  size?: number;
}) {
  const styles: Record<string, React.CSSProperties> = {
    neutral: { background: "var(--chip-fill)", color: "var(--ink-2)" },
    today: { background: "var(--chip-fill-strong)", color: "var(--ink-1)" },
    overdue: {
      background: "var(--overdue-chip-bg)",
      color: "var(--overdue-chip-ink)",
      border: "1px solid var(--overdue-chip-border)",
    },
    tag: {
      background: "transparent",
      color: "var(--ink-2-dim)",
      border: "1px solid var(--line-dashed)",
    },
  };

  return (
    <span
      className="mono-meta inline-flex items-center rounded-[4px] px-[6px] py-[4px] font-semibold whitespace-nowrap"
      style={{ fontSize: size, letterSpacing: "0.04em", ...styles[variant] }}
    >
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  size = "large",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "large" | "small";
}) {
  const w = size === "large" ? 44 : 36;
  const h = size === "large" ? 26 : 20;
  const knob = size === "large" ? 20 : 14;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40"
      style={{
        width: w,
        height: h,
        background: checked ? "var(--accent)" : "var(--line-soft)",
      }}
    >
      <span
        className="absolute rounded-full transition-all duration-150"
        style={{
          width: knob,
          height: knob,
          top: (h - knob) / 2,
          left: checked ? w - knob - 3 : 3,
          background: checked ? "var(--on-accent)" : "var(--ink-3-quiet)",
        }}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accentColour,
}: {
  options: { value: T; label: string; count?: number; colour?: string }[];
  value: T;
  onChange: (next: T) => void;
  accentColour?: string;
}) {
  return (
    <div
      className="flex gap-[3px] rounded-[9px] p-[3px]"
      style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)" }}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="mono-meta flex-1 rounded-[7px] py-[9px] font-semibold transition-colors duration-150"
            style={{
              fontSize: 11,
              background: active ? "var(--chip-fill-strong)" : "transparent",
              color: active ? (accentColour ?? opt.colour ?? "var(--ink-1)") : "var(--ink-3)",
            }}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span style={{ marginLeft: 6, opacity: 0.75 }}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  accent = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[10px] ${className}`}
      style={{
        background: accent ? "var(--accent-ground)" : "var(--bg-panel)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--line-soft)"}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
