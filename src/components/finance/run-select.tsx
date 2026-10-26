"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { payrollRunsApi, apiFetch, ApiClientError } from "@/lib/client/api";

export interface RunOption {
  id: string;
  month: number;
  year: number;
  status: string;
}

interface RunSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: (run: RunOption) => string;
}

export function RunSelect({ value, onChange, label }: RunSelectProps) {
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<RunOption[]>(`${payrollRunsApi}?pageSize=200`);
      setRuns(rows ?? []);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load payroll runs.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select payroll run…</option>
      {runs.map((run) => (
        <option key={run.id} value={run.id}>
          {label ? label(run) : `${String(run.month).padStart(2, "0")}/${run.year} · ${run.status}`}
        </option>
      ))}
    </Select>
  );
}