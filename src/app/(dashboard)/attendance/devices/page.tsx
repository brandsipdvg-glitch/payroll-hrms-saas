import PermissionGate from "@/components/permission-gate";
import { DevicesPanel } from "@/components/attendance/devices-panel";

export const metadata = { title: "Biometric devices" };

export default function AttendanceDevicesPage() {
  return (
    <PermissionGate permission="biometricDevices.read">
      <DevicesPanel />
    </PermissionGate>
  );
}