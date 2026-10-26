import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { esiReturnCsv } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => esiReturnCsv(req));