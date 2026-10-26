import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { cancelMyLeave } from "@/server/controllers/me";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => cancelMyLeave(req, (await params).id));