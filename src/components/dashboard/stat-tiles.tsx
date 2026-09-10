"use client";

export function StatTiles({
  stats,
  scale = "phone",
}: {
  stats: { label: string; value: number | string; tone?: string }[];
  scale?: "mac" | "phone";
}) {
  const phone = scale === "phone";
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col"
          style={{
            gap: 6,
            borderRadius: 9,
            background: "var(--bg-panel)",
            border: "1px solid var(--line-soft)",
            padding: phone ? "11px 12px" : "10px 11px",
          }}
        >
          <span
            className="mono-meta font-semibold"
            style={{ fontSize: phone ? 16 : 15, color: s.tone ?? "var(--ink-1)" }}
          >
            {s.value}
          </span>
          <span
            className="mono-meta font-medium"
            style={{ fontSize: 9.5, letterSpacing: "0.05em", color: "var(--ink-3)", whiteSpace: "nowrap" }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
