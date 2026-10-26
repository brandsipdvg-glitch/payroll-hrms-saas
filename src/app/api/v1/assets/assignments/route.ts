import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listAssignments, createAssignment } from "@/server/controllers/assets";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listAssignments(req));
export const POST = (req: NextRequest) => api(() => createAssignment(req));