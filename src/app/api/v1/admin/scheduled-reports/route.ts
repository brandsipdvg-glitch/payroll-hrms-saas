import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listScheduledReportsEndpoint, createScheduledReportEndpoint } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listScheduledReportsEndpoint(req));
export const POST = (req: NextRequest) => api(() => createScheduledReportEndpoint(req));