import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { runReport, exportReport } from "@/server/controllers/reporting";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => runReport(req, "HR"));
export const POST = (req: NextRequest) => api(() => exportReport(req, "HR"));