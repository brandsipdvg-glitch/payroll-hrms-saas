import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { ok } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { BankAccountType } from "@prisma/client";

const EDITABLE_FIELDS = [
  "personalEmail",
  "mobileNumber",
  "alternateNumber",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "country",
  "postalCode",
  "maritalStatus",
  "photoUrl",
  "nationality",
] as const;

async function selfContext(permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  if (!session.user.employeeId) throw forbidden("Your account is not linked to an employee profile.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  return { userId: session.user.id, companyId, employeeId: session.user.employeeId };
}

export async function myProfile() {
  const ctx = await selfContext("employees.read");
  const employee = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, id: ctx.employeeId },
    include: {
      department: { select: { name: true } },
      designation: { select: { title: true } },
      grade: { select: { name: true } },
      branch: { select: { name: true } },
      reportingManager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      bankDetails: { orderBy: { createdAt: "desc" }, take: 1 },
      salaryStructures: { where: { isCurrent: true }, take: 1, select: { grossSalary: true, effectiveFrom: true } },
    },
  });
  if (!employee) throw notFound("Employee profile not found.");
  return ok(employee);
}

export async function updateProfile(req: Request) {
  const ctx = await selfContext("employees.update");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, string> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) data[field] = String(body[field]);
  }
  if (Object.keys(data).length === 0) throw badRequest("No editable fields provided.");

  const before = await prisma.employee.findFirst({ where: { companyId: ctx.companyId, id: ctx.employeeId } });
  if (!before) throw notFound("Employee profile not found.");

  const updated = await prisma.employee.update({ where: { id: ctx.employeeId }, data: data as never });
  await logAudit({
    action: "UPDATE",
    module: "employees",
    entityType: "Employee",
    entityId: ctx.employeeId,
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: { selfService: true, fields: Object.keys(data) },
  });
  return ok(updated);
}

export async function updateBankDetails(req: Request) {
  const ctx = await selfContext("employees.update");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { accountHolderName, accountNumber, ifscCode, bankName, branchName, accountType, isPrimary } = body as Record<string, unknown>;
  if (!accountNumber || !ifscCode) throw badRequest("accountNumber and ifscCode are required.");

  const existing = await prisma.employeeBankDetails.findFirst({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId, isPrimary: true },
  });

  const toAccountType = (v: unknown): BankAccountType =>
    Object.values(BankAccountType).includes(String(v).toUpperCase() as BankAccountType)
      ? (String(v).toUpperCase() as BankAccountType)
      : BankAccountType.SAVINGS;

  const row = existing
    ? await prisma.employeeBankDetails.update({
        where: { id: existing.id },
        data: {
          accountHolderName: accountHolderName ? String(accountHolderName) : undefined,
          accountNumber: String(accountNumber),
          ifscCode: String(ifscCode),
          bankName: bankName ? String(bankName) : undefined,
          bankBranch: branchName ? String(branchName) : undefined,
          accountType: accountType ? toAccountType(accountType) : undefined,
        },
      })
    : await prisma.employeeBankDetails.create({
        data: {
          companyId: ctx.companyId,
          employeeId: ctx.employeeId,
          accountHolderName: accountHolderName ? String(accountHolderName) : null,
          accountNumber: String(accountNumber),
          ifscCode: String(ifscCode),
          bankName: String(bankName ?? ""),
          bankBranch: branchName ? String(branchName) : null,
          accountType: accountType ? toAccountType(accountType) : BankAccountType.SAVINGS,
          isPrimary: isPrimary ? Boolean(isPrimary) : true,
        },
      });

  await logAudit({
    action: "UPDATE",
    module: "employees",
    entityType: "EmployeeBankDetails",
    entityId: row.id,
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: { selfService: true },
  });
  return ok(row);
}