import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { taxComputationSheet } from "@/server/controllers/compliance";

export const runtime = "nodejs";

type Params = { params: Promise<{ employeeId: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => taxComputationSheet(req, (await params).employeeId));