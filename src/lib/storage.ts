import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://gnyckydpydgxpgnxqeje.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BUCKET = "drawings";

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
