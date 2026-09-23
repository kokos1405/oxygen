-- CreateTable
CREATE TABLE "ExternalIdMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "oxygenId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdMap_shop_entityType_shopifyId_key" ON "ExternalIdMap"("shop", "entityType", "shopifyId");

-- CreateIndex
CREATE INDEX "ExternalIdMap_shop_entityType_oxygenId_idx" ON "ExternalIdMap"("shop", "entityType", "oxygenId");

-- CreateTable
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopifyId" TEXT,
    "webhookId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncEvent_webhookId_key" ON "SyncEvent"("webhookId");

-- CreateIndex
CREATE INDEX "SyncEvent_shop_createdAt_idx" ON "SyncEvent"("shop", "createdAt");
