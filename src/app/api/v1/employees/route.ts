import { Prisma, type BankAccountType } from "@prisma/client";
import { NextRequest } from "next/server";
import { api, created, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { badRequest, conflict, forbidden } from "@/lib/errors";
import { employeeSchema, type EmployeePayload } from "@/lib/validations/employee";
import { listEmployees, nextEmployeeCode, employeeName } from "@/server/services/employee";

export const runtime = "nodejs";

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

export const GET = (req: NextRequest) =>
  api(async () => {
    const ctx = await requirePermission("employees.read");
    const companyId = requireCompanyId(ctx.companyId);
    const url = new URL(req.url);
    const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 1), 100);
    const { rows, total, pageCount } = await listEmployees({
      companyId,
      page,
      pageSize,
      search: url.searchParams.get("search") ?? undefined,
      departmentId: url.searchParams.get("departmentId") ?? undefined,
      designationId: url.searchParams.get("designationId") ?? undefined,
      employmentStatus: url.searchParams.get("employmentStatus") ?? undefined,
    });
    return ok(rows, { page, pageSize, total, pageCount });
  });

export const POST = (req: NextRequest) =>
  api(async () => {
    const ctx = await requirePermission("employees.create");
    const companyId = requireCompanyId(ctx.companyId);
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { code: true, name: true } });
    if (!company) throw forbidden("Company not found for this account.");

    const body = await req.json().catch(() => {
      throw badRequest("Invalid JSON body.");
    });
    const payload = employeeSchema.parse(body) as EmployeePayload;

    const bank = pluckBank(payload);
    const hasBank = bank.accountNumber && String(bank.accountNumber).trim() !== "";

    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (BANK_FIELDS.includes(k as (typeof BANK_FIELDS)[number])) continue;
      clean[k] = v === "" ? null : v;
    }

    const employeeCode =
      payload.employeeCode && (payload.employeeCode as string).trim()
        ? String(payload.employeeCode).trim()
        : await nextEmployeeCode(companyId, company.code);

    clean.employeeCode = employeeCode;
    clean.companyId = companyId;

    try {
      const employee = await prisma.employee.create({
        data: {
          ...(clean as Prisma.EmployeeUncheckedCreateInput),
          ...(hasBank
            ? {
                bankDetails: {
                  create: {
                    companyId,
                    accountHolderName: (bank.accountHolderName as string) ?? "",
                    accountNumber: String(bank.accountNumber),
                    ifscCode: (bank.ifsc as string) ?? "",
                    bankName: (bank.name as string) ?? "",
                    bankBranch: (bank.branch as string) ?? "",
                    accountType: (bank.accountType as BankAccountType | undefined) ?? undefined,
                  } as Prisma.EmployeeBankDetailsUncheckedCreateWithoutEmployeeInput,
                },
              }
            : {}),
        },
        include: { department: { select: { name: true } }, designation: { select: { title: true } }, user: { select: { email: true } } },
      });
      await prisma.auditLog.create({
        data: {
          action: "CREATE",
          module: "employees",
          entityType: "Employee",
          entityId: employee.id,
          entityName: employeeName(employee),
          companyId,
          userId: ctx.userId,
          afterState: employee as never,
        },
      });
      return created(employee);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("An employee with the same code, email, PAN, or Aadhaar already exists.");
      }
      throw e;
    }
  });