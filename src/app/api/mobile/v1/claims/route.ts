import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobileClaims, mobileClaimCreate } from "@/server/controllers/mobile";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => mobileClaims(req));
export const POST = (req: NextRequest) => api(() => mobileClaimCreate(req));