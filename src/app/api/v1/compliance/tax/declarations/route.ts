import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listDeclarations, upsertDeclaration } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => listDeclarations(req));
export const POST = (req: NextRequest) => api(async () => upsertDeclaration(req));