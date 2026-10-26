import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listAttendance, createAttendanceManual } from "@/server/controllers/attendance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listAttendance(req));
export const POST = (req: NextRequest) => api(() => createAttendanceManual(req));