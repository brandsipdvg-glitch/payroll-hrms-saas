import PermissionGate from "@/components/permission-gate";
import { MyTaxPanel } from "@/components/compliance/my-tax-panel";

export const metadata = { title: "My income tax" };

export default function MyTaxPage() {
  return (
    <PermissionGate permission="incomeTax.read">
      <MyTaxPanel />
    </PermissionGate>
  );
}