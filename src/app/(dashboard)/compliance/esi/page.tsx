import PermissionGate from "@/components/permission-gate";
import { EsiPanel } from "@/components/compliance/esi-panel";

export const metadata = { title: "ESI compliance" };

export default function ComplianceEsiPage() {
  return (
    <PermissionGate permission="esi.read">
      <EsiPanel />
    </PermissionGate>
  );
}