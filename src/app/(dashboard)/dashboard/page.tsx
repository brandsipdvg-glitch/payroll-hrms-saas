import Link from "next/link";
import {
  Users,
  UserCheck,
  Timer,
  FileUp,
  CalendarCheck,
  CalendarCheck2,
  CalendarDays,
  CalendarX,
  GraduationCap,
  ArrowRight,
  Activity,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/authz";
import { employeeName } from "@/server/services/employee";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

interface Stat {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}

const ICC = "h-4 w-4 shrink-0";

export default async function DashboardPage() {
  const ctx = await requirePermission("dashboard.read");
  const companyId = ctx.companyId;

  if (!companyId) {
    const [companies, users, roles] = await Promise.all([
      prisma.company.count(),
      prisma.user.count({ where: { companyId: { not: null } } }),
      prisma.role.count({ where: { isSystem: false } }),
    ]);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform overview</h1>
          <p className="text-sm text-muted-foreground">Super admin view across all tenants.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Companies (tenants)" value={companies} icon={<LandmarkIcon />} accent="bg-blue-100 text-blue-700" />
          <StatCard label="Tenant users" value={users} icon={<Users className={ICC} />} accent="bg-emerald-100 text-emerald-700" />
          <StatCard label="Custom roles" value={roles} icon={<GraduationCap className={ICC} />} accent="bg-amber-100 text-amber-700" />
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Your account is not bound to a company. The platform menu lets you manage tenant companies; switch to a tenant
            account (e.g. <code className="rounded bg-muted px-1.5 py-0.5">admin@acme.example</code>) to view HR dashboards.
          </CardContent>
        </Card>
      </div>
    );
  }

  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const [stats, deptCounts, upcomingConfirmations, pendingDocs, recentEmployees, auditCount, company, todaySummary, pendingLeave, pendingLeaveCount, payrollRun, pendingClaims, assetCounts] =
    await Promise.all([
      Promise.all([
        prisma.employee.count({ where: { companyId } }),
        prisma.employee.count({ where: { companyId, employmentStatus: { in: ["ACTIVE", "PROBATION"] } } }),
        prisma.employee.count({ where: { companyId, employmentStatus: "PROBATION" } }),
        prisma.employee.count({ where: { companyId, employmentStatus: { in: ["RESIGNED", "EXITED"] } } }),
      ]),
      prisma.department.findMany({
        where: { companyId },
        select: { id: true, name: true, _count: { select: { employees: true } } },
        orderBy: { employees: { _count: "desc" } },
        take: 6,
      }),
      prisma.employeeConfirmation.count({ where: { companyId, status: "PENDING" } }),
      prisma.employeeDocument.count({ where: { companyId, status: "PENDING" } }),
      prisma.employee.findMany({
        where: { companyId },
        include: { designation: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.auditLog.count({ where: { companyId } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
      prisma.attendance.groupBy({
        where: { companyId, date: { gte: dayStart, lt: dayEnd } },
        by: ["status"],
        _count: true,
      }),
      prisma.leaveRequest.findMany({
        where: { companyId, status: "PENDING" },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          leaveType: { select: { name: true, color: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 5,
      }),
      prisma.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
      prisma.payrollRun.findFirst({
        where: { companyId, year: today.getFullYear(), month: today.getMonth() + 1 },
        orderBy: { createdAt: "desc" },
        select: { id: true, month: true, year: true, status: true, totalGross: true, totalNet: true, totalDeductions: true, totalReimbursements: true },
      }),
      prisma.reimbursement.count({ where: { companyId, status: "SUBMITTED" } }),
      prisma.asset.groupBy({ where: { companyId }, by: ["status"], _count: true }),
    ]);

  const [totalEmp, activeEmp, probationEmp, exitedEmp] = stats;
  const todayCount = (s: string) => todaySummary.find((r) => r.status === s)?._count ?? 0;
  const assetCount = (s: string) => assetCounts.find((r) => r.status === s)?._count ?? 0;
  const totalApprovals = pendingLeaveCount + pendingClaims;
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? "Company"} · live HR & payroll intelligence
          </p>
        </div>
        <Link href="/employees/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Onboard employee
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total employees" value={totalEmp} icon={<Users className={ICC} />} accent="bg-blue-100 text-blue-700" />
        <StatCard label="Active workforce" value={activeEmp} icon={<UserCheck className={ICC} />} accent="bg-emerald-100 text-emerald-700" />
        <StatCard label="In probation" value={probationEmp} icon={<Timer className={ICC} />} accent="bg-amber-100 text-amber-700" />
        <StatCard label="Left / resigning" value={exitedEmp} icon={<Activity className={ICC} />} accent="bg-rose-100 text-rose-700" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present today" value={todayCount("PRESENT")} icon={<CalendarCheck className={ICC} />} accent="bg-emerald-100 text-emerald-700" />
        <StatCard label="On leave today" value={todayCount("ON_LEAVE")} icon={<CalendarDays className={ICC} />} accent="bg-sky-100 text-sky-700" />
        <StatCard label="Absent today" value={todayCount("ABSENT")} icon={<CalendarX className={ICC} />} accent="bg-rose-100 text-rose-700" />
        <StatCard label="Approvals pending" value={totalApprovals} icon={<CalendarCheck2 className={ICC} />} accent="bg-amber-100 text-amber-700" />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              Payroll — {new Date(today.getFullYear(), today.getMonth()).toLocaleString("default", { month: "long" })} {today.getFullYear()}
            </CardTitle>
            <CardDescription>{payrollRun ? `Last run status: ${payrollRun.status}` : "No payroll run generated this month yet."}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <StatMini label="Total gross" value={payrollRun ? inr.format(Number(payrollRun.totalGross)) : "—"} />
            <StatMini label="Total net" value={payrollRun ? inr.format(Number(payrollRun.totalNet)) : "—"} />
            <StatMini label="Deductions" value={payrollRun ? inr.format(Number(payrollRun.totalDeductions)) : "—"} />
            <StatMini label="Reimbursements" value={payrollRun ? inr.format(Number(payrollRun.totalReimbursements)) : "—"} />
            <div className="col-span-full">
              <Link href="/payroll/runs" className="text-xs font-medium text-primary hover:underline">View payroll runs →</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Assets overview</CardTitle>
            <CardDescription>Allocation status across the organisation</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <StatMini label="Available" value={assetCount("AVAILABLE")} />
            <StatMini label="Allocated" value={assetCount("ALLOCATED")} />
            <StatMini label="In maintenance" value={assetCount("MAINTENANCE")} />
            <StatMini label="Retired" value={assetCount("RETIRED")} />
            <div className="col-span-2">
              <Link href="/assets" className="text-xs font-medium text-primary hover:underline">Manage assets →</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Attention needed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <Row label="Leave approvals pending" value={pendingLeaveCount} icon={<CalendarCheck2 className={ICC} />} href="/leave" />
            <Row label="Claim approvals pending" value={pendingClaims} icon={<FileUp className={ICC} />} href="/finance/reimbursements" />
            <Row label="Upcoming confirmations" value={upcomingConfirmations} icon={<CalendarCheck className={ICC} />} href="/employees" />
            <Row label="Documents pending review" value={pendingDocs} icon={<FileUp className={ICC} />} href="/employees" />
            <Row label="Audit events recorded" value={auditCount} icon={<Activity className={ICC} />} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Pending leave requests</CardTitle>
            <CardDescription>Awaiting approval</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {pendingLeave.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No pending approvals.</p>
            ) : (
              pendingLeave.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium">
                      {r.employee.firstName} {r.employee.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.leaveType.name} · {formatDate(r.startDate)}{r.endDate > r.startDate ? ` – ${formatDate(r.endDate)}` : ""}
                    </p>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent joiners</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {recentEmployees.map((e) => (
                <Link key={e.id} href={`/employees/${e.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/50">
                  <Avatar name={`${e.firstName} ${e.lastName}`} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{employeeName(e)}</p>
                    <p className="text-xs text-muted-foreground">{e.employeeCode} · {e.designation?.title ?? "—"}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Headcount by department</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deptCounts.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{d.name}</span>
                  <Badge variant="secondary">{d._count.employees}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LandmarkIcon() {
  return (
    <svg className={ICC} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" x2="21" y1="22" y2="22" />
      <line x1="6" x2="6" y1="18" y2="11" />
      <line x1="10" x2="10" y1="18" y2="11" />
      <line x1="14" x2="14" y1="18" y2="11" />
      <line x1="18" x2="18" y1="18" y2="11" />
      <polygon points="12 2 20 7 4 7" />
    </svg>
  );
}

function StatCard({ label, value, icon, accent }: Stat) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, icon, href }: { label: string; value: number; icon: React.ReactNode; href?: string }) {
  const inner = (
    <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-muted/50">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="flex items-center gap-1 font-semibold">
        {value} {href ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
      </span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-bold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}