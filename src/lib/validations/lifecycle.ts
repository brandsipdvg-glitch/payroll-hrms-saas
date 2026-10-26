import { z } from "zod";

const idField = z.union([z.string(), z.null()]).optional();
const textField = z.union([z.string(), z.null()]).optional();
const dateField = z.union([z.string(), z.null()]).optional();
const numberField = z.union([z.string(), z.number(), z.null()]).optional();
const decimalField = z.union([z.string(), z.number(), z.null()]).optional();

const enumField = (values: readonly string[]) =>
  z.union([z.enum(values as [string, ...string[]]), z.literal(""), z.null()]).optional();

const dayToDate = (v: unknown) => (v === "" || v === undefined || v === null ? null : new Date(v as string));

export const transferSchema = z
  .object({
    transferType: enumField(["INTERNAL_MOVEMENT", "RELOCATION", "PROJECT_ROTATION", "DEPARTMENT_CHANGE", "LOCATION_CHANGE", "OTHER"]),
    fromDepartmentId: idField,
    toDepartmentId: idField,
    fromDesignationId: idField,
    toDesignationId: idField,
    fromBranchId: idField,
    toBranchId: idField,
    fromLocationId: idField,
    toLocationId: idField,
    effectiveDate: dateField,
    reason: textField,
    notes: textField,
  })
  .transform((d) => ({ ...d, effectiveDate: dayToDate(d.effectiveDate) }));

export const promotionSchema = z
  .object({
    fromDesignationId: idField,
    toDesignationId: idField,
    fromGradeId: idField,
    toGradeId: idField,
    effectiveDate: dateField,
    incrementAmount: decimalField,
    newCtc: decimalField,
    reason: textField,
    notes: textField,
  })
  .transform((d) => ({
    ...d,
    effectiveDate: dayToDate(d.effectiveDate),
    incrementAmount: d.incrementAmount === "" || d.incrementAmount === null || d.incrementAmount === undefined ? null : Number(d.incrementAmount),
    newCtc: d.newCtc === "" || d.newCtc === null || d.newCtc === undefined ? null : Number(d.newCtc),
  }));

export const confirmationSchema = z
  .object({
    probationStartDate: dateField,
    probationEndDate: dateField,
    confirmationDate: dateField,
    remarks: textField,
  })
  .transform((d) => ({
    ...d,
    probationStartDate: dayToDate(d.probationStartDate),
    probationEndDate: dayToDate(d.probationEndDate),
    confirmationDate: dayToDate(d.confirmationDate),
  }));

export const resignationSchema = z
  .object({
    resignationDate: dateField,
    lastWorkingDate: dateField,
    reason: enumField(["BETTER_OPPORTUNITY", "RELOCATION", "FAMILY", "CAREER_CHANGE", "HEALTH", "RETIREMENT", "TERMINATION", "OTHER"]),
    noticePeriodDays: numberField,
    reasonDetails: textField,
    remarks: textField,
  })
  .transform((d) => ({
    ...d,
    resignationDate: dayToDate(d.resignationDate),
    lastWorkingDate: dayToDate(d.lastWorkingDate),
    noticePeriodDays: d.noticePeriodDays === "" || d.noticePeriodDays === null || d.noticePeriodDays === undefined ? null : Number(d.noticePeriodDays),
  }));

export const exitSchema = z
  .object({
    exitDate: dateField,
    exitType: enumField(["RESIGNATION", "TERMINATION", "RETIREMENT", "MUTUAL_SEPARATION", "OTHER"]),
    reason: textField,
    resignationId: idField,
    assetsReturned: z.boolean().optional(),
    finalSettlementDone: z.boolean().optional(),
    notes: textField,
  })
  .transform((d) => ({
    ...d,
    exitDate: dayToDate(d.exitDate),
    resignationId: d.resignationId === "" ? null : d.resignationId,
  }));

export const statusUpdateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  remarks: textField,
});

export type LifecyclePayload = Record<string, unknown>;