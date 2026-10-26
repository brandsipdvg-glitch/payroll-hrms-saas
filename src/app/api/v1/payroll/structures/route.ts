import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listStructures, createStructure } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listStructures(req));
export const POST = (req: NextRequest) => api(() => createStructure(req));