import PermissionGate from "@/components/permission-gate";
import { RunDetail } from "@/components/payroll/run-detail";

export const metadata = { title: "Payroll run" };

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="payrollRuns.read">
      <RunDetail runId={id} />
    </PermissionGate>
  );
}