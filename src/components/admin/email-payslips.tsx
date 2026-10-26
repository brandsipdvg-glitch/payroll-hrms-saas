"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client/api";
import { emailPayslipsApi, employeesApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

export function EmailPayslips() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ rows: Row[] }>(`${employeesApi}?pageSize=50&employmentStatus=ACTIVE`);
      setEmployees(data?.rows ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const data = await apiFetch<{ sent: number }>(emailPayslipsApi, {
        method: "POST",
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          employeeIds: selected.size ? Array.from(selected) : undefined,
        }),
      });
      setResult(data as { sent: number });
      toast.success(`Sent ${data.sent} payslip email(s).`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Sending failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Email Payslips</h1>
        <p className="text-sm text-muted-foreground">Send payslips for a payroll month to all employees (or a selection).</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Payroll year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payroll month</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((m) => (
                <option key={m} value={m}>{new Date(2026, Number(m) - 1).toLocaleString("en-US", { month: "long" })}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={send} disabled={busy}>
              <Mail className="mr-1 h-4 w-4" /> {busy ? "Sending…" : selected.size ? `Send to ${selected.size} selected` : "Send to all active"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Recipients (active employees)</CardTitle>
              <CardDescription>Select specific employees or send to all.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selected.size === employees.length) setSelected(new Set());
                else setSelected(new Set(employees.map((e) => String(e.id))));
              }}
            >
              {selected.size === employees.length ? "Clear all" : "Select all"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[320px] space-y-1 overflow-y-auto">
          {employees.map((e) => (
            <label key={String(e.id)} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={selected.has(String(e.id))}
                onChange={() => toggle(String(e.id))}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm font-medium">{(e.firstName as string) ?? ""} {(e.lastName as string) ?? ""}</span>
              <span className="text-xs text-muted-foreground">{String(e.employeeCode)}</span>
              <span className="ml-auto text-xs text-muted-foreground">{String(e.companyEmail ?? "")}</span>
            </label>
          ))}
          {employees.length === 0 ? <p className="text-sm text-muted-foreground">No active employees found.</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <p className="text-sm text-muted-foreground">Last batch delivered to <strong>{result.sent}</strong> recipient(s).</p>
      ) : null}
    </div>
  );
}