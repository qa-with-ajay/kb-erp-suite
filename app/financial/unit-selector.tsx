"use client";

 type UnitOption = { id: string; code: string; name: string };

function UnitSelector({ units, selected, canViewGroup }: { units: UnitOption[]; selected: string; canViewGroup: boolean }) {
  return <form action="/financial" method="get" className="flex flex-col gap-1">
    <label htmlFor="financial-scope" className="text-xs font-medium text-gray-500">Financial view</label>
    <select id="financial-scope" name="scope" defaultValue={selected} onChange={(event) => {
      const form = event.currentTarget.form;
      if (form) {
        const value = event.currentTarget.value;
        const unitInput = form.querySelector<HTMLInputElement>('input[name="businessUnitId"]');
        if (unitInput) unitInput.disabled = value === "group";
        form.requestSubmit();
      }
    }} className="min-w-56 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
      {canViewGroup && <option value="group">Group Financial</option>}
      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
    </select>
    <input type="hidden" name="businessUnitId" value={selected !== "group" ? selected : ""} disabled={selected === "group"} />
  </form>;
}
