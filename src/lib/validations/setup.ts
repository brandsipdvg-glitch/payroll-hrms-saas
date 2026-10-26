import { z } from "zod";
import type { FieldDef } from "@/config/modules";

/**
 * Builds a zod schema from a module's field definitions.
 * Handles type coercion (dates -> Date, numbers, arrays) and required checks.
 */
export function buildModuleSchema(fields: FieldDef[], mode: "create" | "update" = "create") {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    switch (f.type) {
      case "number":
      case "decimal":
        shape[f.name] = z.union([z.string(), z.number(), z.null()]).optional();
        break;
      case "date":
      case "time":
        shape[f.name] = z.union([z.string(), z.null()]).optional();
        break;
      case "multiselect":
        shape[f.name] = z.array(z.string()).optional();
        break;
      case "checkbox":
        shape[f.name] = z.boolean().optional();
        break;
      default:
        shape[f.name] = z.union([z.string(), z.null()]).optional();
        break;
    }
  }

  const base = z.object(shape).passthrough();

  const validated = base.superRefine((data, ctx) => {
    if (mode === "update") {
      if (Object.keys(data).length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: "Provide at least one field to update." });
      }
      return;
    }
    for (const f of fields) {
      if (!f.required) continue;
      const v = data[f.name];
      let empty: boolean;
      if (f.type === "multiselect") empty = !Array.isArray(v) || v.length === 0;
      else if (f.type === "checkbox") empty = false;
      else if (f.type === "number" || f.type === "decimal")
        empty = v === undefined || v === null || v === "";
      else empty = v === undefined || v === null || String(v).trim() === "";
      if (empty) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f.name], message: `${f.label} is required.` });
      }
    }
  });

  return validated.transform((data) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = data[f.name];
      if (v === undefined || v === null) continue;
      switch (f.type) {
        case "date":
          out[f.name] = v === "" ? null : new Date(v as string);
          break;
        case "time":
          out[f.name] = v === "" ? null : v;
          break;
        case "number":
        case "decimal":
          out[f.name] = v === "" ? null : Number(v);
          break;
        case "multiselect":
          out[f.name] = Array.isArray(v) ? v : [];
          break;
        default:
          out[f.name] = v;
      }
    }
    return out;
  });
}

export type ModuleSchema = ReturnType<typeof buildModuleSchema>;