"use client";

import { useState } from "react";
import { HabitsEditor } from "@/components/settings/habits-editor";
import { SettingsScreen } from "@/components/settings/settings-screen";

export default function SettingsPage() {
  const [view, setView] = useState<"settings" | "habits">("settings");

  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      {view === "habits" ? (
        <HabitsEditor onBack={() => setView("settings")} />
      ) : (
        <SettingsScreen onOpenHabits={() => setView("habits")} />
      )}
    </div>
  );
}
