"use client";

import { useRouter } from "next/navigation";

type UnitOption = { id: string; code: string; name: string };

export default function UnitSelector({
  units,
  selected,
  canViewGroup,
}: {
  units: UnitOption[];
  selected: string;
  canViewGroup: boolean;
}) {
  const router = useRouter();

  function changeScope(value: string) {
    const params = new URLSearchParams();
    if (value === "group") {
      params.set("scope", "group");
    } else {
      params.set("scope", value);
      params.set("businessUnitId", value);
    }
    router.push(`/financial?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="financial-scope" className="text-xs font-medium text-gray-500">
        Financial view
      </label>
      <select
        id="financial-scope"
        value={selected}
        onChange={(event) => changeScope(event.target.value)}
        className="min-w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      >
        {canViewGroup && <option value="group">Group Financial</option>}
        {units.map((unit) => (
          <option key={unit.id} value={unit.id}>{unit.name}</option>
        ))}
      </select>
    </div>
  );
}
