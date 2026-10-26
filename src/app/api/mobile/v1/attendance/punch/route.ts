import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobilePunch } from "@/server/controllers/mobile";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => mobilePunch(req));