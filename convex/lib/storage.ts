import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { assetsConfig, objectUrl, presign, s3Config, s3Host, type S3Config } from "./s3";

/**
 * Where the bytes live. A deployment is one or the other, chosen by its env:
 * S3 when `S3_BUCKET` is set, otherwise Convex file storage, which needs no
 * setup at all. Rows written in Convex mode carry a `storageId`; S3 rows do not,
 * so every read below dispatches on the row rather than on the env.
 */
export type Backend = "s3" | "convex";

export const backend = (): Backend => (process.env.S3_BUCKET ? "s3" : "convex");

/** A stored object: its S3 key and bucket, or its Convex storage id. */
export type StoredRef = { key: string; storageId?: Id<"_storage">; bucket?: string };

/**
 * How a client sends one file's bytes. S3 takes a PUT to a presigned URL with
 * exactly `headers`; Convex takes a POST to an upload URL and answers
 * `{ storageId }`, which the client passes back when it records the upload.
 */
export type UploadSlot = { url: string; method: "PUT" | "POST"; headers: Record<string, string> };

/**
 * The assets bucket in S3 mode, or null in Convex mode, where assets need no
 * config. Throws with the setup message when S3 is on but assets are not.
 */
export const assetsTarget = (): S3Config | null => (backend() === "s3" ? assetsConfig() : null);

/** Store a draft's HTML server side. */
export async function putHtml(ctx: ActionCtx, key: string, html: string): Promise<{ storageId?: Id<"_storage"> }> {
  if (backend() === "convex") {
    return { storageId: await ctx.storage.store(new Blob([html], { type: "text/html; charset=utf-8" })) };
  }
  const put = await fetch(await presign(s3Config(), "PUT", key, 300), {
    method: "PUT",
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  });
  if (!put.ok) throw new Error(`Storage upload failed (${put.status}).`);
  return {};
}

/** A stored object's text, or null when it is gone. */
export async function readText(ctx: ActionCtx, ref: StoredRef): Promise<string | null> {
  if (ref.storageId) return (await (await ctx.storage.get(ref.storageId))?.text()) ?? null;
  const upstream = await fetch(await presign(bucketed(s3Config(), ref), "GET", ref.key, 120));
  return upstream.ok ? upstream.text() : null;
}

/**
 * A URL a browser can GET the object from. S3 URLs are presigned for `seconds`;
 * Convex storage URLs do not expire, so they last until the file is deleted.
 */
export async function readUrl(ctx: ActionCtx, ref: StoredRef, seconds: number, config?: S3Config): Promise<string> {
  if (ref.storageId) return (await ctx.storage.getUrl(ref.storageId)) ?? "";
  return presign(bucketed(config ?? s3Config(), ref), "GET", ref.key, seconds);
}

/** The permanent URL of a public asset. */
export async function publicUrl(ctx: ActionCtx, ref: StoredRef, config: S3Config | null): Promise<string> {
  if (ref.storageId || !config) return readUrl(ctx, ref, 0);
  return objectUrl(bucketed(config, ref), ref.key);
}

/** Where a client should send the bytes for `key`. */
export async function uploadSlot(
  ctx: ActionCtx,
  key: string,
  headers: Record<string, string> = {},
  config?: S3Config,
): Promise<UploadSlot> {
  if (backend() === "convex") return { url: await ctx.storage.generateUploadUrl(), method: "POST", headers: {} };
  return { url: await presign(config ?? s3Config(), "PUT", key, 3600, headers), method: "PUT", headers };
}

/** Delete an object. Deleting one that is already gone succeeds. */
export async function removeObject(ctx: ActionCtx, ref: StoredRef, config?: S3Config): Promise<void> {
  if (ref.storageId) {
    await ctx.storage.delete(ref.storageId).catch(() => undefined);
    return;
  }
  const gone = await fetch(await presign(bucketed(config ?? s3Config(), ref), "DELETE", ref.key, 60), {
    method: "DELETE",
  });
  if (!gone.ok) throw new Error(`Storage delete failed (${gone.status}).`);
}

/**
 * The origin our own file pages fetch and upload to, for their `connect-src`:
 * the bucket in S3 mode, the deployment's `.convex.cloud` origin in Convex mode.
 */
export function storageOrigin(): string {
  return backend() === "s3"
    ? `https://${s3Host(s3Config())}`
    : new URL(process.env.CONVEX_CLOUD_URL ?? "https://convex.cloud").origin;
}

const bucketed = (config: S3Config, ref: StoredRef): S3Config =>
  ref.bucket ? { ...config, bucket: ref.bucket } : config;
