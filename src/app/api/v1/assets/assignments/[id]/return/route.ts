import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { returnAssignment } from "@/server/controllers/assets";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) => api(async () => returnAssignment(req, (await params).id));