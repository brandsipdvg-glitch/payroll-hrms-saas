import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { ptRegisterCsv } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => ptRegisterCsv(req));