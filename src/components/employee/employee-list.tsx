"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table";
import { Avatar } from "@/components/ui/avatar";
import { listResource, setupApi, employeesApi, ApiClientError, type PaginatedMeta } from "@/lib/client/api";
import { EMPLOYEE_STATUS_LABELS } from "@/lib/audit";

interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  doj: string;
  mobileNumber?: string | null;
  personalEmail?: string | null;
  employmentStatus: string;
  employmentType: string;
  department?: { id: string; name: string } | null;
  designation?: { id: string; title: string } | null;
  [key: string]: unknown;
}

interface FilterOption {
  id: string;
  name?: string;
  title?: string;
}

export function EmployeeList({ canCreate }: { canCreate: boolean }) {
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [designations, setDesignations] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (page: number, searchTerm: string, dept: string, desig: string, status: string) => {
      setLoading(true);
      try {
        const res = await listResource<EmployeeRow>(employeesApi, {
          page,
          pageSize: 20,
          search: searchTerm,
          departmentId: dept,
          designationId: desig,
          employmentStatus: status,
        });
        setRows(res.data);
        setMeta(res.meta);
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : "Failed to load employees.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(1, "", "", "", "");
  }, [load]);

  useEffect(() => {
    Promise.all([
      listResource<FilterOption>(setupApi("departments"), { pageSize: 500 }).then((r) => setDepartments(r.data)),
      listResource<FilterOption>(setupApi("designations"), { pageSize: 500 }).then((r) => setDesignations(r.data)),
    ]).catch(() => undefined);
  }, []);

  const deptChanged = (v: string) => {
    setDepartmentId(v);
    void load(1, search, v, designationId, employmentStatus);
  };
  const desigChanged = (v: string) => {
    setDesignationId(v);
    void load(1, search, departmentId, v, employmentStatus);
  };
  const statusChanged = (v: string) => {
    setEmploymentStatus(v);
    void load(1, search, departmentId, designationId, v);
  };

  const columns: Column<EmployeeRow>[] = [
    {
      key: "employee",
      title: "Employee",
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
          <div>
            <Link href={`/employees/${row.id}`} className="font-medium hover:text-primary hover:underline">
              {row.firstName} {row.middleName ? `${row.middleName} ` : ""}
              {row.lastName}
            </Link>
            <p className="text-xs text-muted-foreground">{row.employeeCode}</p>
          </div>
        </div>
      ),
    },
    { key: "designation", title: "Designation", render: (row) => row.designation?.title ?? "—" },
    { key: "department", title: "Department", render: (row) => row.department?.name ?? "—" },
    {
      key: "contact",
      title: "Contact",
      render: (row) => (
        <div>
          <p>{row.mobileNumber ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{row.personalEmail ?? ""}</p>
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (row) => <Badge variant={statusVariant(row.employmentStatus)}>{EMPLOYEE_STATUS_LABELS[row.employmentStatus as keyof typeof EMPLOYEE_STATUS_LABELS] ?? row.employmentStatus}</Badge>,
    },
    {
      key: "actions",
      title: "",
      className: "w-20",
      render: (row) => (
        <div className="flex justify-end">
          <Link href={`/employees/${row.id}/edit`}>
            <Button variant="ghost" size="icon" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage the complete employee master across the company.</p>
        </div>
        {canCreate ? (
          <Link href="/employees/new">
            <Button>
              <Plus className="h-4 w-4" /> Onboard employee
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={departmentId} onChange={(e) => deptChanged(e.target.value)} className="w-52">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={designationId} onChange={(e) => desigChanged(e.target.value)} className="w-56">
          <option value="">All designations</option>
          {designations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </Select>
        <Select value={employmentStatus} onChange={(e) => statusChanged(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          {Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={meta.total}
        page={meta.page}
        pageSize={meta.pageSize}
        onPageChange={(p) => void load(p, search, departmentId, designationId, employmentStatus)}
        onSearch={(v) => {
          setSearch(v);
          void load(1, v, departmentId, designationId, employmentStatus);
        }}
        searchValue={search}
        searchPlaceholder="Search by name, ID or mobile…"
      />
    </div>
  );
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PROBATION":
      return "warning";
    case "EXITED":
    case "RESIGNED":
    case "INACTIVE":
    case "SUSPENDED":
      return "destructive";
    default:
      return "default";
  }
}