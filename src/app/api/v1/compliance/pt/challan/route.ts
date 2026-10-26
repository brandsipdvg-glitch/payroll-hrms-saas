import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { ptChallanCsv } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => ptChallanCsv(req));