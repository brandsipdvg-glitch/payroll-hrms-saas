"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, listResource, setupApi, employeesApi, ApiClientError } from "@/lib/client/api";
import { employeeSchema } from "@/lib/validations/employee";
import {
  genderOptions,
  maritalStatusOptions,
  bloodGroupOptions,
  employmentTypeOptions,
  employeeStatusOptions,
  bankAccountTypeOptions,
} from "@/lib/audit";
import type { Option } from "@/config/modules";

type Values = Record<string, unknown>;

interface Section {
  key: string;
  title: string;
  description: string;
  fields: { name: string; label: string; type: "text" | "email" | "date" | "number" | "select" | "readonly"; options?: Option[]; span?: 1 | 2 }[];
}

const SECTIONS: Section[] = [
  {
    key: "personal",
    title: "Personal information",
    description: "Basic identity and contact details.",
    fields: [
      { name: "employeeCode", label: "Employee ID", type: "readonly", span: 1 },
      { name: "firstName", label: "First name", type: "text", span: 1 },
      { name: "middleName", label: "Middle name", type: "text", span: 1 },
      { name: "lastName", label: "Last name", type: "text", span: 1 },
      { name: "dob", label: "Date of birth", type: "date", span: 1 },
      { name: "gender", label: "Gender", type: "select", options: genderOptions, span: 1 },
      { name: "maritalStatus", label: "Marital status", type: "select", options: maritalStatusOptions, span: 1 },
      { name: "bloodGroup", label: "Blood group", type: "select", options: bloodGroupOptions, span: 1 },
      { name: "nationality", label: "Nationality", type: "text", span: 1 },
      { name: "personalEmail", label: "Personal email", type: "email", span: 1 },
      { name: "mobileNumber", label: "Mobile number", type: "text", span: 1 },
      { name: "alternateNumber", label: "Alternate number", type: "text", span: 1 },
      { name: "addressLine1", label: "Address line 1", type: "text", span: 2 },
      { name: "city", label: "City", type: "text", span: 1 },
      { name: "state", label: "State", type: "text", span: 1 },
      { name: "country", label: "Country", type: "text", span: 1 },
      { name: "postalCode", label: "Postal code", type: "text", span: 1 },
    ],
  },
  {
    key: "employment",
    title: "Employment information",
    description: "Joining details and organisational mapping.",
    fields: [
      { name: "doj", label: "Date of joining", type: "date", span: 1 },
      { name: "confirmationDate", label: "Confirmation date", type: "date", span: 1 },
      { name: "probationMonths", label: "Probation (months)", type: "number", span: 1 },
      { name: "employmentType", label: "Employment type", type: "select", options: employmentTypeOptions, span: 1 },
      { name: "employmentStatus", label: "Employment status", type: "select", options: employeeStatusOptions, span: 1 },
      { name: "companyEmail", label: "Company email", type: "email", span: 1 },
      { name: "internalExtension", label: "Internal extension", type: "text", span: 1 },
      { name: "departmentId", label: "Department", type: "select", span: 1 },
      { name: "designationId", label: "Designation", type: "select", span: 1 },
      { name: "gradeId", label: "Grade", type: "select", span: 1 },
      { name: "categoryId", label: "Category", type: "select", span: 1 },
      { name: "costCenterId", label: "Cost center", type: "select", span: 1 },
      { name: "businessUnitId", label: "Business unit", type: "select", span: 1 },
      { name: "branchId", label: "Branch", type: "select", span: 1 },
      { name: "locationId", label: "Location", type: "select", span: 1 },
      { name: "shiftId", label: "Shift", type: "select", span: 1 },
      { name: "reportingManagerId", label: "Reporting manager", type: "select", span: 2 },
    ],
  },
  {
    key: "statutory",
    title: "Statutory information",
    description: "Tax and social-security identifiers.",
    fields: [
      { name: "pan", label: "PAN", type: "text", span: 1 },
      { name: "aadhaar", label: "Aadhaar", type: "text", span: 1 },
      { name: "uan", label: "UAN", type: "text", span: 1 },
      { name: "pfNumber", label: "PF number", type: "text", span: 1 },
      { name: "esiNumber", label: "ESI number", type: "text", span: 1 },
    ],
  },
  {
    key: "banking",
    title: "Banking details",
    description: "Primary salary bank account.",
    fields: [
      { name: "bankAccountHolderName", label: "Account holder name", type: "text", span: 1 },
      { name: "bankAccountNumber", label: "Account number", type: "text", span: 1 },
      { name: "bankIfscCode", label: "IFSC code", type: "text", span: 1 },
      { name: "bankName", label: "Bank name", type: "text", span: 1 },
      { name: "bankBranchName", label: "Branch", type: "text", span: 1 },
      { name: "bankAccountType", label: "Account type", type: "select", options: bankAccountTypeOptions, span: 1 },
    ],
  },
];

// field name -> module slug / api for select options
const OPTION_SRC: Record<string, string> = {
  departmentId: "departments",
  designationId: "designations",
  gradeId: "grades",
  categoryId: "categories",
  costCenterId: "costCenters",
  businessUnitId: "businessUnits",
  branchId: "branches",
  locationId: "locations",
  shiftId: "shifts",
};

const toDateInput = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : "");

export function EmployeeForm({ employeeId }: { employeeId?: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(() => employeeSchema, []);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const srcs = Object.entries(OPTION_SRC).map(async ([field, slug]) => {
          const res = await listResource<Record<string, unknown>>(setupApi(slug), { pageSize: 500 });
          const labelKey = slug === "designations" ? "title" : "name";
          const opts = res.data.map((r) => ({ value: String(r.id), label: String(r[labelKey] ?? r.name ?? r.id) }));
          return [field, opts] as const;
        });
        srcs.push(
          (async () => {
            const res = await listResource<Record<string, unknown>>(employeesApi, { pageSize: 500 });
            return [
              "reportingManagerId",
              res.data.map((r) => ({
                value: String(r.id),
                label: `${r.employeeCode} — ${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
              })),
            ] as const;
          })()
        );
        const all = await Promise.all(srcs);
        setOptions(Object.fromEntries(all));
      } catch {
        // options best-effort
      }
    };

    const loadRecord = async () => {
      if (!employeeId) {
        setLoading(false);
        return;
      }
      try {
        const rec = (await apiFetch(`${employeesApi}/${employeeId}`)) as Record<string, unknown> & {
          bankDetails?: (Record<string, unknown> & { accountNumber: string })[];
        };
        const bank = rec.bankDetails?.[0];
        reset({
          employeeCode: rec.employeeCode,
          firstName: rec.firstName,
          middleName: rec.middleName ?? "",
          lastName: rec.lastName,
          dob: toDateInput(rec.dob),
          gender: rec.gender ?? "",
          maritalStatus: rec.maritalStatus ?? "",
          bloodGroup: rec.bloodGroup ?? "",
          nationality: rec.nationality ?? "",
          personalEmail: rec.personalEmail ?? "",
          mobileNumber: rec.mobileNumber ?? "",
          alternateNumber: rec.alternateNumber ?? "",
          addressLine1: rec.addressLine1 ?? "",
          city: rec.city ?? "",
          state: rec.state ?? "",
          country: rec.country ?? "",
          postalCode: rec.postalCode ?? "",
          doj: toDateInput(rec.doj),
          confirmationDate: toDateInput(rec.confirmationDate),
          probationMonths: rec.probationMonths ?? "",
          employmentType: rec.employmentType ?? "",
          employmentStatus: rec.employmentStatus ?? "",
          companyEmail: rec.companyEmail ?? "",
          internalExtension: rec.internalExtension ?? "",
          departmentId: rec.departmentId ?? "",
          designationId: rec.designationId ?? "",
          gradeId: rec.gradeId ?? "",
          categoryId: rec.categoryId ?? "",
          costCenterId: rec.costCenterId ?? "",
          businessUnitId: rec.businessUnitId ?? "",
          branchId: rec.branchId ?? "",
          locationId: rec.locationId ?? "",
          shiftId: rec.shiftId ?? "",
          reportingManagerId: rec.reportingManagerId ?? "",
          pan: rec.pan ?? "",
          aadhaar: rec.aadhaar ?? "",
          uan: rec.uan ?? "",
          pfNumber: rec.pfNumber ?? "",
          esiNumber: rec.esiNumber ?? "",
          bankAccountHolderName: bank?.accountHolderName ?? "",
          bankAccountNumber: bank?.accountNumber ?? "",
          bankIfscCode: bank?.ifscCode ?? "",
          bankName: bank?.bankName ?? "",
          bankBranchName: bank?.bankBranch ?? "",
          bankAccountType: bank?.accountType ?? "",
        });
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : "Failed to load employee.");
        router.push("/employees");
      } finally {
        setLoading(false);
      }
    };

    void Promise.all([loadOptions(), loadRecord()]);
  }, [employeeId, reset, router]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const body = values;
      if (employeeId) {
        await apiFetch(`${employeesApi}/${employeeId}`, { method: "PATCH", body: JSON.stringify(body) });
        toast.success("Employee updated.");
        router.push(`/employees/${employeeId}`);
      } else {
        const created = (await apiFetch(`${employeesApi}`, {
          method: "POST",
          body: JSON.stringify(body),
        })) as { id: string };
        toast.success("Employee onboarded.");
        router.push(`/employees/${created.id}`);
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  });

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-muted-foreground">
        <Spinner /> Loading…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={employeeId ? `/employees/${employeeId}` : "/employees"} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <h1 className="text-xl font-semibold">{employeeId ? "Edit employee" : "Onboard employee"}</h1>
          <p className="text-sm text-muted-foreground">Personal, employment, statutory and banking records.</p>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner /> : <Save className="h-4 w-4" />}
          {employeeId ? "Save changes" : "Create employee"}
        </Button>
      </div>

      {SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader>
            <CardTitle className="text-sm">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {section.fields.map((f) => (
              <Field
                key={f.name}
                field={f}
                register={register}
                options={f.options ?? options[f.name]}
                error={(errors[f.name]?.message as string) ?? undefined}
                readOnly={f.type === "readonly"}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </form>
  );
}

interface FieldProps {
  field: Section["fields"][number];
  register: ReturnType<typeof useForm>["register"];
  options?: Option[];
  error?: string;
  readOnly?: boolean;
}

function Field({ field, register, options, error, readOnly }: FieldProps) {
  const { name, label, type } = field;
  const req = name === "firstName" || name === "lastName" || name === "doj";
  const requiredMark = req ? <span className="text-destructive">*</span> : null;
  const span = field.span === 2 ? "sm:col-span-2" : "";

  if (type === "readonly") {
    return (
      <div className={`${span} space-y-1.5`}>
        <Label>{label}</Label>
        <Input readOnly placeholder="Auto-assigned on save" defaultValue="" />
        <p className="text-xs text-muted-foreground">Leave blank to auto-generate the next sequence.</p>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (type === "select") {
    return (
      <div className={`${span} space-y-1.5`}>
        <Label>
          {label} {requiredMark}
        </Label>
        <Select {...register(name)} defaultValue={options?.[0]?.value}>
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`${span} space-y-1.5`}>
      <Label>
        {label} {requiredMark}
      </Label>
      <Input
        type={type}
        autoComplete="off"
        {...register(name)}
      />
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}