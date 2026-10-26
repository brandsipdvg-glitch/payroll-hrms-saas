import { z } from "zod";

const dateField = z.union([z.string(), z.null()]).optional();
const numberField = z.union([z.string(), z.number(), z.null()]).optional();
const textField = z.union([z.string(), z.null()]).optional();

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const aadhaarRegex = /^[0-9]{12}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

const optionalRegex = (re: RegExp, message: string) =>
  z.union([z.string().regex(re, message), z.literal(""), z.null()]).optional();

const employeeBase = z
  .object({
    employeeCode: textField,
    firstName: textField,
    middleName: textField,
    lastName: textField,
    dob: dateField,
    gender: z.union([z.string(), z.null()]).optional(),
    maritalStatus: z.union([z.string(), z.null()]).optional(),
    bloodGroup: z.union([z.string(), z.null()]).optional(),
    nationality: textField,
    personalEmail: z.union([z.string().email("Invalid email"), z.literal(""), z.null()]).optional(),
    mobileNumber: textField,
    alternateNumber: textField,
    addressLine1: textField,
    addressLine2: textField,
    city: textField,
    state: textField,
    country: textField,
    postalCode: textField,

    doj: dateField,
    confirmationDate: dateField,
    probationMonths: numberField,
    employmentType: z.union([z.string(), z.null()]).optional(),
    employmentStatus: z.union([z.string(), z.null()]).optional(),
    companyEmail: z.union([z.string().email("Invalid email"), z.literal(""), z.null()]).optional(),
    internalExtension: textField,

    departmentId: textField,
    designationId: textField,
    gradeId: textField,
    categoryId: textField,
    costCenterId: textField,
    businessUnitId: textField,
    branchId: textField,
    locationId: textField,
    shiftId: textField,
    reportingManagerId: textField,

    pan: optionalRegex(panRegex, "PAN format: ABCDE1234F"),
    aadhaar: optionalRegex(aadhaarRegex, "Aadhaar must be 12 digits"),
    uan: textField,
    pfNumber: textField,
    esiNumber: textField,

    bankAccountHolderName: textField,
    bankAccountNumber: textField,
    bankIfscCode: optionalRegex(ifscRegex, "IFSC format: HDFC0001234"),
    bankName: textField,
    bankBranchName: textField,
    bankAccountType: z.union([z.string(), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    for (const f of ["firstName", "lastName", "doj"] as const) {
      const v = data[f];
      if (v === undefined || v === null || String(v).trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [f],
          message: `${f === "doj" ? "Date of Joining" : f} is required.`,
        });
      }
    }
    if (data.bankAccountNumber && String(data.bankAccountNumber).trim() && !data.bankIfscCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankIfscCode"],
        message: "IFSC code is required when providing a bank account number.",
      });
    }
  })
  .transform((data) => {
    const out: Record<string, unknown> = { ...data };
    (["dob", "doj", "confirmationDate"] as const).forEach((k) => {
      const v = data[k];
      out[k] = v === "" || v === undefined || v === null ? null : new Date(v as string);
    });
    (["probationMonths"] as const).forEach((k) => {
      const v = data[k];
      out[k] = v === "" || v === undefined || v === null ? null : Number(v);
    });
    (["departmentId", "designationId", "gradeId", "categoryId", "costCenterId", "businessUnitId", "branchId", "locationId", "shiftId", "reportingManagerId"] as const).forEach((k) => {
      const v = data[k];
      out[k] = v === "" ? null : v;
    });
    return out;
  });

export const employeeSchema = employeeBase;
export type EmployeeFormValues = z.input<typeof employeeBase>;
export type EmployeePayload = z.output<typeof employeeBase>;

export const bankDetailsSchema = z
  .object({
    accountHolderName: textField,
    accountNumber: textField,
    ifscCode: optionalRegex(ifscRegex, "IFSC format: HDFC0001234"),
    bankName: textField,
    bankBranch: textField,
    accountType: z.union([z.string(), z.null()]).optional(),
    isActive: z.boolean().optional(),
  })
  .transform((data) => {
    const out: Record<string, unknown> = { ...data };
    (["ifscCode"] as const).forEach((k) => {
      const v = data[k];
      out[k] = v === "" ? null : v;
    });
    return out;
  });