import PermissionGate from "@/components/permission-gate";
import { SettlementsPanel } from "@/components/finance/settlements-panel";

export const metadata = { title: "Full & final settlement" };

export default function FinanceSettlementsPage() {
  return (
    <PermissionGate permission="settlements.read">
      <SettlementsPanel />
    </PermissionGate>
  );
}