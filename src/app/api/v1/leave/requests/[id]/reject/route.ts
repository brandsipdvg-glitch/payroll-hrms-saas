import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { rejectRequest } from "@/server/controllers/leave";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => rejectRequest(req, (await params).id));