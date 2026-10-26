import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/errors";
import { ReportObject, ReportType, ReportFormat } from "@prisma/client";

// ---------------------------------------------------------------------------
// Reporting Engine — column metadata, dataset builders and serializers
// ---------------------------------------------------------------------------

export type ReportRow = Record<string, unknown>;

export interface ReportColumn {
  key: string;
  label: string;
  type?: "string" | "number" | "date" | "currency";
}

type FieldResolver = (row: Record<string, any>) => unknown;

export const REPORT_OBJECTS: Record<ReportObject, { columns: ReportColumn[] }> = {
  employees: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "grade", label: "Grade" },
      { key: "employmentType", label: "Employment Type" },
      { key: "employmentStatus", label: "Status" },
      { key: "doj", label: "Date of Joining", type: "date" },
      { key: "dob", label: "Date of Birth", type: "date" },
      { key: "gender", label: "Gender" },
      { key: "mobileNumber", label: "Mobile" },
      { key: "personalEmail", label: "Personal Email" },
      { key: "companyEmail", label: "Company Email" },
      { key: "city", label: "City" },
    ],
  },
  attendance: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "date", label: "Date", type: "date" },
      { key: "status", label: "Status" },
      { key: "checkIn", label: "Check In", type: "string" },
      { key: "checkOut", label: "Check Out", type: "string" },
      { key: "workingMinutes", label: "Working (min)", type: "number" },
      { key: "lateMinutes", label: "Late (min)", type: "number" },
      { key: "overtimeMinutes", label: "OT (min)", type: "number" },
    ],
  },
  leaveRequests: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "leaveType", label: "Leave Type" },
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
      { key: "days", label: "Days", type: "number" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Applied On", type: "date" },
      { key: "reason", label: "Reason" },
    ],
  },
  reimbursements: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "description", label: "Description" },
      { key: "expenseDate", label: "Expense Date", type: "date" },
      { key: "amount", label: "Amount", type: "currency" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Applied On", type: "date" },
      { key: "processedAt", label: "Processed On", type: "date" },
    ],
  },
  loans: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "loanType", label: "Loan Type" },
      { key: "principalAmount", label: "Principal", type: "currency" },
      { key: "interestRateAnnual", label: "Interest %" },
      { key: "tenureMonths", label: "Tenure (months)", type: "number" },
      { key: "_start", label: "Start" },
      { key: "emiAmount", label: "EMI", type: "currency" },
      { key: "totalInterest", label: "Total Interest", type: "currency" },
      { key: "totalRepayable", label: "Repayable", type: "currency" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
  payslips: {
    columns: [
      { key: "month", label: "Month", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "grossSalary", label: "Gross", type: "currency" },
      { key: "totalEarnings", label: "Total Earnings", type: "currency" },
      { key: "totalDeductions", label: "Total Deductions", type: "currency" },
      { key: "netSalary", label: "Net Pay", type: "currency" },
      { key: "status", label: "Status" },
    ],
  },
  payrollRuns: {
    columns: [
      { key: "month", label: "Month", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "status", label: "Status" },
      { key: "runDate", label: "Run Date", type: "date" },
      { key: "employeeCount", label: "Employees", type: "number" },
      { key: "gross", label: "Gross", type: "currency" },
      { key: "net", label: "Net", type: "currency" },
      { key: "deductions", label: "Deductions", type: "currency" },
    ],
  },
  bonusAllocations: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "plan", label: "Bonus Plan" },
      { key: "type", label: "Type" },
      { key: "amount", label: "Amount", type: "currency" },
      { key: "reason", label: "Reason" },
      { key: "paidAt", label: "Paid On", type: "date" },
    ],
  },
  gratuityRecords: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "financialYear", label: "Financial Year" },
      { key: "yearsOfService", label: "Years of Service" },
      { key: "basicLastDrawn", label: "Basic Last Drawn", type: "currency" },
      { key: "gratuityAmount", label: "Gratuity", type: "currency" },
      { key: "status", label: "Status" },
      { key: "computedAt", label: "Computed On", type: "date" },
    ],
  },
  settlements: {
    columns: [
      { key: "employeeCode", label: "Employee Code" },
      { key: "_name", label: "Name" },
      { key: "lastWorkingDate", label: "Last Working Day", type: "date" },
      { key: "totalAmount", label: "Total Settlement", type: "currency" },
      { key: "status", label: "Status" },
      { key: "createdAt", label: "Created", type: "date" },
    ],
  },
  assets: {
    columns: [
      { key: "assetTag", label: "Asset Tag" },
      { key: "category", label: "Category" },
      { key: "name", label: "Name" },
      { key: "serialNumber", label: "Serial Number" },
      { key: "model", label: "Model" },
      { key: "purchaseValue", label: "Purchase Value", type: "currency" },
      { key: "status", label: "Status" },
      { key: "_assignee", label: "Assigned To" },
      { key: "purchasedOn", label: "Purchased On", type: "date" },
    ],
  },
};

const nameResolver: FieldResolver = (row) =>
  row.employee
    ? `${row.employee.firstName ?? ""} ${row.employee.lastName ?? ""}`.trim()
    : `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

const RESOLVERS: Partial<Record<string, (row: Record<string, any>) => unknown>> = {
  _name: nameResolver,
};

// ---------------------------------------------------------------------------
// Dataset builders per object
// ---------------------------------------------------------------------------

type FilterMap = Record<string, unknown>;

function rangeFilter(field: string, f?: { from?: string; to?: string } | null) {
  if (!f) return undefined;
  const where: Record<string, unknown> = {};
  if (f.from) where.gte = new Date(String(f.from));
  if (f.to) where.lt = new Date(new Date(String(f.to)).getTime() + 86400000);
  return Object.keys(where).length ? where : undefined;
}

function equalityWhere(field: string, value: unknown) {
  if (typeof value === "string") {
    if (value.includes(",")) return { in: value.split(",").map((s) => s.trim()) };
    return value;
  }
  if (Array.isArray(value)) return { in: value };
  if (value && typeof value === "object") return value;
  return value;
}

export async function fetchReportRows(companyId: string, object: ReportObject, filters: FilterMap = {}): Promise<ReportRow[]> {
  const f = filters;
  switch (object) {
    case "employees": {
      const rows = await prisma.employee.findMany({
        where: {
          companyId,
          ...(f.departmentId ? { departmentId: String(f.departmentId) } : {}),
          ...(f.designationId ? { designationId: String(f.designationId) } : {}),
          ...(f.employmentStatus ? { employmentStatus: equalityWhere("employmentStatus", f.employmentStatus) as never } : {}),
          ...(f.doj ? { doj: rangeFilter("doj", f.doj as never) } : {}),
        },
        include: {
          department: { select: { name: true } },
          designation: { select: { title: true } },
          grade: { select: { name: true } },
        },
        orderBy: { employeeCode: "asc" },
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "attendance": {
      const range = rangeFilter("date", (f.date ?? f.period) as never);
      const rows = await prisma.attendance.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(range ? { date: range } : {}),
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
        },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: [{ date: "asc" }, { employeeId: "asc" }],
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "leaveRequests": {
      const range = rangeFilter("startDate", (f.period ?? f.startDate) as never);
      const rows = await prisma.leaveRequest.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(range ? { startDate: range } : {}),
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          leaveType: { select: { name: true } },
        },
        orderBy: { startDate: "desc" },
      });
      return rows.map((r) => ({ ...r, leaveType: r.leaveType?.name, _name: nameResolver(r) }));
    }
    case "reimbursements": {
      const range = rangeFilter("expenseDate", (f.period ?? f.expenseDate) as never);
      const rows = await prisma.reimbursement.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(range ? { expenseDate: range } : {}),
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
          ...(f.type ? { type: equalityWhere("type", f.type) as never } : {}),
        },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "loans": {
      const rows = await prisma.loan.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
          ...(f.loanType ? { loanType: equalityWhere("loanType", f.loanType) as never } : {}),
        },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({ ...r, _start: `${r.startMonth}/${r.startYear}`, _name: nameResolver(r) }));
    }
    case "payslips": {
      const rows = await prisma.payslip.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(f.year || f.month ? { run: { ...(f.year ? { year: Number(f.year) } : {}), ...(f.month ? { month: Number(f.month) } : {}) } } : {}),
        },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "payrollRuns": {
      const rows = await prisma.payrollRun.findMany({
        where: {
          companyId,
          ...(f.year ? { year: Number(f.year) } : {}),
          ...(f.month ? { month: Number(f.month) } : {}),
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
        },
        include: { _count: { select: { payslips: true } } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      });
      return rows.map((r) => ({
        ...r,
        runDate: r.processedAt ?? r.createdAt,
        employeeCount: r._count.payslips,
        gross: r.totalGross,
        net: r.totalNet,
        deductions: r.totalDeductions,
        runAt: r.processedAt ?? r.createdAt,
      }));
    }
    case "bonusAllocations": {
      const rows = await prisma.bonusAllocation.findMany({
        where: {
          companyId,
          ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
          ...(f.planId ? { planId: String(f.planId) } : {}),
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          plan: { select: { title: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({ ...r, plan: r.plan?.title, type: r.plan?.type, _name: nameResolver(r) }));
    }
    case "gratuityRecords": {
      const rows = await prisma.gratuityRecord.findMany({
        where: { companyId, ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}) },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { computedAt: "desc" },
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "settlements": {
      const rows = await prisma.settlement.findMany({
        where: { companyId, ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}) },
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((r) => ({ ...r, _name: nameResolver(r) }));
    }
    case "assets": {
      const rows = await prisma.asset.findMany({
        where: {
          companyId,
          ...(f.status ? { status: equalityWhere("status", f.status) as never } : {}),
          ...(f.category ? { category: equalityWhere("category", f.category) as never } : {}),
        },
        include: {
          assignments: {
            where: { status: "ACTIVE" },
            include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
            take: 1,
          },
        },
        orderBy: { assetTag: "asc" },
      });
      return rows.map((r) => ({
        ...r,
        purchasedOn: r.purchaseDate,
        _assignee: r.assignments[0]?.employee
          ? `${r.assignments[0].employee.firstName} ${r.assignments[0].employee.lastName}`.trim()
          : "",
      }));
    }
    default:
      throw badRequest(`Unknown report object: ${object}`);
  }
}

// ---------------------------------------------------------------------------
// Standard aggregate reports (PAYROLL / COMPLIANCE / HR)
// ---------------------------------------------------------------------------

export async function payrollAggregateReport(companyId: string, filters: FilterMap = {}) {
  const f = filters;
  const where: Record<string, unknown> = { companyId };
  if (f.financialYear) {
    const m = /^(\d{4})-\d{2}$/.exec(String(f.financialYear));
    if (m) where.year = { gte: Number(m[1]), lte: Number(m[1]) };
  }
  const rows = await prisma.payrollRun.findMany({
    where: where as never,
    include: { _count: { select: { payslips: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const summary = rows.reduce(
    (acc, r) => {
      acc.gross += Number(r.totalGross);
      acc.net += Number(r.totalNet);
      acc.deductions += Number(r.totalDeductions);
      acc.payslips += r._count.payslips;
      return acc;
    },
    { runs: rows.length, payslips: 0, gross: 0, net: 0, deductions: 0 }
  );

  const lines = rows.map((r) => ({
    month: r.month,
    year: r.year,
    status: r.status,
    employees: r._count.payslips,
    gross: Number(r.totalGross),
    net: Number(r.totalNet),
    deductions: Number(r.totalDeductions),
  }));

  return { rows: lines, summary };
}

export async function complianceAggregateReport(companyId: string, filters: FilterMap = {}) {
  const month = Number(filters.month ?? new Date().getMonth() + 1);
  const year = Number(filters.year ?? new Date().getFullYear());

  const payslips = await prisma.payslip.findMany({
    where: { companyId, run: { month, year } },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, uan: true, esiNumber: true, pan: true } },
      components: { include: { payComponent: { select: { code: true, componentType: true } } } },
    },
  });

  const { computePf, computeEsi } = await import("@/server/services/compliance");
  const { getPfConfig, getEsiConfig } = await import("@/server/services/compliance");
  const pfCfg = await getPfConfig(companyId);
  const esiCfg = await getEsiConfig(companyId);

  const rows = payslips.map((ps) => {
    const pf = pfCfg ? computePf(ps, pfCfg) : null;
    const esi = esiCfg ? computeEsi(ps, esiCfg) : null;
    return {
      employeeCode: ps.employee.employeeCode,
      name: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      uan: ps.employee.uan ?? "",
      esiNumber: ps.employee.esiNumber ?? "",
      gross: Number(ps.grossSalary),
      pfEmployee: pf?.employeeShare ?? 0,
      pfEmployer: pf?.employerShare ?? 0,
      eps: pf?.eps ?? 0,
      esiEmployee: esi?.employeeShare ?? 0,
      esiEmployer: esi?.employerShare ?? 0,
      professionalTax: 0,
      lwf: 0,
      net: Number(ps.netSalary),
    };
  });

  const summary = {
    month,
    year,
    employees: rows.length,
    pfEmployee: rows.reduce((s, r) => s + r.pfEmployee, 0),
    pfEmployer: rows.reduce((s, r) => s + r.pfEmployer, 0),
    eps: rows.reduce((s, r) => s + r.eps, 0),
    esiEmployee: rows.reduce((s, r) => s + r.esiEmployee, 0),
    esiEmployer: rows.reduce((s, r) => s + r.esiEmployer, 0),
    professionalTax: rows.reduce((s, r) => s + r.professionalTax, 0),
    lwf: rows.reduce((s, r) => s + r.lwf, 0),
  };

  return { rows, summary };
}

export async function hrAggregateReport(companyId: string, filters: FilterMap = {}) {
  const gender = await prisma.employee.groupBy({ where: { companyId }, by: ["gender"], _count: true });
  const status = await prisma.employee.groupBy({ where: { companyId }, by: ["employmentStatus"], _count: true });
  const dept = await prisma.employee.groupBy({
    where: { companyId },
    by: ["departmentId"],
    _count: true,
  });
  const departments = await prisma.department.findMany({ where: { companyId }, select: { id: true, name: true } });
  const month = Number(filters.month ?? new Date().getMonth() + 1);
  const year = Number(filters.year ?? new Date().getFullYear());

  const [activeCount, probationCount, pendingLeave, openSettlements, allocatedAssets, availableAssets] = await Promise.all([
    prisma.employee.count({ where: { companyId, employmentStatus: { in: ["ACTIVE", "PROBATION"] } } }),
    prisma.employee.count({ where: { companyId, employmentStatus: "PROBATION" } }),
    prisma.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
    prisma.settlement.count({ where: { companyId, status: { in: ["DRAFT", "APPROVED"] } } }),
    prisma.asset.count({ where: { companyId, status: "ALLOCATED" } }),
    prisma.asset.count({ where: { companyId, status: "AVAILABLE" } }),
  ]);

  const rows = dept.map((d) => ({
    department: departments.find((x) => x.id === d.departmentId)?.name ?? "Unassigned",
    employees: d._count,
  }));

  const summary = {
    asOf: `${year}-${String(month).padStart(2, "0")}`,
    totalEmployees: gender.reduce((s, g) => s + g._count, 0),
    active: activeCount,
    probation: probationCount,
    pendingLeaves: pendingLeave,
    openSettlements,
    allocatedAssets,
    availableAssets,
    genderBreakdown: Object.fromEntries(gender.map((g) => [g.gender, g._count])),
    statusBreakdown: Object.fromEntries(status.map((s) => [s.employmentStatus, s._count])),
  };

  return { rows, summary };
}

// ---------------------------------------------------------------------------
// Report execution + serialization
// ---------------------------------------------------------------------------

export interface ReportExecution {
  columns: string[];
  rows: ReportRow[];
  summary?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Report execution + serialization
// ---------------------------------------------------------------------------

export function selectColumns(rows: ReportRow[], columns: string[]): ReportRow[] {
  return rows.map((r) => {
    const out: ReportRow = {};
    for (const c of columns) {
      out[c] = r[c] ?? null;
    }
    return out;
  });
}

export function applyColumnLabels(columnKeys: string[], object: ReportObject): string[] {
  const schema = REPORT_OBJECTS[object];
  return columnKeys.map((k) => schema.columns.find((c) => c.key === k)?.label ?? k);
}

type AggregateRunner = (companyId: string, filters: FilterMap) => Promise<{ rows: ReportRow[]; summary: Record<string, unknown> }>;

const AGGREGATE_RUNNERS: Partial<Record<ReportType, AggregateRunner>> = {
  PAYROLL: payrollAggregateReport,
  COMPLIANCE: complianceAggregateReport,
  HR: hrAggregateReport,
};

export async function runReportType(
  companyId: string,
  type: ReportType,
  filters: FilterMap = {}
): Promise<{ rows: ReportRow[]; summary: Record<string, unknown> }> {
  if (type === "ATTENDANCE") {
    const { attendanceReportDataset } = await import("@/server/services/reporting-attendance");
    return attendanceReportDataset(companyId, filters);
  }
  if (type === "LEAVE") {
    const rows = await fetchReportRows(companyId, "leaveRequests", filters);
    return { rows, summary: {} };
  }
  const runner = AGGREGATE_RUNNERS[type];
  if (!runner) throw badRequest(`No dataset defined for report type ${type}.`);
  return runner(companyId, filters);
}

export function toCsv(rows: ReportRow[]): string {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `\uFEFF${[headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n")}`;
}

/** Excel-compatible serialization (SpreadsheetML / XML workbook). Works in Excel & LibreOffice. */
export function toExcel(rows: ReportRow[], sheetName = "Report"): string {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return `<Cell><Data ss:Type="String"></Data></Cell>`;
    if (typeof v === "number") return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    const s = String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<Cell><Data ss:Type="String">${s}</Data></Cell>`;
  };
  const headerRow = `<Row>${headers.map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>`;
  const body = rows.map((r) => `<Row>${headers.map((h) => cell(r[h])).join("")}</Row>`).join("");
  const safeSheet = sheetName.replace(/[^\w ]/g, "").slice(0, 31) || "Report";
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E8EAF0" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>${headerRow}${body}</Table>
 </Worksheet>
</Workbook>`;
}

export function serializeReport(rows: ReportRow[], format: ReportFormat, sheetName = "Report"): { mime: string; ext: string; body: string } {
  if (format === "CSV") {
    return { mime: "text/csv; charset=utf-8", ext: "csv", body: toCsv(rows) };
  }
  if (format === "EXCEL") {
    return { mime: "application/vnd.ms-excel; charset=utf-8", ext: "xls", body: toExcel(rows, sheetName) };
  }
  if (format === "PDF") {
    // Dependency-free print-friendly HTML — browsers render to PDF via print.
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const html = `<html><head><meta charset="utf-8"><title>${sheetName}</title></head>
<body style="font-family:-apple-system,sans-serif;font-size:11px">
<h2>${sheetName}</h2><table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%">
<thead><tr>${headers.map((h) => `<th style="text-align:left;background:#eee">${h}</th>`).join("")}</tr></thead>
<tbody>${rows
      .map((r) => `<tr>${headers.map((h) => `<td>${String(r[h] ?? "")}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></body></html>`;
    return { mime: "text/html; charset=utf-8", ext: "html", body: html };
  }
  throw badRequest(`Unsupported format: ${format}`);
}

export function reportTypeFromParam(value: string): ReportType {
  const v = value.toUpperCase();
  const types = Object.values(ReportType) as string[];
  if (!types.includes(v)) throw badRequest(`Invalid report type. Choose one of: ${types.join(", ")}.`);
  return v as ReportType;
}

export function reportObjectFromParam(value: string): ReportObject {
  const objects = Object.values(ReportObject) as string[];
  if (!objects.includes(value)) throw badRequest(`Invalid report object.`);
  return value as ReportObject;
}
