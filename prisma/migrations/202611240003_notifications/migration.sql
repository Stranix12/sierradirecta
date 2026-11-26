ALTER TABLE "Notification" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "lotId" TEXT,
 ADD COLUMN "category" TEXT NOT NULL DEFAULT 'pedidos',
 ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'media',
 ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Notification_userId_created_idx" ON "Notification"("userId", "created");
UPDATE "Notification" n SET "priority" = 'alta'
FROM "User" u WHERE n."userId"=u.id AND u.role='lider' AND n.message LIKE '%: pendiente';
