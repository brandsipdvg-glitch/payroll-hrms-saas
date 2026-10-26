import PermissionGate from "@/components/permission-gate";
import { BalancePanel } from "@/components/leave/balance-panel";

export const metadata = { title: "Leave balances" };

export default function LeaveBalancesPage() {
  return (
    <PermissionGate permission="leavePolicies.read">
      <BalancePanel />
    </PermissionGate>
  );
}