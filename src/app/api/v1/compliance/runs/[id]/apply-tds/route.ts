import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { applyTdsToRun } from "@/server/controllers/compliance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => applyTdsToRun(req, (await params).id));