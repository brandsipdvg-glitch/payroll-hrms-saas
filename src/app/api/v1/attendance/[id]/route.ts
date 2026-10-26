import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getAttendanceById, updateAttendance, deleteAttendance } from "@/server/controllers/attendance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getAttendanceById(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateAttendance(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteAttendance(req, (await params).id));