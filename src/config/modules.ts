import {
  documentCategoryOptions,
  documentStatusOptions,
  shiftTypeOptions,
  holidayTypeOptions,
  transferTypeOptions,
  weekDayOffOptions,
  exitTypeOptions,
  resignationReasonOptions,
} from "@/lib/audit";

export type FieldType =
  | "text"
  | "email"
  | "number"
  | "decimal"
  | "date"
  | "time"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox";

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  hint?: string;
  options?: Option[];
  /** Slug of another setup module (or "employees") whose records fill this dropdown. */
  resource?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface ModuleDef {
  /** URL slug + permission module key (mirrors Prisma model). */
  slug: string;
  label: string;
  singular: string;
  description: string;
  /** Primary human-readable field shown in tables (used for search). */
  titleField: string;
  /** Comma list of fields used for free-text search on the server. */
  searchFields: string[];
  fields: FieldDef[];
}

export const SETUP_MODULES: ModuleDef[] = [
  {
    slug: "branches",
    label: "Branches",
    singular: "Branch",
    description: "Physical offices and head offices of the company.",
    titleField: "name",
    searchFields: ["name", "code", "city"],
    fields: [
      { name: "name", label: "Branch Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true, hint: "Unique branch code, e.g. HO, BLR-2" },
      { name: "isHeadOffice", label: "Head Office", type: "checkbox" },
      { name: "managerName", label: "Branch Manager", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "addressLine1", label: "Address Line 1", type: "textarea" },
      { name: "city", label: "City", type: "text" },
      { name: "state", label: "State", type: "text" },
      { name: "country", label: "Country", type: "text" },
      { name: "postalCode", label: "Postal Code", type: "text" },
    ],
  },
  {
    slug: "locations",
    label: "Locations",
    singular: "Location",
    description: "Working locations, optionally tied to a branch.",
    titleField: "name",
    searchFields: ["name", "code", "city"],
    fields: [
      { name: "name", label: "Location Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "branchId", label: "Branch", type: "select", resource: "branches" },
      { name: "addressLine1", label: "Address Line 1", type: "textarea" },
      { name: "city", label: "City", type: "text" },
      { name: "state", label: "State", type: "text" },
      { name: "country", label: "Country", type: "text" },
      { name: "postalCode", label: "Postal Code", type: "text" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "departments",
    label: "Departments",
    singular: "Department",
    description: "Organisation departments with optional hierarchy.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Department Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "parentId", label: "Parent Department", type: "select", resource: "departments" },
      { name: "branchId", label: "Branch", type: "select", resource: "branches" },
      { name: "locationId", label: "Location", type: "select", resource: "locations" },
      { name: "costCenterId", label: "Cost Center", type: "select", resource: "costCenters" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "designations",
    label: "Designations",
    singular: "Designation",
    description: "Job titles / roles mapped to grades and categories.",
    titleField: "title",
    searchFields: ["title", "code"],
    fields: [
      { name: "title", label: "Designation Title", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "level", label: "Level", type: "text", placeholder: "e.g. L-3" },
      { name: "gradeId", label: "Grade", type: "select", resource: "grades" },
      { name: "categoryId", label: "Category", type: "select", resource: "categories" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "grades",
    label: "Grades",
    singular: "Grade",
    description: "Pay grades with salary bands.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Grade Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "minSalary", label: "Min Monthly Salary", type: "decimal", min: 0 },
      { name: "maxSalary", label: "Max Monthly Salary", type: "decimal", min: 0 },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "categories",
    label: "Categories",
    singular: "Category",
    description: "Employee/payroll categories (e.g. IT, Support).",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Category Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "costCenters",
    label: "Cost Centers",
    singular: "Cost Center",
    description: "Cost tracking units for payroll allocation.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Cost Center Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "budgetOwner", label: "Budget Owner", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "businessUnits",
    label: "Business Units",
    singular: "Business Unit",
    description: "Lines of business within the company.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Business Unit Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "managerName", label: "Unit Manager", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "holidayCalendars",
    label: "Holiday Calendars",
    singular: "Holiday Calendar",
    description: "Yearly holiday calendars; holidays live under the Holidays module.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Calendar Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "year", label: "Year", type: "number", required: true, min: 2000, max: 2100 },
      { name: "isDefault", label: "Default Calendar", type: "checkbox" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "holidays",
    label: "Holidays",
    singular: "Holiday",
    description: "Individual public / optional holidays inside a calendar.",
    titleField: "name",
    searchFields: ["name"],
    fields: [
      { name: "name", label: "Holiday Name", type: "text", required: true },
      { name: "calendarId", label: "Calendar", type: "select", resource: "holidayCalendars", required: true },
      { name: "date", label: "Date", type: "date", required: true },
      { name: "type", label: "Type", type: "select", options: holidayTypeOptions },
      { name: "isOptional", label: "Optional Holiday", type: "checkbox" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },
  {
    slug: "shifts",
    label: "Shift Masters",
    singular: "Shift",
    description: "Work shifts with timings and overtime settings.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Shift Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "startTime", label: "Start Time", type: "time", required: true },
      { name: "endTime", label: "End Time", type: "time", required: true },
      { name: "breakStartTime", label: "Break Start", type: "time" },
      { name: "breakEndTime", label: "Break End", type: "time" },
      { name: "type", label: "Shift Type", type: "select", options: shiftTypeOptions },
      { name: "gracePeriodMinutes", label: "Grace Period (min)", type: "number", min: 0 },
      { name: "maxLateMinutes", label: "Max Late (min)", type: "number", min: 0 },
      { name: "allowsOvertime", label: "Allows Overtime", type: "checkbox" },
      { name: "weeklyOffRuleId", label: "Weekly Off Rule", type: "select", resource: "weeklyOffRules" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
  {
    slug: "weeklyOffRules",
    label: "Weekly Off Rules",
    singular: "Weekly Off Rule",
    description: "Weekly off-day pattern rules.",
    titleField: "name",
    searchFields: ["name", "code"],
    fields: [
      { name: "name", label: "Rule Name", type: "text", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "weekStartDay", label: "Week Start Day (0=Sun, 6=Sat)", type: "number", min: 0, max: 6 },
      { name: "offDays", label: "Weekend Days", type: "multiselect", options: weekDayOffOptions },
      { name: "alternateSaturday", label: "Alternate Saturday Off", type: "checkbox" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "isActive", label: "Active", type: "checkbox" },
    ],
  },
];

export const COMPANIES_MODULE: ModuleDef = {
  slug: "companies",
  label: "Companies",
  singular: "Company",
  description: "Tenant companies managed by the platform super admin.",
  titleField: "name",
  searchFields: ["name", "code", "city"],
  fields: [
    { name: "name", label: "Company Name", type: "text", required: true },
    { name: "code", label: "Company Code", type: "text", required: true, hint: "Unique identifier, e.g. ACME" },
    { name: "legalName", label: "Legal Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "website", label: "Website", type: "text" },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "pan", label: "PAN", type: "text" },
    { name: "addressLine1", label: "Address Line 1", type: "textarea" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "postalCode", label: "Postal Code", type: "text" },
    {
      name: "subscriptionPlan",
      label: "Subscription Plan",
      type: "select",
      options: [
        { value: "free", label: "Free" },
        { value: "pro", label: "Pro" },
        { value: "enterprise", label: "Enterprise" },
      ],
    },
  ],
};

export const MODULE_MAP: Record<string, ModuleDef> = Object.fromEntries(
  [...SETUP_MODULES, COMPANIES_MODULE].map((m) => [m.slug, m])
);

export const getModule = (slug: string): ModuleDef | undefined => MODULE_MAP[slug];