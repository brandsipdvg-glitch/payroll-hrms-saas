import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { previewStructure } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => previewStructure(req));