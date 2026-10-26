import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateLeaveType, deleteLeaveType } from "@/server/controllers/leave";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateLeaveType(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteLeaveType(req, (await params).id));