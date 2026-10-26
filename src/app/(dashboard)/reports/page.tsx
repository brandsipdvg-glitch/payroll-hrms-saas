import PermissionGate from "@/components/permission-gate";
import { ReportRunner } from "@/components/reports/report-runner";

export const metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <PermissionGate permission="reports.read">
      <ReportRunner />
    </PermissionGate>
  );
}