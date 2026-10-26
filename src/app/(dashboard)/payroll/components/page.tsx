import PermissionGate from "@/components/permission-gate";
import { ComponentsPanel } from "@/components/payroll/components-panel";

export const metadata = { title: "Pay components" };

export default function PayComponentsPage() {
  return (
    <PermissionGate permission="payComponents.read">
      <ComponentsPanel />
    </PermissionGate>
  );
}