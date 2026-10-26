import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { bulkUploadEmployees } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => bulkUploadEmployees(req));