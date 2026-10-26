import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getStructure, updateStructure } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getStructure(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateStructure(req, (await params).id));