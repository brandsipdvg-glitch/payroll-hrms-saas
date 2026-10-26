import PermissionGate from "@/components/permission-gate";
import { SelfLeave } from "@/components/me/self-leave";

export const metadata = { title: "My leave" };

export default function MyLeavePage() {
  return (
    <PermissionGate permission="leaveRequests.read">
      <SelfLeave />
    </PermissionGate>
  );
}