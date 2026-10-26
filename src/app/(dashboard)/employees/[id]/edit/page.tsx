import PermissionGate from "@/components/permission-gate";
import { EmployeeForm } from "@/components/employee/employee-form";

export const metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="employees.update">
      <EmployeeForm employeeId={id} />
    </PermissionGate>
  );
}