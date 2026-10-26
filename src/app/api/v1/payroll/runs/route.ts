import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listRuns, createRun } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listRuns(req));
export const POST = (req: NextRequest) => api(() => createRun(req));