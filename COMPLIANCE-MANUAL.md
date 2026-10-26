# Compliance Module — User Manual

**App URL:** http://localhost:3001  ·  **Login:** email + password
**Demo accounts** (password for all: `Admin@123`)

| User | Role | Access |
|---|---|---|
| `admin@acme.example` (Alex Morgan) | Company Admin | Everything |
| `priya@acme.example` (Priya Sharma) | HR | Full compliance manage |
| `ceo@acme.example` (Rahul Verma) | Manager | Compliance dashboard (read-only) |
| `sde@acme.example` (Meera Nair) | Employee | "My Tax" self-service only |

---

## 1. First-time setup (Company Admin / HR)

Before any register is meaningful, configure these (each can be edited later — **no rates are hardcoded**):

1. **Statutory identifiers** → *Compliance → Compliance Dashboard → "Edit statutory identifiers"* (or `/compliance/settings`): EPFO establishment no. (e.g. `BLR/12345/ABC`), ESI code, TAN, TDS circle, bank details. These print on ECR/challans/Form 16/24Q.
2. **PF / EPS** (`/compliance/pf`) → *Add configuration*: employee/employer %, EPS %, EPF %, wage ceiling & pension ceiling (defaults 12% / 12% / 8.33% / 3.67% / ₹15,000), plus the wage **component codes** that count toward PF (`BASIC,CONVEYANCE,MEDICAL`). Only one can be **Active** — use *Activate* to switch.
3. **ESI** (`/compliance/esi`) → *Add configuration*: employee/employer % (defaults 0.75% / 3.25%), wage ceiling (₹21,000), and wage components. ESI auto-applies only to employees with gross ≤ ceiling.
4. **Professional Tax** (`/compliance/pt`) → *Add region*: state + slabs (from → to → monthly ₹). Startup defaults: ₹0 ≤ ₹14,999, ₹150 ₹15k–19,999, ₹200 ≥ ₹20k (Karnataka).
5. **Labour Welfare Fund** (`/compliance/lwf`) → *Add configuration*: state + fixed employee/employer per-head amounts (20/20).
6. **Income Tax** (`/compliance/tax`) → FY config (slabs for OLD & NEW regime, standard deduction, 80C/80D caps, FY start month). Slabs display read-only here; edit via API/seed.

The Dashboard **"Setup readiness"** panel tells you exactly what's missing (green/badged).

---

## 2. Monthly workflow

1. **Run payroll first** for the month (`/payroll/runs`) — registers are computed from that month's payslips. No run → registers show "No payroll run exists".
2. **Apply TDS** → `Income Tax / TDS → "Apply monthly TDS to draft run"` (creates the `TDS` deduction component on the draft run's payslips).
3. Open **Compliance Dashboard** to review liabilities (PF / EPS, ESI, PT, LWF, TDS cards for that month). Use the month/year picker to move between periods.
4. Download returns as needed (below).

---

## 3. Registers & returns (all CSV unless noted)

| Page | What you can download |
|---|---|
| **PF / EPS** | PF register CSV · ECR (electronic return, per-member UAN/EPS/EPF) · Challan summary |
| **ESI** | Register CSV · Challan summary · Return (per-member IP no.) |
| **Professional Tax** | Register CSV · **Challan CSV** (state, employees, total due) |
| **LWF** | Register CSV |
| **Income Tax / TDS** | TDS register CSV · Form 24Q (CSV, quarter auto-matched to selected month) · per-employee **Form 16** & **Computation sheet** (HTML, opens in new tab) |

Every download uses the date picker's selected period.

---

## 4. Income-tax specifics (`/compliance/tax`)

- **Tabs**: *Fiscal settings* (slabs) · *Declarations* · *Computation* · *TDS register*.
- **Declarations**: pick a financial year; *Edit* opens a declaration for that employee (regime OLD/NEW + 80C, 80D, NPS 80CCD(1B), home-loan, HRA claim, previous-employer income/TDS).
- **Computation**: select an employee → *Compute* → full annual projection (gross → standard deduction → taxable → tax → rebate u/s 87A → cess → monthly TDS), plus links to that employee's Form 16 & sheet.
- New regime (default) uses flat slabs and standard deduction ₹75k (deductions not allowed); old regime allows all deductions & PT. TDS is re-computed monthly against YTD payslips.

---

## 5. Employee self-service (`/me/tax`)

Employees see **"My Tax"** only: their projection, their declaration (toggle regime, enter investments), and downloadable computation sheet + Form 16 for the FY. They cannot see other employees or company configs.

---

## 6. Pay components & how payslips work

Payslips are built from **pay components** (created under *Payroll → Pay components*). To set an employee's salary, assign components in their **salary structure** (per employee, editable) — each component can override its default value.

### Field reference (add/edit component screen)

Example shown is the seeded **Basic** component:

| Field | Meaning | Basic's value |
|---|---|---|
| **Name** | Display name shown on payslips | "Basic" |
| **Code** | Short unique key used in formulas & exports (e.g. `BASIC`, `PF`) | `BASIC` |
| **Type** | `Earning` = adds to gross pay; `Deduction` = subtracted (e.g. PF, TDS) | Earning |
| **Calculation type** | How the amount is computed: **Fixed amount** = flat value · **Percent of…** = `percent% × percentOf` (e.g. PF = 12% of BASIC) · **Formula** = expression like `BASIC * 0.40` · (Attendance types are handled by the run/LOP engine) | Fixed amount |
| **Default value** | Amount used when a salary structure doesn't override it (per-employee values can differ) | 10,000 |
| **Sort order** | Order components appear on the payslip (ascending) | 10 |
| **Description** | Free-text note | "Basic salary (≥ 40% of gross typical)" |
| **Taxable ✓** | Whether the amount counts toward income-tax salary (TDS). UNCHECK taxable earnings (e.g. reimbursements) get excluded from tax | Yes |
| **Statutory (PF/ESI/PT/TDS/LWF)** | Marks this line as a statutory deduction so the compliance engine buckets it (PF share, TDS line, PT, LWF, ESI). Basic itself is an earning, so this is usually left off — it's the PF/TDS *deduction* components that get tagged | off |
| **Variable pay ✓** | Earned from attendance/OT/targets (not fixed). Variable amounts use the attendance/OT engine instead of a fixed monthly number | off (Basic is fixed) |

### Rule of thumb for structuring components

- **Earnings**: Basic (fixed), HRA (formula `BASIC * 0.40`), Special allowance (formula `GROSS - (BASIC + HRA)`), Arrears/bonus/reimbursements.
- **Deductions**: PF (percent-of BASIC, tagged Statutory→PF), TDS (tagged Statutory→TDS), PT, Professional Tax/LWF/ESI deductions where applicable.
- **Taxable ✓ should stay on** for ordinary salary lines; keep off for reimbursements/non-taxable perquisites.
- Basic is seeded automatically at **40% of the employee's gross salary** when a salary structure is first created.

### How attendance reaches the payslip

Attendance drives LOP (loss of pay) and overtime:

1. Add attendance per employee via the **Attendance** page (manual per-day entry), a **CSV bulk import** (`POST /api/v1/attendance/imports`), or **biometric device sync** (`POST /api/v1/attendance/biometric/[id]/sync`).
2. At payroll generation the engine counts PRESENT / HALF_DAY / **ABSENT** / ON_LEAVE for the month (`computeAttendanceSummary` in `src/server/services/payroll.ts`).
3. **Absent days → LOP** deduction on the payslip; **overtime minutes → OT/earnings** added to gross.

---

## 7. Access rules

- **Company Admin / HR / Payroll Admin** → full manage on all compliance modules.
- **Manager** → Compliance Dashboard read-only (`compliances.read`).
- **Employee** → `My Tax` only.
- Anyone not linked to an employee profile gets "account is not linked to an employee profile" on My Tax.

---

## 8. Gotchas

- **Registers are live** — recomputed from the run each time you load them; a DRAFT run is enough (finalize when satisfied).
- **ESI shows ₹0** when everyone is above the ₹21k ceiling — that's correct, check the `applied` column.
- **Dates**: switches configs by `isActive`/`isCurrent` (effective-dated); only the active one feeds registers.
- Keep the dev server running with `npx next dev -p 3001`; don't run `next build` while it's up (corrupts `.next` — restart dev after a build).