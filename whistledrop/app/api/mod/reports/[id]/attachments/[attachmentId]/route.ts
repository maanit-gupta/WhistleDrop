import { prisma } from "@/lib/db";
import { withModerator } from "@/lib/guards";
import { createSignedDownloadUrl } from "@/lib/storage";
import { idSchema } from "@/lib/validation";
import { apiSuccess, internalError, notFound } from "@/lib/apiResponse";

/** Signed download links expire quickly; the bucket itself has no public URLs. */
const DOWNLOAD_URL_TTL_SECONDS = 60;

export const GET = withModerator(
  async (_request: Request, ctx: RouteContext<"/api/mod/reports/[id]/attachments/[attachmentId]">) => {
    const { id, attachmentId } = await ctx.params;
    if (!idSchema.safeParse(id).success || !idSchema.safeParse(attachmentId).success) {
      return notFound("Attachment not found");
    }

    try {
      // Scoped to the report in the URL, so an attachment id alone isn't enough.
      const attachment = await prisma.attachment.findFirst({
        where: { id: attachmentId, reportId: id },
        select: { storagePath: true, mimeType: true, sizeBytes: true },
      });
      if (!attachment) return notFound("Attachment not found");

      const url = await createSignedDownloadUrl(attachment.storagePath, DOWNLOAD_URL_TTL_SECONDS);
      return apiSuccess({
        url,
        expiresIn: DOWNLOAD_URL_TTL_SECONDS,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      });
    } catch (err) {
      console.error("GET attachment download URL failed:", err);
      return internalError();
    }
  },
);
