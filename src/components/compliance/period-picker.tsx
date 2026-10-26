"use client";

import { Select } from "@/components/ui/select";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface Period {
  month: number;
  year: number;
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const years = [value.year - 1, value.year, value.year + 1];
  return (
    <div className="flex items-center gap-2">
      <Select value={String(value.month)} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1)}>{m}</option>
        ))}
      </Select>
      <Select value={String(value.year)} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </Select>
    </div>
  );
}
