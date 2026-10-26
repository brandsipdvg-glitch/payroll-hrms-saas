import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { decideEncashment } from "@/server/controllers/leave";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => decideEncashment(req, (await params).id));