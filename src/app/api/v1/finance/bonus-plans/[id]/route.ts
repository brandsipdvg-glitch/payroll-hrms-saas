import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getBonusPlan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => getBonusPlan(req, (await params).id));