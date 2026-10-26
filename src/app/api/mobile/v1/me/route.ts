import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobileMe } from "@/server/controllers/mobile";

export const runtime = "nodejs";

export const GET = (_req: NextRequest) => api(mobileMe);