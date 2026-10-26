"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, employeesApi, setupApi } from "@/lib/client/api";
import { buildModuleSchema } from "@/lib/validations/setup";
import { canAccess } from "@/config/navigation";
import type { FieldDef, Option } from "@/config/modules";
import {
  APPROVAL_STATUS_LABELS,
  transferTypeOptions,
  resignationReasonOptions,
  exitTypeOptions,
} from "@/lib/audit";
import { formatDate } from "@/lib/utils";

interface LifecycleConfig {
  key: string;
  label: string;
  gettingOn?: string;
  fields: FieldDef[];
  primary: string;
  summary: (row: Record<string, unknown>) => string;
}

const CONFIGS: LifecycleConfig[] = [
  {
    key: "transfers",
    label: "Transfers",
    fields: [
      { name: "transferType", label: "Transfer type", type: "select", required: true, options: transferTypeOptions },
      { name: "effectiveDate", label: "Effective date", type: "date", required: true },
      { name: "fromDepartmentId", label: "From department", type: "select", resource: "departments" },
      { name: "toDepartmentId", label: "To department", type: "select", resource: "departments" },
      { name: "fromDesignationId", label: "From designation", type: "select", resource: "designations" },
      { name: "toDesignationId", label: "To designation", type: "select", resource: "designations" },
      { name: "fromBranchId", label: "From branch", type: "select", resource: "branches" },
      { name: "toBranchId", label: "To branch", type: "select", resource: "branches" },
      { name: "fromLocationId", label: "From location", type: "select", resource: "locations" },
      { name: "toLocationId", label: "To location", type: "select", resource: "locations" },
      { name: "reason", label: "Reason", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    primary: "effectiveDate",
    summary: (r) => `Transfer to ${label(r.toDepartment, "department")}${label(r.toDesignation, "designation")}`,
  },
  {
    key: "promotions",
    label: "Promotions",
    fields: [
      { name: "effectiveDate", label: "Effective date", type: "date", required: true },
      { name: "fromDesignationId", label: "From designation", type: "select", resource: "designations" },
      { name: "toDesignationId", label: "To designation", type: "select", resource: "designations" },
      { name: "fromGradeId", label: "From grade", type: "select", resource: "grades" },
      { name: "toGradeId", label: "To grade", type: "select", resource: "grades" },
      { name: "incrementAmount", label: "Increment amount", type: "decimal" },
      { name: "newCtc", label: "New CTC", type: "decimal" },
      { name: "reason", label: "Reason", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    primary: "effectiveDate",
    summary: (r) =>
      `Promotion to ${label(r.toDesignation, "designation")}${label(r.toGrade, "grade")}${r.newCtc ? ` · CTC ${r.newCtc}` : ""}`,
  },
  {
    key: "confirmations",
    label: "Confirmations",
    fields: [
      { name: "confirmationDate", label: "Confirmation date", type: "date", required: true },
      { name: "probationStartDate", label: "Probation start", type: "date" },
      { name: "probationEndDate", label: "Probation end", type: "date" },
      { name: "remarks", label: "Remarks", type: "textarea" },
    ],
    primary: "confirmationDate",
    summary: () => "Confirm permanent employment",
  },
  {
    key: "resignations",
    label: "Resignations",
    fields: [
      { name: "resignationDate", label: "Resignation date", type: "date", required: true },
      { name: "lastWorkingDate", label: "Last working day", type: "date", required: true },
      { name: "reason", label: "Reason", type: "select", required: true, options: resignationReasonOptions },
      { name: "noticePeriodDays", label: "Notice period (days)", type: "number" },
      { name: "reasonDetails", label: "Reason details", type: "textarea" },
      { name: "remarks", label: "Remarks", type: "textarea" },
    ],
    primary: "resignationDate",
    summary: (r) => `Last working day ${formatDate(r.lastWorkingDate as string)}`,
  },
  {
    key: "exits",
    label: "Exits",
    fields: [
      { name: "exitDate", label: "Exit date", type: "date", required: true },
      { name: "exitType", label: "Exit type", type: "select", required: true, options: exitTypeOptions },
      { name: "reason", label: "Reason", type: "text" },
      { name: "assetsReturned", label: "Assets returned", type: "checkbox" },
      { name: "finalSettlementDone", label: "Final settlement done", type: "checkbox" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
    primary: "exitDate",
    summary: (r) => `Exit on ${formatDate(r.exitDate as string)} (${r.assetsReturned ? "assets returned" : "assets pending"})`,
  },
];

function label(v: unknown, fallback: string) {
  const s = v as { name?: string; title?: string } | null | undefined;
  return s?.name ?? s?.title ?? fallback;
}

export function LifecyclePanel({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
  const { data: session } = useSession();
  const perms = session?.user?.permissions;
  const mayManage = canManage && canAccess(perms, "lifecycle.manage");
  const mayCreate = canAccess(perms, "lifecycle.create");

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, Record<string, unknown>[]> | null>(null);
  const [loader, setLoader] = useState(false);
  const [active, setActive] = useState<string>("transfers");
  const [options, setOptions] = useState<Record<string, Option[]>>({});

  const cfg = CONFIGS.find((c) => c.key === active)!;
  const base = useMemo(() => `/api/v1/employees/${employeeId}/${active}`, [employeeId, active]);
  const endpoint = useMemo(() => base, [base]);

  const load = useCallback(
    async (key: string) => {
      setLoader(true);
      try {
        const res = (await apiFetch(`/api/v1/employees/${employeeId}/${key}`)) as Record<string, unknown>[];
        setRows((prev) => ({ ...(prev ?? {}), [key]: res }));
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : `Failed to load ${key}.`);
        setRows((prev) => ({ ...(prev ?? {}), [key]: [] }));
      } finally {
        setLoader(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    void load(active);
  }, [active, load]);

  useEffect(() => {
    const srcs = CONFIGS.flatMap((c) => c.fields)
      .filter((f) => f.resource && !Object.prototype.hasOwnProperty.call(options, f.name))
      .map(async (f) => {
        const slug = f.resource === "employees" ? "/api/v1/employees" : setupApi(f.resource!);
        const res = (await apiFetch(`${slug}?pageSize=500`)) as { data?: Record<string, unknown>[] };
        const labelKey = f.resource === "designations" ? "title" : "name";
        const opts = (res.data ?? []).map((r) => ({
          value: String(r.id),
          label: String(r[labelKey] ?? r.firstName ?? r.name ?? r.id),
        }));
        return [f.name as string, opts] as const;
      });
    Promise.all(srcs).then((pairs) => {
      if (pairs.length) setOptions((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
  }, []);

  const schema = useMemo(() => buildModuleSchema(CONFIGS.find((c) => c.key === active)!.fields, "create"), [active]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Record<string, unknown>>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (values) => {
    setLoader(true);
    try {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) clean[k] = v === "" ? null : v;
      await apiFetch(endpoint, { method: "POST", body: JSON.stringify(clean) });
      toast.success(`${cfg.label.slice(0, -1)} record created.`);
      setOpen(false);
      reset();
      await load(active);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Create failed.");
    } finally {
      setLoader(false);
    }
  });

  const setStatus = async (id: string, status: "APPROVED" | "REJECTED") => {
    const remarks = status === "REJECTED" ? window.prompt("Rejection remarks:") : "";
    setLoader(true);
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify({ status, remarks }) });
      toast.success(`Record ${status.toLowerCase()}.`);
      await load(active);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    } finally {
      setLoader(false);
    }
  };

  const current = rows?.[active] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {CONFIGS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive(c.key)}
              className={
                active === c.key
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        {mayCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {cfg.label.slice(0, -1)}
          </Button>
        ) : null}
      </div>

      {loader && !current ? (
        <div className="flex items-center gap-2 p-6 text-muted-foreground">
          <Spinner /> Loading…
        </div>
      ) : (current?.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No {cfg.label.toLowerCase()} records yet.
        </p>
      ) : (
        <div className="space-y-2">
          {(current ?? []).map((r) => (
            <Card key={String(r.id)}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{cfg.summary(r)}</p>
                    <Badge variant={statusVariant(String(r.status))}>
                      {APPROVAL_STATUS_LABELS[String(r.status) as keyof typeof APPROVAL_STATUS_LABELS] ?? r.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {cfg.primary} {formatDate(r[cfg.primary] as string)} · created {formatDate(r.createdAt as string)}
                  </p>
                </div>
                {mayManage && r.status === "PENDING" ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => void setStatus(String(r.id), "APPROVED")}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void setStatus(String(r.id), "REJECTED")}>
                      <X className="h-4 w-4" /> Reject
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen} title={`New ${cfg.label.slice(0, -1).toLowerCase()}`} description={`Record a ${cfg.label.slice(0, -1).toLowerCase()} for this employee.`}>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <RowField key={f.name} field={f} options={options[f.name]} register={register} error={(errors[f.name]?.message as string) ?? undefined} />
            ))}
          </div>
          <Button type="submit" className="w-full" disabled={loader}>
            {loader ? <Spinner /> : null} Save {cfg.label.slice(0, -1).toLowerCase()}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}

interface RowFieldProps {
  field: FieldDef;
  options?: Option[];
  register: ReturnType<typeof useForm>["register"];
  error?: string;
}

function RowField({ field, options, register, error }: RowFieldProps) {
  const span = field.type === "textarea" ? "sm:col-span-2" : "";

  if (field.type === "checkbox") {
    return (
      <div className={`${span} flex items-center gap-2`}>
        <input type="checkbox" id={field.name} {...register(field.name)} className="h-4 w-4 rounded border-input" />
        <Label htmlFor={field.name} className="font-normal">{field.label}</Label>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className={`${span} space-y-1.5`}>
        <Label>{field.label}{field.required ? <span className="text-destructive">*</span> : null}</Label>
        <Select {...register(field.name)}>
          <option value="">Select…</option>
          {(field.options ?? options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`${span} space-y-1.5`}>
      <Label>{field.label}{field.required ? <span className="text-destructive">*</span> : null}</Label>
      <Input type={field.type === "date" ? "date" : field.type === "decimal" || field.type === "number" ? "number" : "text"} {...register(field.name)} />
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "CANCELLED":
      return "destructive";
    case "PENDING":
      return "warning";
    default:
      return "default";
  }
}