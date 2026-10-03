import { createClient } from "@supabase/supabase-js";

// Supabase Storage 配置必须显式提供；不再回退到硬编码项目地址。
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = "drawings";
const BACKUP_BUCKET = "backups";

// bucket 私有性确保结果缓存（每进程一次）
let bucketPrivacyEnsured = false;

export function requireStorageConfig() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未配置，无法访问对象存储");
  }
}

export function getStorageClient() {
  requireStorageConfig();
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/**
 * 确保 drawings 桶存在且为 private。
 * 旧版本使用 public bucket + getPublicUrl，图纸/合同章可被任意持 URL 者永久访问；
 * 现统一转为 private，读取一律走 /api/files 的鉴权签名转发。
 */
export async function ensureBucketPrivate(bucket: string = BUCKET) {
  if (bucketPrivacyEnsured) return;
  const client = getStorageClient();
  const { data: found, error: getError } = await client.storage.getBucket(bucket);
  if (getError && !/not\s*found/i.test(getError.message)) throw new Error(getError.message);
  if (!found) {
    const { error: createError } = await client.storage.createBucket(bucket, { public: false });
    if (createError) throw new Error(createError.message);
  } else if (found.public) {
    const { error: updateError } = await client.storage.updateBucket(bucket, { public: false });
    if (updateError) throw new Error(updateError.message);
  }
  bucketPrivacyEnsured = true;
}

/** 库中存储的稳定访问地址：走应用内鉴权路由，签名 URL 由该路由实时生成。 */
export function filesRouteUrl(path: string): string {
  return `/api/files?path=${encodeURIComponent(path)}`;
}

export async function uploadDrawing(file: File, prefix: string): Promise<{ url: string; path: string }> {
  const client = getStorageClient();
  await ensureBucketPrivate();
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) ?? `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  const path = `${prefix}/${Date.now()}-${rand}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { url: filesRouteUrl(path), path };
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
  await ensureBucketPrivate();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) throw new Error("文件不是有效的 PNG/JPEG/WebP 图片");
  const ext = sniffed === "image/png" ? ".png" : sniffed === "image/jpeg" ? ".jpg" : ".webp";
  const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 16) ?? `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
  // Server-generated filename — client name is never trusted for path construction.
  const path = `${prefix}/${Date.now()}-${rand}${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, {
    contentType: sniffed,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { url: filesRouteUrl(path), path };
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

export async function createBackupDownloadUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const client = getStorageClient();
  const { data, error } = await client.storage.from(BACKUP_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** 为 drawings 桶中的对象生成短时签名 URL（由 /api/files 鉴权后调用）。 */
export async function createDrawingSignedUrl(path: string, expiresIn = 300): Promise<string> {
  const client = getStorageClient();
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
