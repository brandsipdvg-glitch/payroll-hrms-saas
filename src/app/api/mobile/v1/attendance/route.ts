import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobileAttendance } from "@/server/controllers/mobile";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => mobileAttendance(req));