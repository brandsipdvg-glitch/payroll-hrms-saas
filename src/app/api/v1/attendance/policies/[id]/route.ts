import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getPolicy, updatePolicy, deletePolicy } from "@/server/controllers/attendance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => getPolicy(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updatePolicy(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deletePolicy(req, (await params).id));