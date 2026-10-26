import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { backupTenant } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => backupTenant(req));