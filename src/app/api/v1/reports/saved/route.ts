import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listSavedReports, createSavedReport } from "@/server/controllers/reporting";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listSavedReports(req));
export const POST = (req: NextRequest) => api(() => createSavedReport(req));