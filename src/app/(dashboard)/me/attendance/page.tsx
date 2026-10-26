import PermissionGate from "@/components/permission-gate";
import { SelfAttendance } from "@/components/me/self-attendance";

export const metadata = { title: "My attendance" };

export default function MyAttendancePage() {
  return (
    <PermissionGate permission="attendance.read">
      <SelfAttendance />
    </PermissionGate>
  );
}