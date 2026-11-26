CREATE TABLE "AttachmentContent" (
 "attachmentId" TEXT NOT NULL PRIMARY KEY,
 "bytes" BYTEA NOT NULL,
 CONSTRAINT "AttachmentContent_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
