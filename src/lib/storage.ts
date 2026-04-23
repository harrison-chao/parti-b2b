import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://gnyckydpydgxpgnxqeje.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = "drawings";
const BACKUP_BUCKET = "backups";

export function getStorageClient() {
  if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 未配置，无法上传图纸");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function uploadDrawing(file: File, prefix: string): Promise<{ url: string; path: string }> {
  const client = getStorageClient();
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export const ALLOWED_DRAWING_EXTS = [".pdf", ".dwg", ".step", ".stp"];
export const MAX_DRAWING_BYTES = 20 * 1024 * 1024;

export const ALLOWED_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Sniff magic bytes to confirm the upload is actually an image, and return a canonical content-type. */
export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export async function uploadImage(file: File, prefix: string): Promise<{ url: string; path: string }> {
  const client = getStorageClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) throw new Error("文件不是有效的 PNG/JPEG/WebP 图片");
  const ext = sniffed === "image/png" ? ".png" : sniffed === "image/jpeg" ? ".jpg" : ".webp";
  // Server-generated filename — client name is never trusted for path construction.
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: sniffed,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function uploadJsonBackup(path: string, payload: unknown): Promise<{ bucket: string; path: string }> {
  const client = getStorageClient();
  const json = JSON.stringify(payload, null, 2);
  const bytes = new TextEncoder().encode(json);

  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(listError.message);
  const exists = buckets?.some((bucket) => bucket.name === BACKUP_BUCKET);
  if (!exists) {
    const { error: createError } = await client.storage.createBucket(BACKUP_BUCKET, { public: false });
    if (createError) throw new Error(createError.message);
  }

  const { error } = await client.storage.from(BACKUP_BUCKET).upload(path, bytes, {
    contentType: "application/json; charset=utf-8",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { bucket: BACKUP_BUCKET, path };
}
