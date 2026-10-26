"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, setupApi, type PaginatedMeta } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { buildModuleSchema } from "@/lib/validations/setup";
import type { FieldDef, ModuleDef, Option } from "@/config/modules";
import { MODULE_MAP } from "@/config/modules";
import { formatDate } from "@/lib/utils";

interface ModuleCrudProps {
  module: ModuleDef;
  /** API base path, e.g. `/api/v1/setup/branches`. */
  apiBase: string;
  /** Copy for the delete action when archiving instead of deleting. */
  archiveLabel?: string;
}

interface OptionMap {
  [resource: string]: Option[];
}

export function ModuleCrud({ module, apiBase, archiveLabel }: ModuleCrudProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [meta, setMeta] = useState<PaginatedMeta>({ page: 1, pageSize: 20, total: 0, pageCount: 1 });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [options, setOptions] = useState<OptionMap>({});
  const [loading, setLoading] = useState(true);

  // Schemas for create / update mode (required fields are enforced only on create).
  const createSchema = useMemo(() => buildModuleSchema(module.fields, "create"), [module]);
  const updateSchema = useMemo(() => buildModuleSchema(module.fields, "update"), [module]);

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(editing ? updateSchema : createSchema),
    defaultValues: {},
  });

  const load = useCallback(
    async (page: number, term: string) => {
      setLoading(true);
      try {
        const res = await listResource<Record<string, unknown>>(apiBase, { page, pageSize: 20, search: term });
        setRows(res.data);
        setMeta(res.meta);
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : "Failed to load records.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBase]
  );

  useEffect(() => {
    void load(1, "");
  }, [load]);

  // Preload dropdown options for FK fields that reference other setup modules.
  useEffect(() => {
    const resources = module.fields.filter((f) => f.resource).map((f) => f.resource as string);
    void Promise.all(
      resources.map(async (r) => {
        try {
          const res = await listResource<Record<string, unknown>>(setupApi(r), { pageSize: 500 });
          const opt = res.data.map((row) => ({
            value: String(row.id),
            label: String(row[MODULE_MAP[r]?.titleField ?? "name"] ?? row.name ?? row.id),
          }));
          setOptions((prev) => ({ ...prev, [r]: opt }));
        } catch {
          setOptions((prev) => ({ ...prev, [r]: [] }));
        }
      })
    );
  }, [module]);

  const openCreate = () => {
    setEditing(null);
    reset({});
    setOpen(true);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setEditing(row);
    reset(row);
    setOpen(true);
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      if (editing) {
        await apiFetch(`${apiBase}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(values) });
        toast.success(`${module.singular} updated.`);
      } else {
        await apiFetch(apiBase, { method: "POST", body: JSON.stringify(values) });
        toast.success(`${module.singular} created.`);
      }
      setOpen(false);
      void load(meta.page, search);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  });

  const onDelete = async (row: Record<string, unknown>) => {
    if (!window.confirm(`Delete ${module.singular.toLowerCase()} "${String(row[module.titleField] ?? "")}"?`)) return;
    try {
      await apiFetch(`${apiBase}/${String(row.id)}`, { method: "DELETE" });
      toast.success(archiveLabel ?? `${module.singular} deleted.`);
      void load(meta.page, search);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    }
  };

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: module.titleField,
      title: module.singular,
      render: (row) => (
        <div>
          <p className="font-medium">{String(row[module.titleField] ?? "—")}</p>
          {typeof row.updatedAt === "string" ? (
            <p className="text-xs text-muted-foreground">Updated {formatDate(row.updatedAt)}</p>
          ) : null}
        </div>
      ),
    },
    ...(module.fields.some((f) => f.name === "code")
      ? [
          {
            key: "code",
            title: "Code",
            render: (row: Record<string, unknown>) => <Badge variant="outline">{String(row.code ?? "—")}</Badge>,
          },
        ]
      : []),
    {
      key: "_actions",
      title: "",
      className: "w-24",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(row)} aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{module.label}</h1>
          <p className="text-sm text-muted-foreground">{module.description}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add {module.singular}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={meta.total}
        page={meta.page}
        pageSize={meta.pageSize}
        onPageChange={(p) => void load(p, search)}
        onSearch={(v) => {
          setSearch(v);
          void load(1, v);
        }}
        searchValue={search}
      />

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${module.singular}` : `New ${module.singular}`}
        description={module.label}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {module.fields.map((f) => (
            <Field
              key={f.name}
              field={f}
              span={f.type === "textarea" ? 2 : 1}
              register={register}
              watch={watch}
              setValue={setValue}
              options={f.options ?? options[f.resource ?? ""]}
              error={(errors as unknown as Record<string, { message?: string } | undefined>)[f.name]?.message}
            />
          ))}
        </form>
      </Dialog>
    </div>
  );
}

interface FieldProps {
  field: FieldDef;
  span: number;
  register: ReturnType<typeof useForm>["register"];
  watch: ReturnType<typeof useForm>["watch"];
  setValue: ReturnType<typeof useForm>["setValue"];
  options?: Option[];
  error?: string;
}

function Field({ field, span, register, watch, setValue, options, error }: FieldProps) {
  const required = field.required ? <span className="text-destructive">*</span> : null;
  const spanClass = (span === 2 ? "sm:col-span-2 " : "");

  if (field.type === "textarea") {
    return (
      <div className={`${spanClass}space-y-1.5`}>
        <Label>
          {field.label} {required}
        </Label>
        <Textarea placeholder={field.placeholder} {...register(field.name)} />
        <FieldHint field={field} error={error} />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className={`${spanClass}space-y-1.5`}>
        <Label>
          {field.label} {required}
        </Label>
        <Select defaultValue={field.options?.[0]?.value} {...register(field.name)}>
          <option value="">Select…</option>
          {(options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <FieldHint field={field} error={error} />
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected: string[] = (watch(field.name) as string[]) ?? [];
    return (
      <div className={`${spanClass}space-y-1.5`}>
        <Label>
          {field.label} {required}
        </Label>
        <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
          {(options ?? field.options ?? []).map((o) => {
            const active = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  const next = active ? selected.filter((s) => s !== o.value) : [...selected, o.value];
                  setValue(field.name, next as never);
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <FieldHint field={field} error={error} />
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className={`${spanClass}space-y-1.5 pt-2`}>
        <Label className="flex cursor-pointer items-center gap-2">
          <Checkbox {...register(field.name)} />
          {field.label}
        </Label>
        <FieldHint field={field} error={error} />
      </div>
    );
  }

  if (field.type === "date" || field.type === "time" || field.type === "number" || field.type === "decimal") {
    return (
      <div className={`${spanClass}space-y-1.5`}>
        <Label>
          {field.label} {required}
        </Label>
        <Input
          type={field.type === "date" ? "date" : field.type === "time" ? "time" : "number"}
          min={field.type === "number" || field.type === "decimal" ? field.min : undefined}
          max={field.type === "number" || field.type === "decimal" ? field.max : undefined}
          step={field.type === "decimal" ? (field.step ?? "0.01") : undefined}
          placeholder={field.placeholder}
          {...register(field.name)}
        />
        <FieldHint field={field} error={error} />
      </div>
    );
  }

  return (
    <div className={`${spanClass}space-y-1.5`}>
      <Label>
        {field.label} {required}
      </Label>
      <Input type={field.type === "email" ? "email" : "text"} placeholder={field.placeholder} {...register(field.name)} />
      <FieldHint field={field} error={error} />
    </div>
  );
}

function FieldHint({ field, error }: { field: FieldDef; error?: string }) {
  if (error) return <p className="text-xs font-medium text-destructive">{error}</p>;
  if (field.hint) return <p className="text-xs text-muted-foreground">{field.hint}</p>;
  return null;
}