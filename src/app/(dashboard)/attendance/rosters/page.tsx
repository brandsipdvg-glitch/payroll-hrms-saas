import Link from "next/link";
import { CalendarRange, ArrowRight } from "lucide-react";
import PermissionGate from "@/components/permission-gate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Shift roster" };

export default function ShiftRosterPage() {
  return (
    <PermissionGate permission="shifts.read">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Shift roster</h1>
          <p className="text-sm text-muted-foreground">Shifts define the scheduled in/out times used by the attendance engine.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4" /> Shift management
            </CardTitle>
            <CardDescription>
              Configure shifts (name, start, end, break, week-offs) and assign them to branches, departments, teams or employees.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/setup/shifts"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Manage shifts <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </PermissionGate>
  );
}