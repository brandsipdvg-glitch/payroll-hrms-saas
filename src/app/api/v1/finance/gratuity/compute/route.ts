import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { computeGratuity } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => computeGratuity(req));