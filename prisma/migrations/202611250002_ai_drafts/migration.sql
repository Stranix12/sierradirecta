CREATE TABLE "AiDraft" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "User"("id"),
 "kind" TEXT NOT NULL,
 "data" JSONB NOT NULL,
 "expires" TIMESTAMP(3) NOT NULL,
 "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "result" JSONB,
 "confirmHash" TEXT
);
CREATE INDEX "AiDraft_userId_created_idx" ON "AiDraft"("userId", "created");
