import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";

export const employeeListInclude = {
  department: { select: { id: true, name: true } },
  designation: { select: { id: true, title: true } },
  grade: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
  businessUnit: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
  shift: { select: { id: true, name: true } },
  reportingManager: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  user: { select: { id: true, email: true, status: true } },
} satisfies Prisma.EmployeeInclude;

export const employeeDetailInclude = {
  ...employeeListInclude,
  bankDetails: { orderBy: { isPrimary: "desc" } },
  documents: { orderBy: { createdAt: "desc" } },
  transfers: {
    orderBy: { createdAt: "desc" },
    include: {
      fromDepartment: { select: { name: true } },
      toDepartment: { select: { name: true } },
      fromDesignation: { select: { title: true } },
      toDesignation: { select: { title: true } },
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
    },
  },
  promotions: {
    orderBy: { createdAt: "desc" },
    include: {
      fromDesignation: { select: { title: true } },
      toDesignation: { select: { title: true } },
      fromGrade: { select: { name: true } },
      toGrade: { select: { name: true } },
    },
  },
  confirmations: { orderBy: { createdAt: "desc" } },
  resignations: { orderBy: { createdAt: "desc" } },
  exits: {
    orderBy: { createdAt: "desc" },
    include: { resignation: { select: { reason: true, lastWorkingDate: true } } },
  },
} satisfies Prisma.EmployeeInclude;

export type EmployeeListItem = Prisma.EmployeeGetPayload<{ include: typeof employeeListInclude }>;
export type EmployeeDetail = Prisma.EmployeeGetPayload<{ include: typeof employeeDetailInclude }>;

export interface EmployeeQuery {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  employmentStatus?: string;
  sort?: string;
}

export async function listEmployees(q: EmployeeQuery) {
  const where: Prisma.EmployeeWhereInput = { companyId: q.companyId };
  if (q.search) {
    const s = q.search.trim();
    const numeric = /^\d+$/.test(s) ? Number(s) : null;
    where.OR = [
      { employeeCode: { contains: s, mode: "insensitive" } },
      { firstName: { contains: s, mode: "insensitive" } },
      { lastName: { contains: s, mode: "insensitive" } },
      ...(numeric !== null ? [{ mobileNumber: { contains: s } }] : []),
    ];
  }
  if (q.departmentId) where.departmentId = q.departmentId;
  if (q.designationId) where.designationId = q.designationId;
  if (q.employmentStatus) where.employmentStatus = q.employmentStatus as Prisma.EmployeeWhereInput["employmentStatus"];

  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: employeeListInclude,
      orderBy: { [q.sort ?? "doj"]: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return { rows, total, pageCount: Math.ceil(total / q.pageSize) };
}

/** Generates the next sequential employee code for a tenant. */
export async function nextEmployeeCode(companyId: string, companyCode: string): Promise<string> {
  const count = await prisma.employee.count({ where: { companyId } });
  for (let i = count + 1; i < count + 101; i++) {
    const code = `${companyCode}-${String(i).padStart(4, "0")}`;
    const exists = await prisma.employee.findUnique({
      where: { companyId_employeeCode: { companyId, employeeCode: code } },
    });
    if (!exists) return code;
  }
  throw conflict("Unable to allocate an employee code. Please try again.");
}

export async function getOwnedEmployee(companyId: string, id: string) {
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: employeeDetailInclude,
  });
  if (!employee || employee.companyId !== companyId) throw notFound("Employee not found.");
  return employee;
}

export async function getEmployeeById(id: string) {
  return prisma.employee.findUnique({ where: { id }, include: employeeDetailInclude });
}

/** Rich label used across the UI. */
export function employeeName(e: { firstName: string; lastName: string; middleName?: string | null }): string {
  return [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
}

export async function logEmployeeAudit(
  input: {
    employeeId: string;
    companyId?: string | null;
    userId?: string | null;
    module: string;
    entityType: string;
    entityId: string;
    action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "REJECT" | "UPLOAD" | "DOWNLOAD";
    entityName?: string | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await logAudit({
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    companyId: input.companyId,
    userId: input.userId,
    beforeState: (input.beforeState as Prisma.InputJsonValue) ?? undefined,
    afterState: (input.afterState as Prisma.InputJsonValue) ?? undefined,
    metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
  });
}