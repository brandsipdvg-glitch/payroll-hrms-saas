import PermissionGate from "@/components/permission-gate";
import { BonusPanel } from "@/components/finance/bonus-panel";

export const metadata = { title: "Bonus" };

export default function FinanceBonusPage() {
  return (
    <PermissionGate permission="bonusPlans.read">
      <BonusPanel />
    </PermissionGate>
  );
}