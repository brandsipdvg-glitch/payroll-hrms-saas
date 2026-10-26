import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getLoan, activateLoan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => getLoan(req, (await params).id));
export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => activateLoan(req, (await params).id));