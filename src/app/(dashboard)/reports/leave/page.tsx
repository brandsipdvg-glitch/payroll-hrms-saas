import PermissionGate from "@/components/permission-gate";
import { ReportLeave } from "@/components/reports/report-leave";

export const metadata = { title: "Leave reports" };

export default function LeaveReportsPage() {
  return (
    <PermissionGate permission="leavePolicies.read">
      <ReportLeave />
    </PermissionGate>
  );
}