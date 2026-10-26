import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { cancel } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => cancel(req, (await params).id));