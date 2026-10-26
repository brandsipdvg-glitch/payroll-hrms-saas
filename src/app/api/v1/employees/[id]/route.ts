import { Prisma, type BankAccountType } from "@prisma/client";
import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { employeeSchema, type EmployeePayload } from "@/lib/validations/employee";
import { getOwnedEmployee, employeeName } from "@/server/services/employee";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const BANK_FIELDS = [
  "bankAccountHolderName",
  "bankAccountNumber",
  "bankIfscCode",
  "bankName",
  "bankBranchName",
  "bankAccountType",
] as const;

function pluckBank(payload: EmployeePayload) {
  const bank: Record<string, unknown> = {};
  for (const f of BANK_FIELDS) {
    if (payload[f] !== undefined) bank[f.replace("bank", "").toLowerCase()] = payload[f];
  }
  return bank;
}

export const GET = (_req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employees.read");
    const companyId = requireCompanyId(ctx.companyId);
    const employee = await getOwnedEmployee(companyId, (await params).id);
    return ok(employee);
  });

export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employees.update");
    const companyId = requireCompanyId(ctx.companyId);
    const id = (await params).id;
    const existing = await getOwnedEmployee(companyId, id);

    const body = await req.json().catch(() => {
      throw badRequest("Invalid JSON body.");
    });
    const payload = employeeSchema.parse(body) as EmployeePayload;

    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (BANK_FIELDS.includes(k as (typeof BANK_FIELDS)[number])) continue;
      clean[k] = v === "" ? null : v;
    }

    const bank = pluckBank(payload);
    const hasBank = bank.accountNumber && String(bank.accountNumber).trim() !== "";

    let employee;
    try {
      employee = await prisma.$transaction(async (tx) => {
        const updated = await tx.employee.update({ where: { id }, data: clean as Prisma.EmployeeUncheckedUpdateInput });
        const current = await tx.employeeBankDetails.findFirst({ where: { employeeId: id, companyId }, orderBy: { isPrimary: "desc" } });
        if (hasBank) {
          const updateBank: Prisma.EmployeeBankDetailsUncheckedUpdateInput = {
            accountHolderName: (bank.accountHolderName as string) ?? "",
            accountNumber: String(bank.accountNumber),
            ifscCode: (bank.ifsc as string) ?? "",
            bankName: (bank.name as string) ?? "",
            bankBranch: (bank.branch as string) ?? "",
            accountType: (bank.accountType as BankAccountType | undefined) ?? undefined,
          };
          if (current) {
            await tx.employeeBankDetails.update({ where: { id: current.id }, data: updateBank });
          } else {
            await tx.employeeBankDetails.create({
              data: {
                employeeId: id,
                companyId,
                accountHolderName: (bank.accountHolderName as string) ?? "",
                accountNumber: String(bank.accountNumber),
                ifscCode: (bank.ifsc as string) ?? "",
                bankName: (bank.name as string) ?? "",
                bankBranch: (bank.branch as string) ?? "",
                accountType: (bank.accountType as BankAccountType | undefined) ?? undefined,
              },
            });
          }
        }
        return updated;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("A field value (email, PAN, or Aadhaar) already exists for another employee.");
      }
      throw e;
    }

    const auditPayload: Prisma.InputJsonValue = {
      ...existing,
      bankingUpdated: hasBank,
    } as Prisma.InputJsonValue;
    await prisma.auditLog.create({
      data: {
        action: "UPDATE",
        module: "employees",
        entityType: "Employee",
        entityId: id,
        entityName: employeeName(employee),
        companyId,
        userId: ctx.userId,
        beforeState: auditPayload,
        afterState: employee as never,
      },
    });
    const refreshed = await getOwnedEmployee(companyId, id);
    return ok(refreshed);
  });

export const DELETE = (_req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employees.delete");
    const companyId = requireCompanyId(ctx.companyId);
    const id = (await params).id;
    const existing = await getOwnedEmployee(companyId, id);
    const employee = await prisma.employee.update({
      where: { id },
      data: { employmentStatus: "INACTIVE", status: "INACTIVE" } as Prisma.EmployeeUncheckedUpdateInput,
    });
    await prisma.auditLog.create({
      data: {
        action: "DELETE",
        module: "employees",
        entityType: "Employee",
        entityId: id,
        entityName: employeeName(employee),
        companyId,
        userId: ctx.userId,
        beforeState: existing as never,
      },
    });
    return ok({ id, deactivated: true });
  });