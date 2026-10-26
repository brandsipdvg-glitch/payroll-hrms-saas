import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getSavedReport, updateSavedReport, deleteSavedReport } from "@/server/controllers/reporting";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getSavedReport(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateSavedReport(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteSavedReport(req, (await params).id));