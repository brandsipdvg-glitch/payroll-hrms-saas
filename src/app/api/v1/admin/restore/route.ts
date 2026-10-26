import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { restoreTenant } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => restoreTenant(req));