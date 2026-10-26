import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { attendanceReport } from "@/server/controllers/attendance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => attendanceReport(req));