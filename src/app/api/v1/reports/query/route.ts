import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { queryBuilder } from "@/server/controllers/reporting";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => queryBuilder(req));