import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { myForm16 } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => myForm16(req));