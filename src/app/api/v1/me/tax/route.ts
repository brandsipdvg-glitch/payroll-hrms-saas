import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { myTax, updateMyDeclaration } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => myTax(req));
export const POST = (req: NextRequest) => api(async () => updateMyDeclaration(req));