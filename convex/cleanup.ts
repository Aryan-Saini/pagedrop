import { internalMutation } from "./_generated/server";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Convex storage mode's stand-in for the S3 lifecycle rules: deletes the bytes
 * of assets and upload links that expired in the last three days. Runs daily
 * from `crons.ts`, so the window overlaps and a missed run is caught by the next.
 * Rows stay (the links already answer 410); only `storageId` is cleared. S3 rows
 * have no `storageId` and are left to the bucket.
 */
export const expired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", now - 3 * DAY).lt("expiresAt", now))
      .collect();
    for (const asset of assets) {
      if (!asset.storageId) continue;
      await ctx.storage.delete(asset.storageId);
      await ctx.db.patch(asset._id, { storageId: undefined });
    }

    const requests = await ctx.db
      .query("uploadRequests")
      .withIndex("by_expiresAt", (q) => q.gt("expiresAt", now - 3 * DAY).lt("expiresAt", now))
      .collect();
    for (const request of requests) {
      const files = await ctx.db
        .query("uploadFiles")
        .withIndex("by_slug", (q) => q.eq("slug", request.slug))
        .collect();
      for (const file of files) {
        if (!file.storageId) continue;
        await ctx.storage.delete(file.storageId);
        await ctx.db.patch(file._id, { storageId: undefined });
      }
    }
    return null;
  },
});
