import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { createImport, listImports } from "@/server/controllers/attendance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listImports(req));
export const POST = (req: NextRequest) => api(() => createImport(req));