import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { closeLoan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => closeLoan(req, (await params).id));