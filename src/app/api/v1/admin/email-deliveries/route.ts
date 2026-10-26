import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listEmailDeliveries } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listEmailDeliveries(req));