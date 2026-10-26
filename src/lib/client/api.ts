export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

const JSON_HEADER = { Accept: "application/json" };

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiClientError(res.status, e?.code ?? "ERROR", e?.message ?? "Request failed.", e?.details);
  }
  return (json?.data ?? json) as T;
}

export async function listResource<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<Paginated<T>> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
  }
  const res = await fetch(`${path}?${qs.toString()}`, { headers: JSON_HEADER });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiClientError(res.status, e?.code ?? "ERROR", e?.message ?? "Request failed.", e?.details);
  }
  return json as Paginated<T>;
}

export const setupApi = (slug: string) => `/api/v1/setup/${slug}`;
export const companiesApi = "/api/v1/companies";
export const employeesApi = "/api/v1/employees";
export const attendanceApi = "/api/v1/attendance";
export const attendancePolicyApi = "/api/v1/attendance/policies";
export const attendanceImportApi = "/api/v1/attendance/imports";
export const biometricApi = "/api/v1/attendance/biometric";
export const leaveTypeApi = "/api/v1/leave/types";
export const leavePolicyApi = "/api/v1/leave/policies";
export const leaveRequestApi = "/api/v1/leave/requests";
export const leaveBalanceApi = "/api/v1/leave/balances";
export const leaveEncashmentApi = "/api/v1/leave/encashments";

export const payComponentsApi = "/api/v1/payroll/components";
export const salaryStructuresApi = "/api/v1/payroll/structures";
export const payrollRunsApi = "/api/v1/payroll/runs";
export const payrollPayslipsApi = "/api/v1/payroll/payslips";
export const payrollAdjustmentsApi = "/api/v1/payroll/adjustments";
export const payrollSummaryApi = "/api/v1/payroll/summary";
export const myPayslipsApi = "/api/v1/me/payslips";

export const complianceApi = "/api/v1/compliance";
export const complianceDashboardApi = `${complianceApi}/dashboard`;
export const complianceSettingsApi = `${complianceApi}/settings`;
export const pfConfigApi = `${complianceApi}/pf/config`;
export const pfRegisterApi = `${complianceApi}/pf/register`;
export const pfEcrApi = `${complianceApi}/pf/ecr`;
export const pfChallanApi = `${complianceApi}/pf/challan`;
export const esiConfigApi = `${complianceApi}/esi/config`;
export const esiRegisterApi = `${complianceApi}/esi/register`;
export const esiChallanApi = `${complianceApi}/esi/challan`;
export const esiReturnApi = `${complianceApi}/esi/return`;
export const ptRegionsApi = `${complianceApi}/pt/regions`;
export const ptRegisterApi = `${complianceApi}/pt/register`;
export const ptChallanApi = `${complianceApi}/pt/challan`;
export const lwfConfigApi = `${complianceApi}/lwf/config`;
export const lwfRegisterApi = `${complianceApi}/lwf/register`;
export const itConfigApi = `${complianceApi}/tax/config`;
export const itDeclarationsApi = `${complianceApi}/tax/declarations`;
export const itComputeApi = `${complianceApi}/tax/compute`;
export const itSheetApi = `${complianceApi}/tax/sheet`;
export const itForm16Api = `${complianceApi}/tax/form16`;
export const itForm24qApi = `${complianceApi}/tax/form24q`;
export const tdsRegisterApi = `${complianceApi}/tds/register`;
export const tdsRegisterCsvApi = `${tdsRegisterApi}.csv`;
export const myTaxApi = "/api/v1/me/tax";

export const financeApi = "/api/v1/finance";
export const reimbursementsApi = `${financeApi}/reimbursements`;
export const loansApi = `${financeApi}/loans`;
export const bonusPlansApi = `${financeApi}/bonus-plans`;
export const gratuityApi = `${financeApi}/gratuity`;
export const settlementsApi = `${financeApi}/settlements`;
export const meReimbursementsApi = "/api/v1/me/reimbursements";
export const meLoansApi = "/api/v1/me/loans";
export const meBonusesApi = "/api/v1/me/bonuses";
export const meGratuityApi = "/api/v1/me/gratuity";

export const complianceApplyTdsApi = (runId: string) => `${complianceApi}/runs/${runId}/apply-tds`;

export const assetsApi = "/api/v1/assets";
export const assetAssignmentsApi = `${assetsApi}/assignments`;
export const myAssetsApi = "/api/v1/me/assets";
export const myProfileApi = "/api/v1/me/profile";
export const myProfileBankApi = `${myProfileApi}/bank-details`;

export const reportsApi = "/api/v1/reports";
export const reportTypeApi = (type: string) => `${reportsApi}/${type}`;
export const reportQueryApi = `${reportsApi}/query`;
export const reportSchemaApi = `${reportsApi}/schema`;
export const savedReportsApi = `${reportsApi}/saved`;

export const adminApi = "/api/v1/admin";
export const analyticsApi = `${adminApi}/analytics`;
export const bulkUploadEmployeesApi = `${adminApi}/bulk-upload/employees`;
export const emailPayslipsApi = `${adminApi}/email-payslips`;
export const scheduledReportsApi = `${adminApi}/scheduled-reports`;
export const emailDeliveriesApi = `${adminApi}/email-deliveries`;
export const backupApi = `${adminApi}/backup`;
export const restoreApi = `${adminApi}/restore`;
export const exportDataApi = `${adminApi}/export`;

export const mobileApi = "/api/mobile/v1";

export function complianceCsvUrl(base: string, month: number, year: number): string {
  return `${base}?month=${month}&year=${year}`;
}

export async function downloadCsv(base: string, month: number, year: number): Promise<void> {
  return downloadResource(complianceCsvUrl(base, month, year));
}

export async function downloadResource(path: string): Promise<void> {
  const res = await fetch(path, { headers: JSON_HEADER });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    const e = json?.error;
    throw new ApiClientError(res.status, e?.code ?? "ERROR", e?.message ?? "Download failed.", e?.details);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? decodeURIComponent(match[1]) : "download";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}