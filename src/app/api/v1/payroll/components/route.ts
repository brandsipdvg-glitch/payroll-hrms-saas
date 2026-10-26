import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listPayComponents, createPayComponent } from "@/server/controllers/payroll";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listPayComponents(req));
export const POST = (req: NextRequest) => api(() => createPayComponent(req));