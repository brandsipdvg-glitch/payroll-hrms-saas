import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { payrollSummary } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => payrollSummary(req));