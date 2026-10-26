"use client";

import { useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { employeesApi, apiFetch, ApiClientError } from "@/lib/client/api";

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

interface EmployeeSelectProps {
  value: string;
  onChange: (value: string) => void;
  includeEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}

export function EmployeeSelect({ value, onChange, includeEmpty = false, emptyLabel = "Select employee…", disabled }: EmployeeSelectProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<EmployeeOption[]>(`${employeesApi}?pageSize=100`);
      setEmployees(rows ?? []);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Failed to load employees.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-1">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {includeEmpty ? <option value="">{emptyLabel}</option> : null}
        {employees.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.employeeCode} · {emp.firstName} {emp.lastName}
          </option>
        ))}
      </Select>
    </div>
  );
}