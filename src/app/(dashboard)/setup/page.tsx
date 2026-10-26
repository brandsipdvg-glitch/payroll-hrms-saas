import Link from "next/link";
import {
  Building2,
  MapPin,
  Network,
  IdCard,
  Layers,
  Tag,
  Landmark,
  Boxes,
  CalendarRange,
  PartyPopper,
  Clock,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SETUP_MODULES } from "@/config/modules";
import PermissionGate from "@/components/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Organization setup" };

const ICONS: Record<string, LucideIcon> = {
  branches: Building2,
  locations: MapPin,
  departments: Network,
  designations: IdCard,
  grades: Layers,
  categories: Tag,
  costCenters: Landmark,
  businessUnits: Boxes,
  holidayCalendars: CalendarRange,
  holidays: PartyPopper,
  shifts: Clock,
  weeklyOffRules: CalendarDays,
};

export default function SetupPage() {
  return (
    <PermissionGate permission="branches.read">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Organization setup</h1>
          <p className="text-sm text-muted-foreground">
            Configure the building blocks used across payroll and HR operations.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SETUP_MODULES.map((m) => {
            const Icon = ICONS[m.slug] ?? Boxes;
            return (
              <Link key={m.slug} href={`/setup/${m.slug}`}>
                <Card className="h-full transition-colors hover:border-primary/50 hover:bg-muted/40">
                  <CardContent className="flex items-start gap-3 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{m.label}</p>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.description}</p>
                      <Badge variant="outline" className="mt-2">{m.fields.length} fields</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </PermissionGate>
  );
}