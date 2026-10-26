"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, X, RefreshCw } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiClientError, meReimbursementsApi } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

const TYPES = ["TRAVEL", "MEDICAL", "FUEL", "MOBILE", "INTERNET", "FOOD", "LTA"];

export function MyClaimsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Row>({ type: "TRAVEL", description: "", expenseDate: "", amount: "", billReference: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await apiFetch<Row[]>(meReimbursementsApi)) ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load your claims.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const submit = async () => {
    if (!form.description || !form.expenseDate || !form.amount) {
      toast.error("Description, date and amount are required.");
      return;
    }
    try {
      await apiFetch(meReimbursementsApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("Claim submitted for approval.");
      setOpen(false);
      setForm({ type: "TRAVEL", description: "", expenseDate: "", amount: "", billReference: "" });
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Submission failed.");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await apiFetch(`${meReimbursementsApi}/${editing.id}`, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Claim updated.");
      setEditing(null);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    }
  };

  const cancel = async (id: string) => {
    try {
      await apiFetch(`${meReimbursementsApi}/${id}/cancel`, { method: "POST" });
      toast.success("Claim withdrawn.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Cancel failed.");
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge variant="success">Approved</Badge>;
    if (s === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
    if (s === "PROCESSED") return <Badge variant="default">Processed</Badge>;
    if (s === "CANCELLED") return <Badge variant="secondary">Cancelled</Badge>;
    return <Badge variant="warning">Submitted</Badge>;
  };

  const columns: Column<Row>[] = [
    { key: "type", title: "Type", render: (r) => String(r.type).split("_").join(" ") },
    { key: "description", title: "Description" },
    { key: "expenseDate", title: "Date", render: (r) => formatDate(String(r.expenseDate)) },
    { key: "amount", title: "Amount", className: "text-right", render: (r) => formatCurrency(Number(r.amount)) },
    { key: "status", title: "Status", render: (r) => statusBadge(String(r.status)) },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) =>
        r.status === "SUBMITTED" ? (
          <div className="flex justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(r);
                setForm({ type: r.type, description: r.description, expenseDate: String(r.expenseDate).slice(0, 10), amount: String(r.amount), billReference: r.billReference ?? "" });
                setOpen(true);
              }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => void cancel(String(r.id))}>
              <X className="mr-1 h-3.5 w-3.5" /> Withdraw
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Claims</h1>
          <p className="text-sm text-muted-foreground">Submit expense claims — they move through approve → process into payroll.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setForm({ type: "TRAVEL", description: "", expenseDate: "", amount: "", billReference: "" }); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> New claim
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">My claims</CardTitle>
          <CardDescription>Travel, medical, fuel, mobile, internet, food and LTA reimbursements.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No claims yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit claim" : "New claim"}
        footer={
          <Button size="sm" onClick={() => void (editing ? saveEdit() : submit())}>
            {editing ? "Save changes" : "Submit claim"}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={String(form.type)} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expense date</Label>
              <Input type="date" value={String(form.expenseDate)} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={String(form.description)} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={String(form.amount)} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bill reference</Label>
              <Input value={String(form.billReference)} onChange={(e) => setForm((f) => ({ ...f, billReference: e.target.value }))} />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}