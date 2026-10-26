import PermissionGate from "@/components/permission-gate";
import { StatutorySettingsForm } from "@/components/compliance/statutory-settings-form";

export const metadata = { title: "Statutory settings" };

export default function ComplianceSettingsPage() {
  return (
    <PermissionGate permission="compliances.read">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Statutory settings</h1>
          <p className="text-sm text-muted-foreground">EPFO / ESIC / TDS identifiers printed on returns and challans.</p>
        </div>
        <StatutorySettingsForm />
      </div>
    </PermissionGate>
  );
}