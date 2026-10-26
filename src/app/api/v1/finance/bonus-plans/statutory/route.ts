import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { generateStatutoryBonus } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => generateStatutoryBonus(req));