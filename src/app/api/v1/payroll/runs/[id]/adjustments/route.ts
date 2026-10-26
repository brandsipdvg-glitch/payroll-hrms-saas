import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listAdjustments, createAdjustment } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listAdjustments(req));
export const POST = (req: NextRequest) => api(() => createAdjustment(req));