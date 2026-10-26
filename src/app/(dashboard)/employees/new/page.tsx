import PermissionGate from "@/components/permission-gate";
import { EmployeeForm } from "@/components/employee/employee-form";

export const metadata = { title: "Onboard employee" };

export default function NewEmployeePage() {
  return (
    <PermissionGate permission="employees.create">
      <EmployeeForm />
    </PermissionGate>
  );
}