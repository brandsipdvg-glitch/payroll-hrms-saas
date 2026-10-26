import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listDevices, createDevice } from "@/server/controllers/attendance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listDevices(req));
export const POST = (req: NextRequest) => api(() => createDevice(req));