import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/**
 * Size and type of a file in Convex storage, read from the system table, or null
 * when the id is not a stored file. The record endpoints use it the way S3 mode
 * uses a HEAD: size and type come from storage, not from the client.
 */
export const metadata = internalQuery({
  args: { storageId: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.system.normalizeId("_storage", args.storageId);
    const file = id ? await ctx.db.system.get(id) : null;
    return file ? { storageId: file._id, size: file.size, contentType: file.contentType ?? "application/octet-stream" } : null;
  },
});
