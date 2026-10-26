import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "Admin@123";

// ---------------------------------------------------------------------------
// Permission catalogue
// ---------------------------------------------------------------------------
const MODULES = [
  "dashboard",
  "companies",
  "branches",
  "locations",
  "departments",
  "designations",
  "grades",
  "categories",
  "costCenters",
  "businessUnits",
  "holidayCalendars",
  "holidays",
  "shifts",
  "weeklyOffRules",
  "employees",
  "employeeDocuments",
  "employeeTransfers",
  "employeePromotions",
  "employeeConfirmations",
  "employeeResignations",
  "employeeExits",
  "attendance",
  "attendancePolicies",
  "attendanceImports",
  "biometricDevices",
  "leaveTypes",
  "leavePolicies",
  "leaveRequests",
  "leaveBalances",
  "leaveEncashments",
  "payComponents",
  "salaryStructures",
  "payrollRuns",
  "payslips",
  "payrollAdjustments",
  "reimbursements",
  "loans",
  "bonusPlans",
  "gratuities",
  "settlements",
  "pf",
  "esi",
  "professionalTax",
  "labourWelfareFund",
  "incomeTax",
  "compliances",
  "assets",
  "assetAssignments",
  "teamApprovals",
  "reports",
  "savedReports",
  "scheduledReports",
  "emailDeliveries",
  "adminTools",
  "analytics",
  "users",
  "roles",
  "permissions",
  "auditLogs",
];

const ACTIONS = ["create", "read", "update", "delete", "manage"];

const crud = (m: string) => ACTIONS.filter((a) => a !== "manage").map((a) => `${m}.${a}`);
const rw = (m: string) => ["create", "read", "update"].map((a) => `${m}.${a}`);
const ro = (m: string) => [`${m}.read`];

// module -> permission codes per role
const ROLE_MATRIX: Record<string, { modules: string[]; all?: boolean }> = {
  SUPER_ADMIN: { modules: [] },
  COMPANY_ADMIN: {
    modules: [
      ...crud("companies")
        .filter(() => false), // companies managed above this role (super admin only)
      ...crud("branches"),
      ...crud("locations"),
      ...crud("departments"),
      ...crud("designations"),
      ...crud("grades"),
      ...crud("categories"),
      ...crud("costCenters"),
      ...crud("businessUnits"),
      ...crud("holidayCalendars"),
      ...crud("holidays"),
      ...crud("shifts"),
      ...crud("weeklyOffRules"),
      ...crud("employees"),
      ...["create", "read", "update", "manage"].map((a) => `employeeDocuments.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeTransfers.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeePromotions.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeConfirmations.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeResignations.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeExits.${a}`),
      ...crud("attendance"),
      ...crud("attendancePolicies"),
      ...crud("attendanceImports"),
      ...crud("biometricDevices"),
      ...rw("leaveTypes"),
      ...rw("leavePolicies"),
      ...["create", "read", "update", "manage"].map((a) => `leaveRequests.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `leaveBalances.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `leaveEncashments.${a}`),
      ...crud("payComponents"),
      ...crud("salaryStructures"),
      ...["create", "read", "update", "manage"].map((a) => `payrollRuns.${a}`),
      ...crud("payslips"),
      ...crud("payrollAdjustments"),
      ...["create", "read", "update", "manage"].map((a) => `reimbursements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `loans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `bonusPlans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `gratuities.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `settlements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `pf.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `esi.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `professionalTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `labourWelfareFund.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `incomeTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `compliances.${a}`),
      ...crud("assets"),
      ...["create", "read", "update", "manage"].map((a) => `assetAssignments.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `teamApprovals.${a}`),
      ...rw("reports"),
      ...crud("savedReports"),
      ...["create", "read", "update", "manage"].map((a) => `scheduledReports.${a}`),
      ...crud("emailDeliveries"),
      ...rw("adminTools"),
      ...ro("analytics"),
      ...rw("users"),
      ...ro("roles"),
      ...ro("auditLogs"),
      ...ro("dashboard"),
    ],
  },
  HR: {
    modules: [
      ...ro("branches"),
      ...ro("locations"),
      ...ro("departments"),
      ...ro("designations"),
      ...ro("grades"),
      ...ro("categories"),
      ...ro("costCenters"),
      ...ro("businessUnits"),
      ...ro("holidayCalendars"),
      ...ro("holidays"),
      ...ro("shifts"),
      ...ro("weeklyOffRules"),
      ...rw("employees"),
      ...["create", "read", "update", "manage"].map((a) => `employeeDocuments.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeTransfers.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeePromotions.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeConfirmations.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeResignations.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `employeeExits.${a}`),
      ...crud("attendance"),
      ...crud("attendancePolicies"),
      ...crud("attendanceImports"),
      ...crud("biometricDevices"),
      ...rw("leaveTypes"),
      ...rw("leavePolicies"),
      ...["create", "read", "update", "manage"].map((a) => `leaveRequests.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `leaveBalances.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `leaveEncashments.${a}`),
      ...crud("payComponents"),
      ...crud("salaryStructures"),
      ...["create", "read", "update", "manage"].map((a) => `payrollRuns.${a}`),
      ...crud("payslips"),
      ...crud("payrollAdjustments"),
      ...["create", "read", "update", "manage"].map((a) => `reimbursements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `loans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `bonusPlans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `gratuities.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `settlements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `pf.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `esi.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `professionalTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `labourWelfareFund.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `incomeTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `compliances.${a}`),
      ...crud("assets"),
      ...["create", "read", "update", "manage"].map((a) => `assetAssignments.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `teamApprovals.${a}`),
      ...rw("reports"),
      ...crud("savedReports"),
      ...["create", "read", "update", "manage"].map((a) => `scheduledReports.${a}`),
      ...crud("emailDeliveries"),
      ...rw("adminTools"),
      ...ro("analytics"),
      ...rw("users"),
      ...ro("auditLogs"),
      ...ro("dashboard"),
    ],
  },
  PAYROLL_ADMIN: {
    modules: [
      ...ro("branches"),
      ...ro("locations"),
      ...ro("departments"),
      ...ro("designations"),
      ...ro("grades"),
      ...ro("categories"),
      ...ro("costCenters"),
      ...ro("businessUnits"),
      ...ro("shifts"),
      ...ro("weeklyOffRules"),
      ...ro("employees"),
      ...ro("employeeTransfers"),
      ...ro("employeePromotions"),
      ...ro("employeeConfirmations"),
      ...ro("employeeResignations"),
      ...ro("employeeExits"),
      ...ro("attendance"),
      ...ro("attendancePolicies"),
      ...ro("leaveTypes"),
      ...ro("leaveRequests"),
      ...ro("leaveBalances"),
      ...ro("leavePolicies"),
      ...crud("payComponents"),
      ...crud("salaryStructures"),
      ...["create", "read", "update", "manage"].map((a) => `payrollRuns.${a}`),
      ...crud("payslips"),
      ...crud("payrollAdjustments"),
      ...["create", "read", "update", "manage"].map((a) => `reimbursements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `loans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `bonusPlans.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `gratuities.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `settlements.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `pf.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `esi.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `professionalTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `labourWelfareFund.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `incomeTax.${a}`),
      ...["create", "read", "update", "manage"].map((a) => `compliances.${a}`),
      ...ro("assets"),
      ...ro("assetAssignments"),
      ...["create", "read", "update", "manage"].map((a) => `reports.${a}`),
      ...crud("savedReports"),
      ...["create", "read", "update", "manage"].map((a) => `scheduledReports.${a}`),
      ...ro("emailDeliveries"),
      ...ro("analytics"),
      ...ro("dashboard"),
    ],
  },
  MANAGER: {
    modules: [
      ...ro("employees"),
      ...ro("employeeTransfers"),
      ...ro("employeePromotions"),
      ...ro("employeeConfirmations"),
      ...ro("employeeResignations"),
      ...ro("employeeExits"),
      ...ro("attendance"),
      ...ro("attendancePolicies"),
      ...ro("leaveTypes"),
      ...ro("leaveRequests"),
      ...ro("leaveBalances"),
      ...ro("leavePolicies"),
      ...ro("payslips"),
      ...ro("compliances"),
      ...ro("reimbursements"),
      ...ro("loans"),
      ...ro("bonusPlans"),
      ...ro("assets"),
      ...["teamApprovals.create", "teamApprovals.read", "teamApprovals.manage"],
      ...ro("reports"),
      ...ro("analytics"),
      ...ro("dashboard"),
    ],
  },
  EMPLOYEE: {
    modules: [
      ro("dashboard"),
      ro("employees"),
      ro("employeeDocuments"),
      ro("payslips"),
      ro("attendance"),
      "attendance.create",
      ro("leaveTypes"),
      "leaveRequests.create",
      ro("leaveRequests"),
      "leaveRequests.update",
      ro("leaveBalances"),
      ro("incomeTax"),
      "incomeTax.create",
      "incomeTax.update",
      "reimbursements.create",
      ro("reimbursements"),
      "reimbursements.update",
      "loans.create",
      ro("loans"),
      ro("bonusPlans"),
      ro("gratuities"),
      ro("settlements"),
      ro("assets"),
      ro("assetAssignments"),
      ro("reports"),
      ro("analytics"),
    ].flat(),
  },
};

// ---------------------------------------------------------------------------
// Upgrade path — always run so an already-seeded DB also gains new permissions
// and default module config (attendance policy, leave types, balances).
// ---------------------------------------------------------------------------

function baseRoleKey(code: string): string | null {
  if (code === "SUPER_ADMIN") return "SUPER_ADMIN";
  if (code === "COMPANY_ADMIN") return "COMPANY_ADMIN";
  for (const base of ["HR", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE"] as const) {
    if (code.startsWith(`${base}_`)) return base;
  }
  return null;
}

function desiredPermissionCodes(): Set<string> {
  const codes = new Set<string>();
  for (const module of MODULES) {
    const actions = module === "dashboard" ? ["read", "manage"] : ACTIONS;
    for (const action of actions) codes.add(`${module}.${action}`);
  }
  return codes;
}

async function syncPermissionCatalogue() {
  const desired = desiredPermissionCodes();
  const existing = await prisma.permission.findMany({ select: { id: true, code: true } });
  const existingMap = new Map(existing.map((p) => [p.code, p.id]));
  const toCreate = [...desired].filter((c) => !existingMap.has(c));

  if (toCreate.length) {
    const [module, action] = toCreate[0].split(".");
    void module;
    void action;
    const created = await prisma.$transaction(
      toCreate.map((code) => {
        const [m, a] = code.split(".");
        return prisma.permission.create({
          data: { code, module: m, action: a, description: `${a} on ${m}`, isSystem: true },
        });
      })
    );
    for (const p of created) existingMap.set(p.code, p.id);
  }

  // Re-sync role -> permission links for system/derived roles.
  const roles = await prisma.role.findMany({ select: { id: true, code: true, isSystem: true } });
  for (const role of roles) {
    const base = baseRoleKey(role.code);
    if (!base) continue;
    let allowed = [...desired];
    if (base === "SUPER_ADMIN") {
      allowed = [...desired];
    } else {
      const want = new Set(ROLE_MATRIX[base as keyof typeof ROLE_MATRIX].modules as string[]);
      allowed = [...want].filter((c) => desired.has(c));
    }
    const existingLinks = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const have = new Set(existingLinks.map((l) => l.permissionId));
    const missing = allowed
      .map((c) => existingMap.get(c))
      .filter((id): id is string => Boolean(id) && !have.has(id!));
    if (missing.length) {
      await prisma.rolePermission.createMany({
        data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }
}

async function ensureDefaultModuleConfig(companyId: string) {
  const policyCount = await prisma.attendancePolicy.count({ where: { companyId } });
  if (policyCount === 0) {
    await prisma.attendancePolicy.create({
      data: {
        companyId,
        name: "Standard Policy",
        code: "ATT-STD",
        description: "Default attendance policy: 09:00 shift, 15 min grace, full-day tie-break at 4h.",
        graceTimeMinutes: 15,
        maxLateMinutes: 120,
        lateAfterGraceMinutes: 0,
        minHoursForFullDay: 240,
        otEnabled: true,
        otAfterMinutes: 0,
        otRoundToMinutes: 30,
        otMaxPerDayMinutes: 120,
        absentIfNoPunch: true,
        isDefault: true,
      },
    });
  }

  const leaveTypeCount = await prisma.leaveType.count({ where: { companyId } });
  if (leaveTypeCount === 0) {
    const types = [
      { name: "Casual Leave", code: "CASUAL", color: "#3b82f6", isPaid: true, isEncashable: false, carryForwardAllowed: false, accrualBasis: "ANNUAL", accrualValue: 12 },
      { name: "Sick Leave", code: "SICK", color: "#ef4444", isPaid: true, isEncashable: false, carryForwardAllowed: false, accrualBasis: "ANNUAL", accrualValue: 12 },
      { name: "Earned Leave", code: "EARNED", color: "#10b981", isPaid: true, isEncashable: true, maxEncashable: 30, carryForwardAllowed: true, maxCarryForward: 30, accrualBasis: "MONTHLY", accrualValue: 1.25 },
      { name: "Comp Off", code: "COMP_OFF", color: "#f59e0b", isPaid: true, isEncashable: false, carryForwardAllowed: false, accrualBasis: "MANUAL", accrualValue: 0 },
      { name: "Maternity Leave", code: "MATERNITY", color: "#ec4899", isPaid: true, isEncashable: false, carryForwardAllowed: false, accrualBasis: "ANNUAL", accrualValue: 26 },
      { name: "Paternity Leave", code: "PATERNITY", color: "#8b5cf6", isPaid: true, isEncashable: false, carryForwardAllowed: false, accrualBasis: "ANNUAL", accrualValue: 10 },
      { name: "Loss Of Pay", code: "LOSS_OF_PAY", color: "#6b7280", isPaid: false, isEncashable: false, carryForwardAllowed: true, maxCarryForward: 0, accrualBasis: "MANUAL", accrualValue: 0 },
    ];
    await prisma.leaveType.createMany({
      data: (types as unknown as Prisma.LeaveTypeCreateManyInput[]).map((t) => ({ ...t, companyId } as Prisma.LeaveTypeCreateManyInput)),
    });
  }
}

const DEFAULT_PAY_COMPONENTS: {
  name: string;
  code: string;
  componentType: "EARNING" | "DEDUCTION";
  calcType: "FIXED" | "PERCENT_OF" | "FORMULA" | "ATTENDANCE";
  formula?: string;
  percentOf?: string;
  percent?: number;
  isTaxable?: boolean;
  isStatutory?: boolean;
  isVariable?: boolean;
  isLoanRecovery?: boolean;
  sortOrder?: number;
  description?: string;
}[] = [
  { name: "Basic", code: "BASIC", componentType: "EARNING", calcType: "FIXED", isTaxable: true, sortOrder: 10, description: "Basic salary (>= 40% of gross typical)" },
  { name: "HRA", code: "HRA", componentType: "EARNING", calcType: "FORMULA", formula: "BASIC * 0.40", isTaxable: true, sortOrder: 20, description: "House Rent Allowance" },
  { name: "Conveyance", code: "CONVEYANCE", componentType: "EARNING", calcType: "FIXED", isTaxable: false, sortOrder: 30, description: "Transport allowance" },
  { name: "Medical", code: "MEDICAL", componentType: "EARNING", calcType: "FIXED", isTaxable: false, sortOrder: 40, description: "Medical allowance" },
  { name: "Special Allowance", code: "SPECIAL", componentType: "EARNING", calcType: "FORMULA", formula: "GROSS - (BASIC + HRA)", isTaxable: true, sortOrder: 50, description: "Balancing allowance" },
  { name: "Bonus", code: "BONUS", componentType: "EARNING", calcType: "FIXED", isVariable: true, sortOrder: 60, description: "Monthly bonus / additional pay" },
  { name: "Incentives", code: "INCENTIVES", componentType: "EARNING", calcType: "FIXED", isVariable: true, sortOrder: 70, description: "Sales / performance incentives" },
  { name: "Variable Pay", code: "VARIABLE_PAY", componentType: "EARNING", calcType: "FIXED", isVariable: true, sortOrder: 80, description: "Performance-linked variable pay" },
  { name: "Overtime", code: "OT", componentType: "EARNING", calcType: "ATTENDANCE", isTaxable: true, sortOrder: 55, description: "Computed from overtime hours" },
  { name: "PF", code: "PF", componentType: "DEDUCTION", calcType: "PERCENT_OF", percentOf: "BASIC", percent: 12, isStatutory: true, sortOrder: 10, description: "Provident Fund (employee 12% of basic)" },
  { name: "ESI", code: "ESI", componentType: "DEDUCTION", calcType: "PERCENT_OF", percentOf: "GROSS", percent: 0.75, isStatutory: true, sortOrder: 20, description: "Employee State Insurance (0.75% of gross)" },
  { name: "Professional Tax", code: "PT", componentType: "DEDUCTION", calcType: "FIXED", isStatutory: true, sortOrder: 30, description: "Professional tax (state-specific)" },
  { name: "TDS", code: "TDS", componentType: "DEDUCTION", calcType: "FIXED", isStatutory: true, sortOrder: 40, description: "Tax deducted at source" },
  { name: "Labour Welfare Fund", code: "LWF", componentType: "DEDUCTION", calcType: "FIXED", isStatutory: true, sortOrder: 50, description: "Labour welfare fund" },
  { name: "Loan Recovery", code: "LOAN_RECOVERY", componentType: "DEDUCTION", calcType: "FIXED", isLoanRecovery: true, sortOrder: 60, description: "EMI recovery against employee loan" },
  { name: "Advance Recovery", code: "ADVANCE_RECOVERY", componentType: "DEDUCTION", calcType: "FIXED", isLoanRecovery: true, sortOrder: 70, description: "Recovery of salary advance" },
];

async function ensureDefaultPayComponents(companyId: string) {
  const count = await prisma.payComponent.count({ where: { companyId } });
  if (count > 0) return;
  await prisma.payComponent.createMany({
    data: DEFAULT_PAY_COMPONENTS.map(
      (c) =>
        ({
          ...c,
          companyId,
        }) as Prisma.PayComponentCreateManyInput
    ),
  });
}

async function seedDefaultSalaryStructures(companyId: string) {
  const structureCount = await prisma.salaryStructure.count({ where: { companyId } });
  if (structureCount > 0) return;
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true },
  });
  if (!employees.length) return;
  const components = await prisma.payComponent.findMany({ where: { companyId, isActive: true } });
  if (!components.length) return;

  const grossesByIndex = [50000, 42000, 36000, 65000, 30000];
  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const gross = grossesByIndex[i % grossesByIndex.length];
    const basic = Math.round(gross * 0.4 * 100) / 100;
    const structure = await prisma.salaryStructure.create({
      data: {
        companyId,
        employeeId: emp.id,
        name: "Primary",
        effectiveFrom: new Date(),
        grossSalary: gross,
        isCurrent: true,
        components: {
          create: components.map((c) => {
            const base = { calcType: c.calcType, formula: c.formula, percentOf: c.percentOf, percent: c.percent };
            if (c.code === "BASIC") return { ...base, payComponentId: c.id, value: basic, sortOrder: c.sortOrder };
            if (c.calcType === "FIXED") return { ...base, payComponentId: c.id, value: 0, sortOrder: c.sortOrder };
            return { ...base, payComponentId: c.id, sortOrder: c.sortOrder };
          }),
        },
      },
    });
    void structure;
  }
}

// ---------------------------------------------------------------------------
// Statutory compliance defaults — all rates/ceilings remain admin-editable.
// ---------------------------------------------------------------------------

async function ensureComplianceDefaults(companyId: string, state = "Karnataka") {
  const setting = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  if (!setting) {
    await prisma.companyStatutorySetting.create({
      data: {
        companyId,
        pfNumber: "BLR/12345/ABC",
        pfEstablishmentName: "ACME Technologies Pvt. Ltd.",
        pfBankName: "State Bank of India",
        pfBankAccount: "30012345678",
        pfBankBranch: "MG Road, Bengaluru",
        esiNumber: "56000123456780",
        esiLocalOffice: "ESI Corporation, Bengaluru",
        esiReturnOffice: "Bengaluru",
        tan: "BLRA12345C",
        itTdsCircle: "Circle 2(1), Bengaluru",
        itAssessingOfficer: "ITO Ward-2(1), Bengaluru",
      },
    });
  }

  const pfCount = await prisma.pfConfig.count({ where: { companyId } });
  if (pfCount === 0) {
    await prisma.pfConfig.create({
      data: { companyId, name: "Default PF terms (12% / EPS 8.33% / EPF 3.67%)", effectiveFrom: new Date() },
    });
  }

  const esiCount = await prisma.esiConfig.count({ where: { companyId } });
  if (esiCount === 0) {
    await prisma.esiConfig.create({
      data: { companyId, name: "Default ESI terms (0.75% employee / 3.25% employer)", effectiveFrom: new Date() },
    });
  }

  const lwfCount = await prisma.lwfConfig.count({ where: { companyId } });
  if (lwfCount === 0) {
    await prisma.lwfConfig.createMany({
      data: [
        { companyId, name: "Karnataka LWF", state: "Karnataka", employeeShare: 20, employerShare: 20, effectiveFrom: new Date() },
        { companyId, name: "Maharashtra LWF", state: "Maharashtra", employeeShare: 12, employerShare: 12, effectiveFrom: new Date() },
      ],
    });
  }

  const regionCount = await prisma.professionalTaxRegion.count({ where: { companyId } });
  if (regionCount === 0) {
    const regions = [
      {
        name: "Karnataka Professional Tax",
        state: "Karnataka",
        slabs: [
          { fromAmount: 0, toAmount: 14999, monthlyAmount: 0 },
          { fromAmount: 15000, toAmount: 19999, monthlyAmount: 150 },
          { fromAmount: 20000, toAmount: null, monthlyAmount: 200 },
        ],
      },
      {
        name: "Maharashtra Professional Tax",
        state: "Maharashtra",
        slabs: [
          { fromAmount: 0, toAmount: 9999, monthlyAmount: 0 },
          { fromAmount: 10000, toAmount: 14999, monthlyAmount: 200 },
          { fromAmount: 15000, toAmount: 24999, monthlyAmount: 300 },
          { fromAmount: 25000, toAmount: null, monthlyAmount: 300 },
        ],
      },
    ];
    for (const r of regions) {
      await prisma.professionalTaxRegion.create({
        data: {
          companyId,
          name: r.name,
          state: r.state,
          effectiveFrom: new Date(),
          slabs: { create: r.slabs.map((s, i) => ({ ...s, sortOrder: i + 1 }) as Prisma.ProfessionalTaxSlabCreateManyInput) },
        },
      });
    }
    void state;
  }

  const itCount = await prisma.itConfig.count({ where: { companyId } });
  if (itCount === 0) {
    await prisma.itConfig.create({
      data: {
        companyId,
        financialYear: "2026-27",
        slabs: {
          create: [
            // New regime (0-4l nil, 4-8 5%, 8-12 10%, 12-16 15%, 16-20 20%, 20-24 25%, >24 30%)
            { regime: "NEW", fromAmount: 0, toAmount: 400000, rate: 0, sortOrder: 1 },
            { regime: "NEW", fromAmount: 400000, toAmount: 800000, rate: 5, sortOrder: 2 },
            { regime: "NEW", fromAmount: 800000, toAmount: 1200000, rate: 10, sortOrder: 3 },
            { regime: "NEW", fromAmount: 1200000, toAmount: 1600000, rate: 15, sortOrder: 4 },
            { regime: "NEW", fromAmount: 1600000, toAmount: 2000000, rate: 20, sortOrder: 5 },
            { regime: "NEW", fromAmount: 2000000, toAmount: 2400000, rate: 25, sortOrder: 6 },
            { regime: "NEW", fromAmount: 2400000, toAmount: null, rate: 30, sortOrder: 7 },
            // Old regime (0-2.5l nil, 2.5-5 5%, 5-10 20%, >10 30%)
            { regime: "OLD", fromAmount: 0, toAmount: 250000, rate: 0, sortOrder: 1 },
            { regime: "OLD", fromAmount: 250000, toAmount: 500000, rate: 5, sortOrder: 2 },
            { regime: "OLD", fromAmount: 500000, toAmount: 1000000, rate: 20, sortOrder: 3 },
            { regime: "OLD", fromAmount: 1000000, toAmount: null, rate: 30, sortOrder: 4 },
          ],
        },
      },
    });
  }

  // Sample income-tax declarations for demo employees (only if none exist).
  const fYear = "2026-27";
  const declCount = await prisma.itDeclaration.count({ where: { companyId, financialYear: fYear } });
  if (declCount === 0) {
    const employees = await prisma.employee.findMany({ where: { companyId }, select: { id: true } });
    const samples = [
      { regime: "NEW", section80C: 0, section80D: 0, nps80CCD1B: 0, homeLoanInterest: 0 },
      { regime: "NEW", section80C: 150000, section80D: 25000, nps80CCD1B: 50000, homeLoanInterest: 0 },
      { regime: "OLD", section80C: 150000, section80D: 10000, nps80CCD1B: 50000, homeLoanInterest: 200000 },
      { regime: "NEW", section80C: 0, section80D: 0, nps80CCD1B: 0, homeLoanInterest: 0 },
      { regime: "OLD", section80C: 100000, section80D: 0, nps80CCD1B: 50000, homeLoanInterest: 0 },
    ];
    for (let i = 0; i < employees.length; i++) {
      const s = samples[i % samples.length];
      await prisma.itDeclaration.create({
        data: { companyId, employeeId: employees[i].id, financialYear: fYear, regime: s.regime as "OLD" | "NEW", section80C: s.section80C, section80D: s.section80D, nps80CCD1B: s.nps80CCD1B, homeLoanInterest: s.homeLoanInterest, createdBy: "seed" },
      });
    }
  }
}

async function seedLeaveBalances(companyId: string) {
  const year = new Date().getFullYear();
  const existing = await prisma.leaveBalance.count({ where: { companyId, year } });
  if (existing > 0) return;
  const employees = await prisma.employee.findMany({ where: { companyId }, select: { id: true, doj: true } });
  if (!employees.length) return;
  const types = await prisma.leaveType.findMany({ where: { companyId } });
  const rows: Prisma.LeaveBalanceCreateManyInput[] = [];
  for (const emp of employees) {
    for (const t of types) {
      if (t.code === "COMP_OFF" || t.code === "LOSS_OF_PAY") continue;
      // Annual types get full year credit; monthly types get partial credit by tenure.
      const months = Math.max(
        year - new Date(emp.doj).getFullYear() === 0
          ? 12 - new Date(emp.doj).getMonth()
          : t.accrualBasis === "MONTHLY"
            ? 12
            : 12,
        1
      );
      const credited = t.accrualBasis === "MONTHLY" ? Math.min(12, months) * t.accrualValue : t.accrualValue;
      rows.push({
        companyId,
        employeeId: emp.id,
        leaveTypeId: t.id,
        year,
        openingBalance: 0,
        credited,
        closingBalance: credited,
      } as Prisma.LeaveBalanceCreateManyInput);
    }
  }
  if (rows.length) await prisma.leaveBalance.createMany({ data: rows });
}

async function main() {
  await syncPermissionCatalogue();

  const existing = await prisma.permission.count();
  if (existing > 0 && (await prisma.company.count()) > 0) {
    const company = await prisma.company.findFirst();
    if (company) {
      await ensureDefaultModuleConfig(company.id);
      await ensureDefaultPayComponents(company.id);
      await seedLeaveBalances(company.id);
      await seedDefaultSalaryStructures(company.id);
      await ensureComplianceDefaults(company.id);
    }
    console.log("Seed upgrade applied (permissions + default module config).");
    return;
  }
  if (existing > 0) {
    console.log("Seed already applied — skipping demo data.");
    return;
  }

  // ---- Permissions ---------------------------------------------------------
  const permissions: Prisma.PermissionCreateInput[] = [];
  for (const module of MODULES) {
    const actions = module === "dashboard" ? ["read", "manage"] : ACTIONS;
    for (const action of actions) {
      permissions.push({
        code: `${module}.${action}`,
        module,
        action,
        description: `${action} on ${module}`,
        isSystem: true,
      });
    }
  }
  const all = await prisma.$transaction(
    permissions.map((p) => prisma.permission.create({ data: p }))
  );
  const byCode = new Map(all.map((p) => [p.code, p.id]));

  const allCodes = new Set(all.map((p) => p.code));

  // ---- Roles ---------------------------------------------------------------
  async function createRole(
    name: string,
    code: string,
    description: string,
    codes: string[],
    isSystem = true,
    companyId?: string | null
  ) {
    const role = await prisma.role.create({
      data: { name, code, description, isSystem, companyId: companyId ?? null },
    });
    const perms = new Set(codes);
    if (code === "SUPER_ADMIN") perms.clear(); // granted below explicitly
    const visible = [...perms].filter((c) => allCodes.has(c));
    if (visible.length) {
      await prisma.rolePermission.createMany({
        data: visible.map((pcode) => ({
          roleId: role.id,
          permissionId: byCode.get(pcode)!,
        })),
      });
    }
    return role;
  }

  const superAdminRole = await createRole(
    "Super Admin",
    "SUPER_ADMIN",
    "Platform-wide super administrator with access to all tenants",
    []
  );
  await prisma.rolePermission.createMany({
    data: [...allCodes].map((c) => ({
      roleId: superAdminRole.id,
      permissionId: byCode.get(c)!,
    })),
  });

  // Company-role codes (created AFTER a company exists, so company admin etc. are
  // created per-tenant below).

  // ---- Demo tenant ----------------------------------------------------------
  const company = await prisma.company.create({
    data: {
      name: "ACME Technologies Pvt. Ltd.",
      code: "ACME",
      legalName: "ACME Technologies Private Limited",
      email: "hr@acme.example",
      phone: "+91 98765 43210",
      website: "https://acme.example",
      gstin: "27AAPCT2343K1Z2",
      pan: "AAPCT2343K",
      addressLine1: "Level 14, Tech Tower, MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "IN",
      postalCode: "560001",
      subscriptionPlan: "enterprise",
    },
  });

  const headOffice = await prisma.branch.create({
    data: {
      companyId: company.id,
      name: "Head Office",
      code: "HO",
      isHeadOffice: true,
      city: "Bengaluru",
      state: "Karnataka",
    },
  });
  const puneBranch = await prisma.branch.create({
    data: { companyId: company.id, name: "Pune Office", code: "PUN", city: "Pune", state: "Maharashtra" },
  });

  const locHO = await prisma.location.create({
    data: { companyId: company.id, branchId: headOffice.id, name: "Tech Tower, MG Road", code: "LOCH1", city: "Bengaluru" },
  });

  const engDept = await prisma.department.create({
    data: { companyId: company.id, branchId: headOffice.id, locationId: locHO.id, name: "Engineering", code: "ENG", description: "Product engineering" },
  });
  const hrDept = await prisma.department.create({
    data: { companyId: company.id, branchId: headOffice.id, locationId: locHO.id, name: "Human Resources", code: "HR", description: "People operations" },
  });

  const gradeL1 = await prisma.grade.create({
    data: { companyId: company.id, name: "Level 1", code: "GRD-L1", minSalary: 100000, maxSalary: 250000 },
  });
  const gradeL2 = await prisma.grade.create({
    data: { companyId: company.id, name: "Level 2", code: "GRD-L2", minSalary: 250000, maxSalary: 500000 },
  });

  const catIT = await prisma.category.create({
    data: { companyId: company.id, name: "Information Technology", code: "IT" },
  });
  const catSupport = await prisma.category.create({
    data: { companyId: company.id, name: "Support Functions", code: "SUP" },
  });

  const ccEngg = await prisma.costCenter.create({
    data: { companyId: company.id, name: "Product Engineering", code: "CC-ENG" },
  });
  const buProducts = await prisma.businessUnit.create({
    data: { companyId: company.id, name: "Products & Platforms", code: "BU-PROD" },
  });

  const cal2026 = await prisma.holidayCalendar.create({
    data: {
      companyId: company.id,
      name: "National & Regional 2026",
      code: "HOL-2026",
      year: 2026,
      isDefault: true,
      holidays: {
        create: [
          { name: "Republic Day", date: new Date("2026-01-26"), type: "FIXED" },
          { name: "Independence Day", date: new Date("2026-08-15"), type: "FIXED" },
          { name: "Gandhi Jayanti", date: new Date("2026-10-02"), type: "FIXED" },
          { name: "Deepavali", date: new Date("2026-11-08"), type: "FIXED" },
          { name: "Christmas", date: new Date("2026-12-25"), type: "FIXED" },
        ],
      },
    },
  });

  const offRule = await prisma.weeklyOffRule.create({
    data: {
      companyId: company.id,
      name: "Standard 5-day week (Sat-Sun off)",
      code: "WK-55",
      weekStartDay: 1,
      offDays: ["SATURDAY", "SUNDAY"],
    },
  });

  await prisma.shiftMaster.create({
    data: {
      companyId: company.id,
      weeklyOffRuleId: offRule.id,
      name: "General Shift",
      code: "GS-9-6",
      startTime: "09:00",
      endTime: "18:00",
      breakStartTime: "13:00",
      breakEndTime: "14:00",
      type: "GENERAL",
      allowsOvertime: true,
    },
  });

  const desigCE = await prisma.designation.create({
    data: { companyId: company.id, title: "Chief Executive Officer", code: "DSG-CEO", level: "L-0", gradeId: gradeL2.id },
  });
  const desigEngLead = await prisma.designation.create({
    data: { companyId: company.id, title: "Engineering Lead", code: "DSG-LEAD", level: "L-2", gradeId: gradeL2.id, categoryId: catIT.id },
  });
  const desigSDE = await prisma.designation.create({
    data: { companyId: company.id, title: "Software Engineer", code: "DSG-SE", level: "L-3", gradeId: gradeL1.id, categoryId: catIT.id },
  });
  const desigHrMgr = await prisma.designation.create({
    data: { companyId: company.id, title: "HR Manager", code: "DSG-HRM", level: "L-2", gradeId: gradeL2.id, categoryId: catSupport.id },
  });

  // ---- Users ----------------------------------------------------------------
  const hashed = bcrypt.hashSync(PASSWORD, 10);

  const userSuper = await prisma.user.create({
    data: {
      email: "superadmin@acme.example",
      passwordHash: hashed,
      name: "Platform Super Admin",
      emailVerified: new Date(),
      roles: { create: [{ roleId: superAdminRole.id }] },
    },
  });

  const companyRoles = await Promise.all(
    [
      {
        name: "Company Admin",
        code: `COMPANY_ADMIN`,
        base: ROLE_MATRIX.COMPANY_ADMIN,
      },
      { name: "HR", code: `HR_${company.code}`, base: ROLE_MATRIX.HR },
      { name: "Payroll Admin", code: `PAYROLL_ADMIN_${company.code}`, base: ROLE_MATRIX.PAYROLL_ADMIN },
      { name: "Manager", code: `MANAGER_${company.code}`, base: ROLE_MATRIX.MANAGER },
      { name: "Employee", code: `EMPLOYEE_${company.code}`, base: ROLE_MATRIX.EMPLOYEE },
    ].map((r) => createRole(r.name, r.code, "", r.base.modules as string[], false, company.id))
  );
  const [roleCompanyAdmin, roleHr, rolePayroll, roleManager, roleEmployee] = companyRoles;

  async function makeUser(email: string, name: string, role: { id: string }, employee?: (eid: string) => Prisma.EmployeeUncheckedCreateInput) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashed,
        name,
        companyId: company.id,
        emailVerified: new Date(),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    if (employee) {
      const emp = await prisma.employee.create({ data: employee(user.id) });
      return { user, employeeId: emp.id };
    }
    return { user, employeeId: null };
  }

  const alex = await makeUser("admin@acme.example", "Alex Morgan", roleCompanyAdmin);
  const priya = await makeUser("priya@acme.example", "Priya Sharma", roleHr);

  // Employees (linked to users for HR/payroll/manager + 2 generic)
  const empCeo = await makeUser("ceo@acme.example", "Rahul Verma", roleManager, () => ({
    companyId: company.id,
    employeeCode: "ACME-0001",
    firstName: "Rahul",
    lastName: "Verma",
    gender: "MALE",
    maritalStatus: "MARRIED",
    bloodGroup: "B_POSITIVE",
    dob: new Date("1980-05-15"),
    doj: new Date("2015-04-01"),
    employmentType: "PERMANENT",
    employmentStatus: "ACTIVE",
    departmentId: engDept.id,
    designationId: desigCE.id,
    gradeId: gradeL2.id,
    categoryId: catIT.id,
    costCenterId: ccEngg.id,
    businessUnitId: buProducts.id,
    branchId: headOffice.id,
    locationId: locHO.id,
    pan: "ABCDE1234F",
    aadhaar: "111122223333",
    uan: "100001111111",
    mobileNumber: "9811111111",
    personalEmail: "rahul.verma@acme.example",
  }));

  const empSDE = await makeUser("sde@acme.example", "Meera Nair", roleEmployee, (userId) => ({
    companyId: company.id,
    userId,
    employeeCode: "ACME-0002",
    firstName: "Meera",
    lastName: "Nair",
    gender: "FEMALE",
    maritalStatus: "SINGLE",
    bloodGroup: "O_POSITIVE",
    dob: new Date("1995-11-02"),
    doj: new Date("2021-07-12"),
    employmentType: "PERMANENT",
    employmentStatus: "ACTIVE",
    departmentId: engDept.id,
    designationId: desigSDE.id,
    gradeId: gradeL1.id,
    categoryId: catIT.id,
    costCenterId: ccEngg.id,
    businessUnitId: buProducts.id,
    branchId: headOffice.id,
    locationId: locHO.id,
    reportingManagerId: empCeo.employeeId!,
    pan: "QRSTU1234F",
    aadhaar: "444455556666",
    uan: "100002222222",
    mobileNumber: "9822222222",
    personalEmail: "meera.nair@acme.example",
    bankDetails: {
      create: [
        {
          companyId: company.id,
          accountHolderName: "Meera Nair",
          accountNumber: "12345678901",
          ifscCode: "HDFC0001234",
          bankName: "HDFC Bank",
          bankBranch: "MG Road, Bengaluru",
        },
      ],
    },
  }));

  await prisma.$transaction([
    prisma.employee.create({
      data: {
        companyId: company.id,
        employeeCode: "ACME-0003",
        firstName: "Arjun",
        lastName: "Reddy",
        gender: "MALE",
        maritalStatus: "MARRIED",
        bloodGroup: "AB_POSITIVE",
        dob: new Date("1992-03-19"),
        doj: new Date("2022-02-01"),
        employmentType: "PERMANENT",
        employmentStatus: "ACTIVE",
        departmentId: engDept.id,
        designationId: desigSDE.id,
        gradeId: gradeL1.id,
        categoryId: catIT.id,
        costCenterId: ccEngg.id,
        branchId: puneBranch.id,
        reportingManagerId: empSDE.employeeId!,
        pan: "FGHIJ1234F",
        aadhaar: "777788889999",
        uan: "100003333333",
        mobileNumber: "9833333333",
        personalEmail: "arjun.reddy@acme.example",
      },
    }),
    prisma.employee.create({
      data: {
        companyId: company.id,
        employeeCode: "ACME-0004",
        firstName: "Sana",
        lastName: "Khan",
        gender: "FEMALE",
        maritalStatus: "SINGLE",
        bloodGroup: "A_POSITIVE",
        dob: new Date("1998-08-25"),
        doj: new Date("2024-06-10"),
        employmentType: "PROBATION",
        employmentStatus: "PROBATION",
        departmentId: hrDept.id,
        designationId: desigHrMgr.id,
        gradeId: gradeL2.id,
        categoryId: catSupport.id,
        branchId: headOffice.id,
        locationId: locHO.id,
        reportingManagerId: empCeo.employeeId!,
        pan: "KLMNO1234F",
        aadhaar: "111133335555",
        uan: "100004444444",
        mobileNumber: "9844444444",
        personalEmail: "sana.khan@acme.example",
        bankDetails: {
          create: [
            {
              companyId: company.id,
              accountHolderName: "Sana Khan",
              accountNumber: "55667788990",
              ifscCode: "ICIC0001234",
              bankName: "ICICI Bank",
              bankBranch: "Koramangala, Bengaluru",
            },
          ],
        },
      },
    }),
    prisma.employee.create({
      data: {
        companyId: company.id,
        employeeCode: "ACME-0005",
        firstName: "Vikram",
        lastName: "Malhotra",
        gender: "MALE",
        maritalStatus: "DIVORCED",
        bloodGroup: "O_NEGATIVE",
        dob: new Date("1988-01-30"),
        doj: new Date("2019-10-01"),
        employmentType: "PERMANENT",
        employmentStatus: "ACTIVE",
        departmentId: engDept.id,
        designationId: desigEngLead.id,
        gradeId: gradeL2.id,
        categoryId: catIT.id,
        businessUnitId: buProducts.id,
        branchId: headOffice.id,
        reportingManagerId: empCeo.employeeId!,
        pan: "PQRST1234F",
        aadhaar: "999900001111",
        uan: "100005555555",
        mobileNumber: "9855555555",
        personalEmail: "vikram.malhotra@acme.example",
      },
    }),
  ]);

  // Sample lifecycle records
  await prisma.employeeConfirmation.create({
    data: {
      employeeId: empSDE.employeeId!,
      companyId: company.id,
      probationEndDate: new Date("2022-01-01"),
      confirmationDate: new Date("2022-02-01"),
      status: "APPROVED",
      approvedBy: empCeo.user.id,
      approvedAt: new Date("2022-02-01"),
    },
  });

  await ensureComplianceDefaults(company.id);

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userId: userSuper.id,
      action: "CREATE",
      module: "system",
      entityType: "Company",
      entityId: company.id,
      entityName: company.name,
      metadata: { note: "Database seeded with demo data" },
    },
  });

  console.log("✔ Seed complete.");
  console.log("  Company: ACME (ACME Technologies)");
  console.log("  superadmin@acme.example / Admin@123");
  console.log("  admin@acme.example     / Admin@123");
  console.log("  priya@acme.example     / Admin@123 (HR)");
  console.log("  sde@acme.example       / Admin@123 (Employee)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());