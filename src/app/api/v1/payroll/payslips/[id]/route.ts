import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getPayslip } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getPayslip(req, (await params).id));