import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { runReport, exportReport, queryBuilder, getQuerySchema } from "@/server/controllers/reporting";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => runReport(req, "PAYROLL"));
export const POST = (req: NextRequest) => api(() => exportReport(req, "PAYROLL"));