import { mkdir, writeFile, unlink, access } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

function storageRoot(): string {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./storage/uploads");
}

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".doc", ".docx", ".xls", ".xlsx", ".txt",
]);

export interface StoredFile {
  relativePath: string;
  fileSize: number;
  mimeType: string;
}

/** Persists an uploaded File under `storage/<employeeId>/<uuid>-<safeName>`. */
export async function storeUpload(employeeId: string, file: File): Promise<StoredFile> {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type "${ext || "(none)"}" is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`);
  }
  const maxBytes = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 10) * 1024 * 1024;
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`File exceeds the ${process.env.MAX_UPLOAD_SIZE_MB ?? "10"} MB limit.`);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const relativePath = path.join(employeeId, `${randomUUID()}-${safeName}`).replace(/\\/g, "/");
  const absPath = path.join(storageRoot(), relativePath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, buf);
  return { relativePath, fileSize: buf.length, mimeType: file.type || "application/octet-stream" };
}

export function resolveStoredPath(relativePath: string): string {
  return path.join(storageRoot(), relativePath);
}

export async function removeStoredFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;
  const abs = resolveStoredPath(relativePath);
  try {
    await access(abs);
    await unlink(abs);
  } catch {
    // already gone
  }
}

export async function readStoredFile(relativePath: string): Promise<Buffer | null> {
  const abs = resolveStoredPath(relativePath);
  try {
    await access(abs);
  } catch {
    return null;
  }
  const { readFile } = await import("fs/promises");
  return readFile(abs);
}