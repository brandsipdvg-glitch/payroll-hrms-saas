import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getQuerySchema } from "@/server/controllers/reporting";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => getQuerySchema(req));