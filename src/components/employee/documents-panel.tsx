"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { FileText, Upload, Download, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, downloadResource, ApiClientError, employeesApi } from "@/lib/client/api";
import { canAccess } from "@/config/navigation";
import { documentCategoryOptions, DOCUMENT_STATUS_LABELS } from "@/lib/audit";
import { formatDate } from "@/lib/utils";
import type { Option } from "@/config/modules";

interface DocRow {
  id: string;
  name: string;
  category: string;
  status: string;
  notes?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  uploader?: { name: string } | null;
  uploadedBy?: string | null;
  uploadedAt?: Date | string;
  createdAt: Date | string;
  verifiedBy?: string | null;
  verifiedAt?: Date | string | null;
}

const fmtSize = (n?: number | null) => {
  if (!n) return "";
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = n / 1024;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;
  return `${n} B`;
};

export function DocumentsPanel({ employeeId, canForm, canManage }: { employeeId: string; canForm: boolean; canManage: boolean }) {
  const { data: session } = useSession();
  const perms = session?.user?.permissions;
  const mayCreate = canForm && canAccess(perms, "employeeDocuments.create");
  const mayApprove = canManage && canAccess(perms, "employeeDocuments.manage");
  const mayDelete = canAccess(perms, "employeeDocuments.delete");

  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(documentCategoryOptions[0]?.value ?? "OTHER");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = (await apiFetch(`${employeesApi}/${employeeId}/documents`)) as DocRow[];
      setRows(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load documents.");
      setRows([]);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async () => {
    if (!file) {
      toast.error("Choose a file to upload.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("name", name || file.name);
      fd.append("category", category);
      if (notes) fd.append("notes", notes);
      fd.append("file", file);
      await apiFetch(`${employeesApi}/${employeeId}/documents`, { method: "POST", body: fd });
      toast.success("Document uploaded.");
      setOpen(false);
      setName("");
      setNotes("");
      setFile(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (doc: DocRow, status: "APPROVED" | "REJECTED") => {
    setBusy(true);
    try {
      await apiFetch(`${employeesApi}/${employeeId}/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`Document ${status.toLowerCase()}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc: DocRow) => {
    if (!window.confirm(`Delete "${doc.name}"? This removes the file permanently.`)) return;
    setBusy(true);
    try {
      await apiFetch(`${employeesApi}/${employeeId}/documents/${doc.id}`, { method: "DELETE" });
      toast.success("Document deleted.");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows ? `${rows.length} document${rows.length === 1 ? "" : "s"}` : "Loading…"}
        </p>
        {mayCreate ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" /> Upload document
          </Button>
        ) : null}
      </div>

      {rows?.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No documents yet.</p>
      ) : null}

      <div className="grid gap-3">
        {rows?.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-sm">{d.name}</p>
                  <Badge variant="outline">{documentLabel(d.category)}</Badge>
                  <Badge variant={statusVariant(d.status)}>{DOCUMENT_STATUS_LABELS[d.status as keyof typeof DOCUMENT_STATUS_LABELS] ?? d.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {d.fileName} {fmtSize(d.fileSize)} · uploaded {formatDate(d.createdAt)}
                  {d.verifiedAt ? ` · verified ${formatDate(d.verifiedAt)}` : ""}
                </p>
                {d.notes ? <p className="mt-1 text-xs text-muted-foreground">{d.notes}</p> : null}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => void downloadResource(`${employeesApi}/${employeeId}/documents/${d.id}`)}>
                  <Download className="h-4 w-4" />
                </Button>
                {mayApprove && d.status === "PENDING" ? (
                  <>
                    <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => void setStatus(d, "APPROVED")}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void setStatus(d, "REJECTED")}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : null}
                {mayDelete ? (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(d)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="Upload document" description="Attach a file (max 10 MB; PDF, PNG, JPG, DOC, XLS).">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name">Name</Label>
            <Input id="doc-name" value={name} placeholder="e.g. PAN card" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Category</Label>
            <Select id="doc-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {documentCategoryOptions.map((o: Option) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Notes</Label>
            <Input id="doc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input id="doc-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button className="w-full" onClick={upload} disabled={busy || !file}>
            {busy ? <Spinner /> : <Upload className="h-4 w-4" />} Upload
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  PAN: "PAN",
  AADHAAR: "Aadhaar",
  OFFER_LETTER: "Offer letter",
  APPOINTMENT_LETTER: "Appointment letter",
  CONTRACT: "Contract",
  CERTIFICATE: "Certificate",
  PROMOTION_LETTER: "Promotion letter",
  TRANSFER_LETTER: "Transfer letter",
  RESIGNATION_ACCEPTANCE: "Resignation acceptance",
  TRAINING_CERTIFICATE: "Training certificate",
  PHOTO: "Photo",
  RESUME: "Resume",
  OTHER: "Other",
};

function documentLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category;
}

function statusVariant(status: string): "default" | "success" | "warning" | "destructive" {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "destructive";
    case "PENDING":
      return "warning";
    default:
      return "default";
  }
}