import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { esiRegisterCsv } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => esiRegisterCsv(req));