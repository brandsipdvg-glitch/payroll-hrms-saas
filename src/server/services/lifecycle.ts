import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { buildSlaveController, type SlaveSpec } from "@/server/slave-resource";
import { getEmployeeById } from "@/server/services/employee";
import {
  confirmationSchema,
  exitSchema,
  promotionSchema,
  resignationSchema,
  transferSchema,
} from "@/lib/validations/lifecycle";

/** Records applied to the employee master when their lifecycle event is APPROVED. */
async function recordApproval(module: string, row: Record<string, unknown>, ctx: { userId: string; companyId: string }) {
  const employee = await getEmployeeById(String(row.employeeId));
  if (!employee) return;
  await prisma.auditLog.create({
    data: {
      action: "APPROVE",
      companyId: ctx.companyId,
      userId: ctx.userId,
      module,
      entityType: "Lifecycle",
      entityId: String(row.id),
      entityName: employee.firstName + " " + employee.lastName,
      metadata: { row } as never,
    },
  });
}

export const transfersController = buildSlaveController({
  slug: "employeeTransfers",
  model: "employeeTransfer",
  entityType: "Transfer",
  schema: (d) => transferSchema.parse(d) as unknown as Record<string, unknown>,
  include: {
    fromDepartment: { select: { name: true } },
    toDepartment: { select: { name: true } },
    fromDesignation: { select: { title: true } },
    toDesignation: { select: { title: true } },
    fromBranch: { select: { name: true } },
    toBranch: { select: { name: true } },
    fromLocation: { select: { name: true } },
    toLocation: { select: { name: true } },
  },
  onApprove: async (row, ctx) => {
    const data = {
      ...(row.toDepartmentId ? { departmentId: String(row.toDepartmentId) } : {}),
      ...(row.toDesignationId ? { designationId: String(row.toDesignationId) } : {}),
      ...(row.toBranchId ? { branchId: String(row.toBranchId) } : {}),
      ...(row.toLocationId ? { locationId: String(row.toLocationId) } : {}),
    };
    if (Object.keys(data).length) {
      await prisma.employee.update({ where: { id: String(row.employeeId) }, data });
    }
    await recordApproval("employeeTransfers", row, ctx);
  },
});

export const promotionsController = buildSlaveController({
  slug: "employeePromotions",
  model: "employeePromotion",
  entityType: "Promotion",
  schema: (d) => promotionSchema.parse(d) as unknown as Record<string, unknown>,
  include: {
    fromDesignation: { select: { title: true } },
    toDesignation: { select: { title: true } },
    fromGrade: { select: { name: true } },
    toGrade: { select: { name: true } },
  },
  onApprove: async (row, ctx) => {
    const data = {
      ...(row.toDesignationId ? { designationId: String(row.toDesignationId) } : {}),
      ...(row.toGradeId ? { gradeId: String(row.toGradeId) } : {}),
    };
    if (Object.keys(data).length) {
      await prisma.employee.update({ where: { id: String(row.employeeId) }, data });
    }
    await recordApproval("employeePromotions", row, ctx);
  },
});

export const confirmationsController = buildSlaveController({
  slug: "employeeConfirmations",
  model: "employeeConfirmation",
  entityType: "Confirmation",
  schema: (d) => confirmationSchema.parse(d) as unknown as Record<string, unknown>,
  onApprove: async (row, ctx) => {
    const date = row.confirmationDate ? new Date(String(row.confirmationDate)) : undefined;
    await prisma.employee.update({
      where: { id: String(row.employeeId) },
      data: {
        confirmationDate: date,
        employmentStatus: "ACTIVE",
        employmentType: "PERMANENT",
      } as never,
    });
    await recordApproval("employeeConfirmations", row, ctx);
  },
});

export const resignationsController = buildSlaveController({
  slug: "employeeResignations",
  model: "employeeResignation",
  entityType: "Resignation",
  schema: (d) => resignationSchema.parse(d) as unknown as Record<string, unknown>,
  onApprove: async (row, ctx) => {
    await prisma.employee.update({
      where: { id: String(row.employeeId) },
      data: { employmentStatus: "RESIGNED" } as never,
    });
    await recordApproval("employeeResignations", row, ctx);
  },
});

export const exitsController = buildSlaveController({
  slug: "employeeExits",
  model: "employeeExit",
  entityType: "Exit",
  schema: (d) => exitSchema.parse(d) as unknown as Record<string, unknown>,
  include: { resignation: { select: { reason: true, lastWorkingDate: true } } },
  onApprove: async (row, ctx) => {
    await prisma.employee.update({
      where: { id: String(row.employeeId) },
      data: { employmentStatus: "EXITED" } as never,
    });
    await recordApproval("employeeExits", row, ctx);
  },
});

export function makeLifecycleAudit(module: string) {
  return { module };
}