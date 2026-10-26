import PermissionGate from "@/components/permission-gate";
import { StructuresPanel } from "@/components/payroll/structures-panel";

export const metadata = { title: "Salary structures" };

export default function StructuresPage() {
  return (
    <PermissionGate permission="salaryStructures.read">
      <StructuresPanel />
    </PermissionGate>
  );
}