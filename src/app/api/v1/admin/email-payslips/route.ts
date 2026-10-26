import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { emailPayslipsEndpoint } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => emailPayslipsEndpoint(req));