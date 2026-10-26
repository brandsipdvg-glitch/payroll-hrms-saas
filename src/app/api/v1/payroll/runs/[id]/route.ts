import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { deleteRun, getRun } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getRun(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteRun(req, (await params).id));
