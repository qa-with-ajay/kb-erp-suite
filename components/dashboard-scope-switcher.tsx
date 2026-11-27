"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Unit = { id: string; code: string; name: string };

export default function DashboardScopeSwitcher({ units, selected, canViewGroup }: { units: Unit[]; selected: string; canViewGroup: boolean }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  async function changeScope(value: string) {
    if (switching || value === selected) return;
    setSwitching(true);
    setError("");
    try {
      if (value === "group") {
        router.push("/group-dashboard");
        return;
      }
      const response = await fetch("/api/business-units/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessUnitId: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to switch business unit.");
      router.push("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change dashboard.");
      setSwitching(false);
    }
  }

  return <div className="flex flex-col gap-1">
    <label htmlFor="dashboard-scope" className="text-xs font-medium text-gray-500">Dashboard view</label>
    <select id="dashboard-scope" value={selected} disabled={switching} onChange={(event) => void changeScope(event.target.value)} className="min-w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
      {canViewGroup && <option value="group">Group Dashboard</option>}
      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
    </select>
    {switching && <p className="text-xs text-gray-500" role="status">Changing dashboard…</p>}
    {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
  </div>;
}
