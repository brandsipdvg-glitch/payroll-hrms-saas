import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { deleteLeavePolicy } from "@/server/controllers/leave";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteLeavePolicy(req, (await params).id));