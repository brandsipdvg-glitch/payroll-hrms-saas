import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { companiesController } from "@/server/setup-controllers";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => companiesController.list(req));
export const POST = (req: NextRequest) => api(() => companiesController.create(req));