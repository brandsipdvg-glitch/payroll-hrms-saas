import PermissionGate from "@/components/permission-gate";
import { LeavePanel } from "@/components/leave/leave-panel";

export const metadata = { title: "Leave management" };

export default function LeavePage() {
  return (
    <PermissionGate permission="leavePolicies.read">
      <LeavePanel />
    </PermissionGate>
  );
}