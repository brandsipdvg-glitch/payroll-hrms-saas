import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { processBonusPlan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => processBonusPlan(req, (await params).id));