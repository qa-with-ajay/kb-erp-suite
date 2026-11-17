"use client";

import { useEffect, useState } from "react";

type BusinessUnit = { id: string; code: string; name: string };

export function BusinessUnitSwitcher() {
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/business-units", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load business units.");
        setUnits(data.items);
        setSelectedId(data.activeBusinessUnitId ?? "");
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load business units.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function changeBusinessUnit(businessUnitId: string) {
    setError("");
    setSelectedId(businessUnitId);
    try {
      const response = await fetch("/api/business-units/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessUnitId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to switch business unit.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to switch business unit.");
    }
  }

  if (units.length === 0) return error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null;
  if (units.length === 1) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="text-xs font-medium text-gray-500">Active unit</span>
        <p className="text-sm font-semibold text-gray-800">{units[0].name}</p>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <label htmlFor="active-business-unit" className="text-xs font-medium text-gray-500">Active unit</label>
      <select
        id="active-business-unit"
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        value={selectedId}
        disabled={loading}
        onChange={(event) => void changeBusinessUnit(event.target.value)}
      >
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
