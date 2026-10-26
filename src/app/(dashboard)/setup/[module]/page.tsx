import { notFound } from "next/navigation";
import { getModule } from "@/config/modules";
import { ModuleCrud } from "@/components/module-crud";
import PermissionGate from "@/components/permission-gate";

export const metadata = { title: "Setup module" };

export default async function SetupModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const def = getModule(slug);
  if (!def || def.slug === "companies") notFound();

  return (
    <PermissionGate permission={`${def.slug}.read`}>
      <ModuleCrud module={def} apiBase={`/api/v1/setup/${def.slug}`} />
    </PermissionGate>
  );
}