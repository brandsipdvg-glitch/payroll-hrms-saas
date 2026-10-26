import PermissionGate from "@/components/permission-gate";
import { PolicyPanel } from "@/components/attendance/policy-panel";

export const metadata = { title: "Attendance policies" };

export default function AttendancePoliciesPage() {
  return (
    <PermissionGate permission="attendancePolicies.read">
      <PolicyPanel />
    </PermissionGate>
  );
}