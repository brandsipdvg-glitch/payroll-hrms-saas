import PermissionGate from "@/components/permission-gate";
import { AttendancePanel } from "@/components/attendance/attendance-panel";

export const metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <PermissionGate permission="attendancePolicies.read">
      <AttendancePanel />
    </PermissionGate>
  );
}