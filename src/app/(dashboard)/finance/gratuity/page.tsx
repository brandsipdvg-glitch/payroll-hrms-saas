import PermissionGate from "@/components/permission-gate";
import { GratuityPanel } from "@/components/finance/gratuity-panel";

export const metadata = { title: "Gratuity" };

export default function FinanceGratuityPage() {
  return (
    <PermissionGate permission="gratuities.read">
      <GratuityPanel />
    </PermissionGate>
  );
}