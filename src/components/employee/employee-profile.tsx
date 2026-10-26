"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { apiFetch, ApiClientError, employeesApi } from "@/lib/client/api";
import { DocumentsPanel } from "@/components/employee/documents-panel";
import { LifecyclePanel } from "@/components/employee/lifecycle-panel";
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
  BLOOD_GROUP_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYEE_STATUS_LABELS,
} from "@/lib/audit";
import type { EmployeeStatus } from "@prisma/client";

interface EmployeeDetail {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  dob?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  bloodGroup?: string | null;
  nationality?: string | null;
  personalEmail?: string | null;
  mobileNumber?: string | null;
  alternateNumber?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  doj?: string | null;
  confirmationDate?: string | null;
  probationMonths?: number | null;
  employmentType?: string | null;
  employmentStatus: string;
  companyEmail?: string | null;
  internalExtension?: string | null;
  pan?: string | null;
  aadhaar?: string | null;
  uan?: string | null;
  pfNumber?: string | null;
  esiNumber?: string | null;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  grade?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  costCenter?: { id: string; code: string; name?: string } | null;
  businessUnit?: { id: string; name: string } | null;
  branch?: { id: string; name: string; code?: string } | null;
  location?: { id: string; name: string } | null;
  shift?: { id: string; name: string; startTime?: string; endTime?: string } | null;
  reportingManager?: { id: string; firstName: string; lastName: string } | null;
  bankDetails?: {
    accountHolderName?: string | null;
    accountNumber?: string;
    ifscCode?: string | null;
    bankName?: string | null;
    bankBranch?: string | null;
    accountType?: string | null;
  }[];
  documents?: { id: string; name: string; category: string; status: string }[];
}

const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : "—");
const val = (v?: string | null) => (v ? v : "—");
const num = (v?: number | null) => (v === null || v === undefined ? "—" : String(v));
const label = (map: Record<string, string>, v?: string | null) => (v ? map[v] ?? v : "—");

export function EmployeeProfile({ employeeId, canEdit, canDelete, canDoc, canLifecycle }: {
  employeeId: string;
  canEdit: boolean;
  canDelete: boolean;
  canDoc: boolean;
  canLifecycle: boolean;
}) {
  const router = useRouter();
  const [rec, setRec] = useState<EmployeeDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    apiFetch<EmployeeDetail>(`${employeesApi}/${employeeId}`)
      .then(setRec)
      .catch((e) => toast.error(e instanceof ApiClientError ? e.message : "Failed to load employee."));
  }, [employeeId]);

  const remove = async () => {
    if (!window.confirm(`Deactivate ${rec?.firstName} ${rec?.lastName}? The record is archived, not destroyed.`)) return;
    setBusy(true);
    try {
      await apiFetch(`${employeesApi}/${employeeId}`, { method: "DELETE" });
      toast.success("Employee deactivated.");
      router.push("/employees");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to deactivate.");
    } finally {
      setBusy(false);
    }
  };

  if (!rec) {
    return (
      <div className="flex items-center gap-2 p-10 text-muted-foreground">
        <Spinner /> Loading employee…
      </div>
    );
  }

  const name = `${rec.firstName} ${rec.middleName ? `${rec.middleName} ` : ""}${rec.lastName}`;
  const bank = rec.bankDetails?.[0];

  const statusColor: Record<EmployeeStatus, "default" | "success" | "warning" | "destructive"> = {
    ACTIVE: "success",
    PROBATION: "warning",
    RESIGNED: "destructive",
    EXITED: "destructive",
    INACTIVE: "destructive",
    SUSPENDED: "destructive",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/employees" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Employees
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Avatar name={name} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{name}</h1>
                <Badge variant={statusColor[rec.employmentStatus as EmployeeStatus] ?? "secondary"}>
                  {label(EMPLOYEE_STATUS_LABELS, rec.employmentStatus)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {rec.employeeCode} · {rec.designation?.title ?? "—"} · {rec.department?.name ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Link href={`/employees/${employeeId}/edit`}>
                <Button variant="outline">
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </Link>
            ) : null}
            {canDelete ? (
              <Button variant="outline" className="text-destructive" onClick={remove} disabled={busy}>
                {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Deactivate
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "employment", label: "Employment" },
          { value: "statutory", label: "Statutory" },
          { value: "banking", label: "Banking" },
          ...(canDoc ? [{ value: "documents", label: "Documents" }] : []),
          ...(canLifecycle ? [{ value: "lifecycle", label: "Lifecycle" }] : []),
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailCard title="Contact">
            <DetailRow k="Personal email" v={val(rec.personalEmail)} />
            <DetailRow k="Mobile" v={val(rec.mobileNumber)} />
            <DetailRow k="Alternate" v={val(rec.alternateNumber)} />
            <DetailRow k="Address" v={[rec.addressLine1, rec.city, rec.state, rec.country, rec.postalCode].filter(Boolean).join(", ") || "—"} />
            <DetailRow k="Birth date" v={fmtDate(rec.dob)} />
          </DetailCard>
          <DetailCard title="Personal">
            <DetailRow k="Gender" v={label(GENDER_LABELS, rec.gender)} />
            <DetailRow k="Marital status" v={label(MARITAL_STATUS_LABELS, rec.maritalStatus)} />
            <DetailRow k="Blood group" v={label(BLOOD_GROUP_LABELS, rec.bloodGroup)} />
            <DetailRow k="Nationality" v={val(rec.nationality)} />
          </DetailCard>
        </div>
      ) : null}

      {tab === "employment" ? (
        <DetailCard title="Organisation">
          <DetailRow k="Date of joining" v={fmtDate(rec.doj)} />
          <DetailRow k="Confirmation date" v={fmtDate(rec.confirmationDate)} />
          <DetailRow k="Probation (months)" v={num(rec.probationMonths)} />
          <DetailRow k="Employment type" v={label(EMPLOYMENT_TYPE_LABELS, rec.employmentType)} />
          <DetailRow k="Company email" v={val(rec.companyEmail)} />
          <DetailRow k="Extension" v={val(rec.internalExtension)} />
          <DetailRow k="Reporting manager" v={rec.reportingManager ? `${rec.reportingManager.firstName} ${rec.reportingManager.lastName}` : "—"} />
          <DetailRow k="Branch" v={`${rec.branch?.name ?? "—"}${rec.branch?.code ? ` (${rec.branch.code})` : ""}`} />
          <DetailRow k="Location" v={val(rec.location?.name)} />
          <DetailRow k="Department" v={val(rec.department?.name)} />
          <DetailRow k="Designation" v={val(rec.designation?.title)} />
          <DetailRow k="Grade" v={val(rec.grade?.name)} />
          <DetailRow k="Category" v={val(rec.category?.name)} />
          <DetailRow k="Cost center" v={`${rec.costCenter?.code ?? "—"}${rec.costCenter?.name ? ` · ${rec.costCenter.name}` : ""}`} />
          <DetailRow k="Business unit" v={val(rec.businessUnit?.name)} />
          <DetailRow k="Shift" v={`${rec.shift?.name ?? "—"}${rec.shift?.startTime ? ` (${rec.shift.startTime}–${rec.shift.endTime})` : ""}`} />
        </DetailCard>
      ) : null}

      {tab === "statutory" ? (
        <DetailCard title="Statutory identifiers">
          <DetailRow k="PAN" v={val(rec.pan)} />
          <DetailRow k="Aadhaar" v={val(rec.aadhaar)} />
          <DetailRow k="UAN" v={val(rec.uan)} />
          <DetailRow k="PF number" v={val(rec.pfNumber)} />
          <DetailRow k="ESI number" v={val(rec.esiNumber)} />
        </DetailCard>
      ) : null}

      {tab === "banking" ? (
        <DetailCard title="Primary bank account">
          <DetailRow k="Account holder" v={val(bank?.accountHolderName)} />
          <DetailRow k="Account number" v={val(bank?.accountNumber)} />
          <DetailRow k="IFSC" v={val(bank?.ifscCode)} />
          <DetailRow k="Bank" v={val(bank?.bankName)} />
          <DetailRow k="Branch" v={val(bank?.bankBranch)} />
          <DetailRow k="Account type" v={val(bank?.accountType)} />
        </DetailCard>
      ) : null}

      {tab === "documents" && canDoc ? <DocumentsPanel employeeId={employeeId} canForm={canDoc} canManage={canDoc} /> : null}
      {tab === "lifecycle" && canLifecycle ? <LifecyclePanel employeeId={employeeId} canManage={canLifecycle} /> : null}
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}