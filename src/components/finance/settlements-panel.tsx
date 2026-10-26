"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Eye, Trash2, RefreshCw, Banknote } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, settlementsApi } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmployeeSelect } from "@/components/finance/employee-select";

type Row = Record<string, unknown>;
type LineRow = { type: string; description: string; amount: string | number };

const LINE_TYPE_LABELS: Record<string, string> = {
  FINAL_SALARY: "Final salary",
  LEAVE_ENCASHMENT: "Leave encashment",
  GRATUITY: "Gratuity",
  LOAN_RECOVERY: "Loan recovery",
  BONUS: "Bonus",
  REIMBURSEMENT: "Reimbursement",
  OTHER_ADJUSTMENT: "Other adjustment",
};

export function SettlementsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const [employeeId, setEmployeeId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Array<Row & { employee?: { employeeCode: string; firstName: string; lastName: string } | null }>>(settlementsApi);
      setRows(
        (data ?? []).map((r) => ({
          ...r,
          employeeCode: r.employee?.employeeCode,
          employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "",
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load settlements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const post = async (path: string, body?: Record<string, unknown>, method = "POST") => {
    try {
      await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      setRefresh((r) => r + 1);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operation failed.");
      return false;
    }
  };

  const create = async () => {
    if (!employeeId) {
      toast.error("Select an employee.");
      return;
    }
    if (await post(settlementsApi, { employeeId })) {
      toast.success("Settlement computed from exit, leave balance, gratuity, loans and pending amounts.");
      setOpen(false);
      setEmployeeId("");
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge variant="success">Approved</Badge>;
    if (s === "DISBURSED") return <Badge variant="default">Disbursed</Badge>;
    return <Badge variant="warning">Draft</Badge>;
  };

  const columns: Column<Row>[] = [
    { key: "employeeCode", title: "Employee", render: (r) => `${r.employeeCode} · ${r.employeeName ?? ""}` },
    { key: "lastWorkingDate", title: "Last working day", render: (r) => formatDate(String(r.lastWorkingDate)) },
    { key: "totalAmount", title: "Net settlement", className: "text-right", render: (r) => formatCurrency(Number(r.totalAmount)) },
    { key: "status", title: "Status", render: (r) => statusBadge(String(r.status)) },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => {
        const s = String(r.status);
        return (
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setViewTarget(r)}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Lines
            </Button>
            {s === "DRAFT" && (
              <>
                <Button variant="outline" size="sm" onClick={() => void post(`${settlementsApi}/${r.id}/approve`)}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
                <Button variant="outline" size="sm" onClick={() => void post(`${settlementsApi}/${r.id}`, undefined, "DELETE")}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </>
            )}
            {s === "APPROVED" && (
              <Button variant="outline" size="sm" onClick={() => void post(`${settlementsApi}/${r.id}/disburse`)}>
                <Banknote className="mr-1 h-3.5 w-3.5" /> Disburse
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Full & Final Settlement</h1>
          <p className="text-sm text-muted-foreground">Final salary, leave encashment, gratuity, loan recovery and pending bonuses/claims.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Create settlement
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Settlements</CardTitle>
          <CardDescription>Computed for employees with an exit record. Approving marks the exit clearances as done.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No settlements yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create settlement"
        description="An exit record must exist for the employee. All components are computed automatically."
        footer={
          <Button size="sm" onClick={() => void create()}>
            Compute & create
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label>Employee</Label>
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        </div>
      </Dialog>

      <Dialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        title="Settlement breakdown"
        description={viewTarget ? `${viewTarget.employeeName ?? ""} · ${formatCurrency(Number(viewTarget.totalAmount))}` : undefined}
        size="lg"
      >
        {viewTarget ? (
          <DataTable
            columns={[
              { key: "type", title: "Component", render: (r) => LINE_TYPE_LABELS[String(r.type)] ?? String(r.type).split("_").join(" ") },
              { key: "description", title: "Description" },
              {
                key: "amount",
                title: "Amount",
                className: "text-right",
                render: (r) => {
                  const amt = Number(r.amount);
                  return <span className={amt < 0 ? "text-destructive" : ""}>{formatCurrency(amt)}</span>;
                },
              },
            ]}
            rows={(viewTarget.lines as unknown[] ?? []) as Array<LineRow & Record<string, unknown>>}
            loading={false}
            total={(viewTarget.lines as unknown[])?.length ?? 0}
            page={1}
            pageSize={Math.max((viewTarget.lines as unknown[])?.length ?? 0, 1)}
            onPageChange={() => undefined}
            empty={<>No lines.</>}
          />
        ) : null}
      </Dialog>
    </div>
  );
}