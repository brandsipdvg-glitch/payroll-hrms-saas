import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { runSavedReport } from "@/server/controllers/reporting";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => runSavedReport(req, (await params).id));
export const POST = (req: NextRequest, { params }: Params) => api(async () => runSavedReport(req, (await params).id));