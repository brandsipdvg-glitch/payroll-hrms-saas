import PermissionGate from "@/components/permission-gate";
import { RunsPanel } from "@/components/payroll/runs-panel";

export const metadata = { title: "Payroll runs" };

export default function PayrollRunsPage() {
  return (
    <PermissionGate permission="payrollRuns.read">
      <RunsPanel />
    </PermissionGate>
  );
}