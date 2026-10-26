import {
  LayoutDashboard,
  Users,
  Building2,
  ShieldCheck,
  Network,
  Landmark,
  Banknote,
  CalendarCheck,
  CalendarDays,
  Settings2,
  ScanLine,
  CalendarRange,
  BarChart3,
  CalendarCheck2,
  Wallet,
  ReceiptText,
  ListChecks,
  PiggyBank,
  FileCheck2,
  FileSpreadsheet,
  Stamp,
  FileText,
  ArrowLeftRight,
  Gift,
  Coins,
  HandCoins,
  PartyPopper,
  ReceiptIndianRupee,
  Boxes,
  UserCog,
  FilePieChart,
  Calculator,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.read" }],
  },
  {
    label: "People",
    items: [{ title: "Employees", href: "/employees", icon: Users, permission: "employees.read" }],
  },
  {
    label: "Organization",
    items: [
      { title: "Setup Modules", href: "/setup", icon: Network, permission: "branches.read" },
      { title: "Branches", href: "/setup/branches", icon: Building2, permission: "branches.read" },
      { title: "Departments", href: "/setup/departments", icon: Network, permission: "departments.read" },
      { title: "Shifts", href: "/setup/shifts", icon: Banknote, permission: "shifts.read" },
    ],
  },
  {
    label: "Workforce",
    items: [
      { title: "Attendance", href: "/attendance", icon: CalendarCheck, permission: "attendancePolicies.read" },
      { title: "Attendance Policies", href: "/attendance/policies", icon: Settings2, permission: "attendancePolicies.read" },
      { title: "Biometric Devices", href: "/attendance/devices", icon: ScanLine, permission: "biometricDevices.read" },
      { title: "Shift Roster", href: "/attendance/rosters", icon: CalendarRange, permission: "shifts.read" },
      { title: "Leave", href: "/leave", icon: CalendarDays, permission: "leavePolicies.read" },
      { title: "Leave Balances", href: "/leave/balances", icon: CalendarDays, permission: "leavePolicies.read" },
      { title: "Assets", href: "/assets", icon: Package, permission: "assets.read" },
      { title: "Attendance Reports", href: "/reports/attendance", icon: BarChart3, permission: "attendancePolicies.read" },
      { title: "Leave Reports", href: "/reports/leave", icon: BarChart3, permission: "leavePolicies.read" },
    ],
  },
  {
    label: "Payroll",
    items: [
      { title: "Payroll Dashboard", href: "/payroll", icon: Wallet, permission: "payrollRuns.read" },
      { title: "Pay Components", href: "/payroll/components", icon: ReceiptText, permission: "payComponents.read" },
      { title: "Salary Structures", href: "/payroll/structures", icon: ListChecks, permission: "salaryStructures.read" },
      { title: "Payroll Runs", href: "/payroll/runs", icon: PiggyBank, permission: "payrollRuns.read" },
      { title: "Payslips", href: "/payroll/payslips", icon: ReceiptText, permission: "payrollRuns.read" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Reimbursements", href: "/finance/reimbursements", icon: ReceiptIndianRupee, permission: "reimbursements.read" },
      { title: "Loans & Advances", href: "/finance/loans", icon: HandCoins, permission: "loans.read" },
      { title: "Bonus", href: "/finance/bonus", icon: Gift, permission: "bonusPlans.read" },
      { title: "Gratuity", href: "/finance/gratuity", icon: Coins, permission: "gratuities.read" },
      { title: "Full & Final", href: "/finance/settlements", icon: PartyPopper, permission: "settlements.read" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { title: "Compliance Dashboard", href: "/compliance", icon: FileCheck2, permission: "compliances.read" },
      { title: "PF / EPS", href: "/compliance/pf", icon: PiggyBank, permission: "pf.read" },
      { title: "ESI", href: "/compliance/esi", icon: FileSpreadsheet, permission: "esi.read" },
      { title: "Professional Tax", href: "/compliance/pt", icon: Stamp, permission: "professionalTax.read" },
      { title: "Labour Welfare Fund", href: "/compliance/lwf", icon: Landmark, permission: "labourWelfareFund.read" },
      { title: "Income Tax / TDS", href: "/compliance/tax", icon: FileText, permission: "incomeTax.read" },
    ],
  },
  {
    label: "My Workspace",
    items: [
      { title: "My Profile", href: "/me/profile", icon: UserCog, permission: "employee.read" },
      { title: "My Attendance", href: "/me/attendance", icon: CalendarCheck2, permission: "attendance.read" },
      { title: "My Leave", href: "/me/leave", icon: CalendarDays, permission: "leaveRequests.read" },
      { title: "My Payslips", href: "/me/payslips", icon: ReceiptText, permission: "payslips.read" },
      { title: "My Claims", href: "/me/claims", icon: ReceiptIndianRupee, permission: "reimbursements.read" },
      { title: "My Loans", href: "/me/loans", icon: HandCoins, permission: "loans.read" },
      { title: "My Assets", href: "/me/assets", icon: Package, permission: "assets.read" },
      { title: "My Tax", href: "/me/tax", icon: Calculator, permission: "incomeTax.read" },
    ],
  },
  {
    label: "Intelligence",
    items: [{ title: "Reports", href: "/reports", icon: BarChart3, permission: "reports.read" }],
  },
  {
    label: "Enterprise",
    items: [
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3, permission: "analytics.read" },
      { title: "Admin Tools", href: "/admin", icon: Settings2, permission: "adminTools.read" },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Companies", href: "/admin/companies", icon: Landmark, permission: "companies.read" },
      { title: "Security", href: "/admin/security", icon: ShieldCheck },
    ],
  },
];

export function canAccess(permissions: string[] | undefined, required?: string): boolean {
  if (!required) return true;
  if (!permissions) return false;
  if (permissions.includes("*")) return true;
  return permissions.includes(required);
}