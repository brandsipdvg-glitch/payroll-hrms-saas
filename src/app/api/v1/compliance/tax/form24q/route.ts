import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { form24q } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => form24q(req));