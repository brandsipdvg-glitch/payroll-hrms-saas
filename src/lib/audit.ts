import { prisma } from "@/lib/prisma";
import type {
  AuditAction,
  ApprovalStatus,
  BankAccountType,
  BloodGroup,
  DocumentCategory,
  DocumentStatus,
  EmployeeStatus,
  EmploymentType,
  ExitType,
  Gender,
  HolidayType,
  MaritalStatus,
  ResignationReason,
  ShiftType,
  Status,
  TransferType,
  UserStatus,
} from "@prisma/client";
import type { Prisma, AuditLog } from "@prisma/client";

export interface AuditInput {
  action: AuditAction;
  module: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  companyId?: string | null;
  userId?: string | null;
  beforeState?: Prisma.InputJsonValue | null;
  afterState?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export async function logAudit(input: AuditInput): Promise<AuditLog> {
  return prisma.auditLog.create({ data: input as Prisma.AuditLogUncheckedCreateInput });
}

export type { AuditAction };

export const STATUS_LABELS: Record<Status, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
  OTHER: "Other",
};

export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  A_POSITIVE: "A+",
  A_NEGATIVE: "A-",
  B_POSITIVE: "B+",
  B_NEGATIVE: "B-",
  AB_POSITIVE: "AB+",
  AB_NEGATIVE: "AB-",
  O_POSITIVE: "O+",
  O_NEGATIVE: "O-",
  UNKNOWN: "Unknown",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  PERMANENT: "Permanent",
  PROBATION: "Probation",
  CONTRACT: "Contract",
  TRAINEE: "Trainee",
  INTERN: "Intern",
  CONSULTANT: "Consultant",
  TEMPORARY: "Temporary",
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  PROBATION: "Probation",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
  RESIGNED: "Resigned",
  EXITED: "Exited",
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  PAN: "PAN Card",
  AADHAAR: "Aadhaar Card",
  OFFER_LETTER: "Offer Letter",
  APPOINTMENT_LETTER: "Appointment Letter",
  CONTRACT: "Contract",
  CERTIFICATE: "Certificate",
  PROMOTION_LETTER: "Promotion Letter",
  TRANSFER_LETTER: "Transfer Letter",
  RESIGNATION_ACCEPTANCE: "Resignation Acceptance",
  TRAINING_CERTIFICATE: "Training Certificate",
  PHOTO: "Photograph",
  RESUME: "Resume",
  OTHER: "Other",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  GENERAL: "General",
  NIGHT: "Night",
  ROTATIONAL: "Rotational",
  SPLIT: "Split",
  FLEXIBLE: "Flexible",
};

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  FIXED: "Fixed",
  FLOATING: "Floating",
  OPTIONAL: "Optional",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const RESIGNATION_REASON_LABELS: Record<ResignationReason, string> = {
  BETTER_OPPORTUNITY: "Better Opportunity",
  RELOCATION: "Relocation",
  FAMILY: "Family",
  CAREER_CHANGE: "Career Change",
  HEALTH: "Health",
  RETIREMENT: "Retirement",
  TERMINATION: "Termination",
  OTHER: "Other",
};

export const EXIT_TYPE_LABELS: Record<ExitType, string> = {
  RESIGNATION: "Resignation",
  TERMINATION: "Termination",
  RETIREMENT: "Retirement",
  MUTUAL_SEPARATION: "Mutual Separation",
  OTHER: "Other",
};

export const TRANSFER_TYPE_LABELS: Record<TransferType, string> = {
  INTERNAL_MOVEMENT: "Internal Movement",
  RELOCATION: "Relocation",
  PROJECT_ROTATION: "Project Rotation",
  DEPARTMENT_CHANGE: "Department Change",
  LOCATION_CHANGE: "Location Change",
  OTHER: "Other",
};

export const BANK_ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  SAVINGS: "Savings",
  CURRENT: "Current",
  SALARY: "Salary",
  OTHER: "Other",
};

export const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export const WEEK_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const genderOptions = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));
export const maritalStatusOptions = Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => ({ value, label }));
export const bloodGroupOptions = Object.entries(BLOOD_GROUP_LABELS).map(([value, label]) => ({ value, label }));
export const employmentTypeOptions = Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const employeeStatusOptions = Object.entries(EMPLOYEE_STATUS_LABELS).map(([value, label]) => ({ value, label }));
export const documentCategoryOptions = Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
export const documentStatusOptions = Object.entries(DOCUMENT_STATUS_LABELS).map(([value, label]) => ({ value, label }));
export const shiftTypeOptions = Object.entries(SHIFT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const holidayTypeOptions = Object.entries(HOLIDAY_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const approvalStatusOptions = Object.entries(APPROVAL_STATUS_LABELS).map(([value, label]) => ({ value, label }));
export const resignationReasonOptions = Object.entries(RESIGNATION_REASON_LABELS).map(([value, label]) => ({ value, label }));
export const exitTypeOptions = Object.entries(EXIT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const transferTypeOptions = Object.entries(TRANSFER_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const bankAccountTypeOptions = Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
export const weekDayOffOptions = DAYS.map((d) => ({ value: d, label: d.charAt(0) + d.slice(1).toLowerCase() }));