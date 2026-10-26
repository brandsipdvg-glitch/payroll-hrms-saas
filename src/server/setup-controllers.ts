import { buildResourceController, type ResourceController, type ResourceSpec } from "@/server/resource";

const SETUP_SPECS: ResourceSpec[] = [
  { slug: "branches", model: "branch" },
  { slug: "locations", model: "location" },
  { slug: "departments", model: "department" },
  { slug: "designations", model: "designation" },
  { slug: "grades", model: "grade" },
  { slug: "categories", model: "category" },
  { slug: "costCenters", model: "costCenter" },
  { slug: "businessUnits", model: "businessUnit" },
  { slug: "holidayCalendars", model: "holidayCalendar" },
  { slug: "holidays", model: "holiday" },
  { slug: "shifts", model: "shiftMaster" },
  { slug: "weeklyOffRules", model: "weeklyOffRule" },
];

export const setupControllers: Record<string, ResourceController> = Object.fromEntries(
  SETUP_SPECS.map((s) => [s.slug, buildResourceController(s)])
);

export function getSetupController(slug: string): ResourceController | undefined {
  return setupControllers[slug];
}

export const companiesController = buildResourceController({
  slug: "companies",
  model: "company",
  tenantScoped: false,
  archivable: true,
});