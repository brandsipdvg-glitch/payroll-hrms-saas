import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// HTML + CSV document generators for income-tax compliance (Form 16, 24Q, etc.)
// ---------------------------------------------------------------------------

const inr = (v: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(round2(v));
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function docShell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; font-size: 13px; color: #111; margin: 0; background:#f3f4f6; }
    .sheet { max-width: 880px; margin: 24px auto; background: #fff; padding: 40px 48px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
    h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 28px 0 10px; border-bottom: 1.5px solid #111; padding-bottom: 4px; }
    .center { text-align: center; }
    .muted { color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #999; padding: 6px 8px; vertical-align: top; }
    th { background: #eef1f5; text-align: left; font-size: 12px; }
    td.num, th.num, .num { text-align: right; font-variant-numeric: tabular-nums; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 32px; }
    .grid .item { display: flex; justify-content: space-between; border-bottom: 1px dotted #bbb; padding: 3px 0; }
    .total td { font-weight: 700; background: #fbf7e9; }
    .sign { display:flex; justify-content: space-between; margin-top: 84px; }
    .note { font-size: 11px; color: #666; margin-top: 26px; line-height: 1.5; }
    @media print { body { background: #fff; } .sheet { box-shadow:none; margin:0; max-width:none; } }
  </style></head><body><div class="sheet">${body}</div></body></html>`;
}

function kv(label: string, value: unknown, format?: (v: number) => string) {
  return `<tr><td>${esc(label)}</td><td class="num">${esc(typeof value === "number" && format ? format(value) : value)}</td></tr>`;
}

// ---------------------------------------------------------------------------
// Tax computation sheet (per employee)
// ---------------------------------------------------------------------------

type Computed = {
  financialYear: string;
  regime: string;
  throughMonth: number;
  monthsRemaining: number;
  grossAnnual: number;
  hraAnnual: number;
  hraExemptionClaimed: number;
  hraExemptionAllowed: number;
  professionalTaxAnnual: number;
  standardDeduction: number;
  salaryIncome: number;
  section80C: number;
  section80D: number;
  nps80CCD1B: number;
  homeLoanInterest: number;
  otherDeductions: number;
  totalDeductions: number;
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  educationCess: number;
  netAnnualTax: number;
  monthlyTds: number;
  suggestedRemainingMonthly: number;
  ytdGross: number;
  ytdTds: number;
  previousEmployerIncome: number;
  previousEmployerTax: number;
};

type CompanyLike = { name: string; pan: string | null; address?: string | null } | null;

export function renderTaxComputationHtml(emp: { employeeCode: string; firstName: string; lastName: string; pan: string | null; uan?: string | null; designation?: { title: string } | null }, company: CompanyLike, computed: Computed): string {
  const regimeLabel = computed.regime === "NEW" ? "New (default) regime" : "Old regime with deductions";
  const body = `
  <h1>Tax Computation Sheet</h1>
  <p class="center muted">Financial Year ${esc(computed.financialYear)} &middot; ${esc(company?.name ?? "")} &middot; Regime: ${esc(regimeLabel)}</p>
  <h2>Employee details</h2>
  <table><tr><td><b>Name</b></td><td>${esc(`${emp.firstName} ${emp.lastName}`)}</td><td><b>Code</b></td><td>${esc(emp.employeeCode)}</td></tr>
  <tr><td><b>PAN</b></td><td>${esc(emp.pan ?? "-")}</td><td><b>Designation</b></td><td>${esc(emp.designation?.title ?? "-")}</td></tr>
  <tr><td><b>Employer</b></td><td>${esc(company?.name ?? "-")}</td><td><b>Employer PAN</b></td><td>${esc(company?.pan ?? "-")}</td></tr></table>
  <h2>Computation of income</h2>
  <table>
    ${kv("Gross salary (Apr&ndash;Mar projection)", computed.grossAnnual, inr)}
    ${kv("HRA exemption claim (u/s 10(13A))", computed.hraExemptionClaimed, inr)}
    ${kv("Professional tax", computed.professionalTaxAnnual, inr)}
    ${kv("Standard deduction", computed.standardDeduction, inr)}
    ${kv("Salary income", computed.salaryIncome, inr)}
    ${kv("Deductions u/s 80C (incl. EPF, LIC, ELSS)", computed.section80C, inr)}
    ${kv("Deductions u/s 80D (health insurance)", computed.section80D, inr)}
    ${kv("NPS u/s 80CCD(1B)", computed.nps80CCD1B, inr)}
    ${kv("Home loan interest u/s 24(b)", computed.homeLoanInterest, inr)}
    ${kv("Other deductions", computed.otherDeductions, inr)}
    ${kv("Total deductions", computed.totalDeductions, inr)}
    <tr class="total"><td>Taxable income</td><td class="num">${inr(computed.taxableIncome)}</td></tr>
    ${kv("Tax on slab rates", computed.taxBeforeRebate, inr)}
    ${kv("Rebate u/s 87A", computed.rebate87A, inr)}
    ${kv("Health &amp; education cess (4%)", computed.educationCess, inr)}
    <tr class="total"><td>Net annual tax liability</td><td class="num">${inr(computed.netAnnualTax)}</td></tr>
    ${kv("Tax paid with previous employer", computed.previousEmployerTax, inr)}
    ${kv("TDS already deducted this year", computed.ytdTds, inr)}
    <tr class="total"><td>Monthly TDS to deduct (per month)</td><td class="num">${inr(computed.monthlyTds)}</td></tr>
    ${kv("Suggested remaining monthly deduction", computed.suggestedRemainingMonthly, inr)}
  </table>
  <p class="muted">This is an indicative computation based on declared investments and current-year payslips; it is not tax advice.</p>
  <div class="sign"><div>Employer's signature / seal</div><div>Employee's signature &amp; date</div></div>`;
  return docShell(`Tax computation ${emp.employeeCode} ${computed.financialYear}`, body);
}

// ---------------------------------------------------------------------------
// Form 16 (Parts A & B)
// ---------------------------------------------------------------------------

export function renderForm16Html(
  emp: { employeeCode: string; firstName: string; lastName: string; pan: string | null; address?: string | null; designation?: { title: string } | null },
  company: CompanyLike,
  settings: { tan: string | null; itTdsCircle: string | null; itAssessingOfficer: string | null; pfNumber?: string | null; esiNumber?: string | null } | null,
  computed: Computed,
  payslips: Array<{ run: { month: number; year: number }; components: Array<{ name: string; amount: Prisma.Decimal; componentType: string }> }>
): string {
  const fyMonths = fiscalMonths(computed.financialYear);
  const grossByMonth = new Map<string, number>();
  const tdsByMonth = new Map<string, number>();
  for (const ps of payslips) {
    const key = `${ps.run.year}-${String(ps.run.month).padStart(2, "0")}`;
    grossByMonth.set(key, Number(ps.components.filter((c) => c.componentType !== "DEDUCTION").reduce((s, c) => s + Number(c.amount), 0)));
    tdsByMonth.set(key, Number(ps.components.find((c) => c.name.toLowerCase() === "tds")?.amount ?? 0));
  }
  const rows = fyMonths
    .map(({ label, year, month }) => {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      return `<tr><td>${esc(label)}</td><td class="num">${inr(grossByMonth.get(key) ?? 0)}</td><td class="num">${inr(tdsByMonth.get(key) ?? 0)}</td></tr>`;
    })
    .join("");

  const partB = `
  <h2>Part B &mdash; Details of salary paid &amp; tax deducted</h2>
  <table>
    ${kv("Gross salary", computed.grossAnnual, inr)}
    ${kv("Less: HRA exemption", computed.hraExemptionClaimed, inr)}
    ${kv("Less: professional tax", computed.professionalTaxAnnual, inr)}
    ${kv("Less: standard deduction", computed.standardDeduction, inr)}
    ${kv("Salary income", computed.salaryIncome, inr)}
    ${kv("Less: deductions (80C/80D/NPS/24(b)/other)", computed.totalDeductions, inr)}
    ${kv("Taxable income", computed.taxableIncome, inr)}
    ${kv("Tax on slab rates", computed.taxBeforeRebate, inr)}
    ${kv("Rebate u/s 87A", computed.rebate87A, inr)}
    ${kv("Health &amp; education cess", computed.educationCess, inr)}
    ${kv("Net tax payable", computed.netAnnualTax, inr)}
    ${kv("TDS deducted &amp; paid to credit of Central Government", computed.ytdTds, inr)}
  </table>
  <table>
    <tr><th>Month</th><th class="num">Taxable salary (Rs.)</th><th class="num">TDS deducted (Rs.)</th></tr>
    ${rows}
  </table>`;

  const body = `
  <h1>Form No. 16</h1>
  <p class="center muted">Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source on salary</p>
  <p class="center muted">Financial Year ${esc(computed.financialYear)} &middot; Regime: ${esc(computed.regime === "NEW" ? "New regime (default)" : "Old regime")}</p>
  <h2>Part A &mdash; Employer details</h2>
  <table>
    <tr><td><b>Name &amp; address of employer</b></td><td>${esc(`${company?.name ?? "-"}${company?.address ? `, ${company.address}` : ""}`)}</td></tr>
    <tr><td><b>TAN of employer</b></td><td>${esc(settings?.tan ?? "-")}</td></tr>
    <tr><td><b>TDS Circle / Ward</b></td><td>${esc(settings?.itTdsCircle ?? "-")}</td></tr>
    <tr><td><b>Assessing Officer</b></td><td>${esc(settings?.itAssessingOfficer ?? "-")}</td></tr>
    <tr><td><b>PAN of employer</b></td><td>${esc(company?.pan ?? "-")}</td></tr>
  </table>
  <h2>Part A &mdash; Employee details</h2>
  <table>
    <tr><td><b>Name</b></td><td>${esc(`${emp.firstName} ${emp.lastName}`)}</td><td><b>PAN</b></td><td>${esc(emp.pan ?? "-")}</td></tr>
    <tr><td><b>Employee code</b></td><td>${esc(emp.employeeCode)}</td><td><b>Designation</b></td><td>${esc(emp.designation?.title ?? "-")}</td></tr>
    <tr><td><b>Address</b></td><td colspan="3">${esc(emp.address ?? "-")}</td></tr>
  </table>
  ${partB}
  <p class="note">Certified that the above is a true and correct statement of the tax deducted at source from remuneration paid/payable to the employee during the financial year ${esc(computed.financialYear)}, and such tax has been paid to the credit of the Central Government within the prescribed time limits.</p>
  <div class="sign"><div>Signature of person responsible for deducting tax</div><div>Date</div></div>`;
  return docShell(`Form 16 ${emp.firstName} ${emp.lastName}`, body);
}

function fiscalMonths(financialYear: string): Array<{ label: string; year: number; month: number }> {
  const startYear = Number(financialYear.split("-")[0]);
  const months: Array<{ label: string; year: number; month: number }> = [];
  const names = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
  for (let i = 0; i < 12; i++) {
    const m = ((i + 3) % 12) + 1;
    const y = i < 9 ? startYear : startYear + 1;
    months.push({ label: `${names[i]} ${y}`, year: y, month: m });
  }
  return months;
}

// ---------------------------------------------------------------------------
// Form 24Q (quarterly TDS statement)
// ---------------------------------------------------------------------------

type RunLike = {
  month: number;
  year: number;
  payslips: Array<{
    grossSalary: Prisma.Decimal;
    employee: { employeeCode: string; firstName: string; lastName: string; pan: string | null };
    components: Array<{ name: string; amount: Prisma.Decimal }>;
  }>;
};

const qOfMonth = (m: number, y: number, fyStartYear: number) => {
  if (y === fyStartYear) {
    if (m <= 3) return 4;
    if (m <= 6) return 1;
    if (m <= 9) return 2;
    return 3;
  }
  if (m <= 3) return 4;
  return 1;
};

export function buildForm24qCsv(financialYear: string, quarter: number | undefined, runs: RunLike[], companyId: string): string {
  const fyStartYear = Number(financialYear.split("-")[0]);
  const header = [
    "FinancialYear",
    "Quarter",
    "CompanyId",
    "EmployeeCode",
    "EmployeeName",
    "PAN",
    "Month",
    "Year",
    "GrossSalary",
    "TDSDeducted",
    "Section",
  ];
  const rows: string[][] = [header];
  for (const run of runs) {
    const q = quarter ?? qOfMonth(run.month, run.year, fyStartYear);
    const periodLabel = `Q${q}`;
    for (const ps of run.payslips) {
      const tds = Number(ps.components.find((c) => c.name.toLowerCase() === "tds")?.amount ?? 0);
      rows.push([
        financialYear,
        periodLabel,
        companyId,
        ps.employee.employeeCode,
        `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
        ps.employee.pan ?? "",
        String(run.month),
        String(run.year),
        String(Number(ps.grossSalary)),
        String(tds),
        "192",
      ]);
    }
  }
  return rows.map((r) => r.map((v) => (/,|"|\n/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
}