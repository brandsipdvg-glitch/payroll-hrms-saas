import PermissionGate from "@/components/permission-gate";
import { ItPanel } from "@/components/compliance/it-panel";

export const metadata = { title: "Income tax / TDS" };

export default function ComplianceTaxPage() {
  return (
    <PermissionGate permission="incomeTax.read">
      <ItPanel />
    </PermissionGate>
  );
}