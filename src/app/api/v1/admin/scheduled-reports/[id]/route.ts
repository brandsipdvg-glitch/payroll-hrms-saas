import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateScheduledReportEndpoint, deleteScheduledReportEndpoint, runScheduledReportEndpoint } from "@/server/controllers/admin";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => runScheduledReportEndpoint(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateScheduledReportEndpoint(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteScheduledReportEndpoint(req, (await params).id));