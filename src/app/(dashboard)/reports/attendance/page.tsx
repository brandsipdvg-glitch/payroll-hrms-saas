import PermissionGate from "@/components/permission-gate";
import { ReportAttendance } from "@/components/reports/report-attendance";

export const metadata = { title: "Attendance reports" };

export default function AttendanceReportsPage() {
  return (
    <PermissionGate permission="attendancePolicies.read">
      <ReportAttendance />
    </PermissionGate>
  );
}