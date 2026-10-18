-- CreateEnum
CREATE TYPE "CampaignTheme" AS ENUM ('MEGA_SALE', 'PAYDAY', 'EID', 'BOISHAKH', 'PUJA', 'WINTER');

-- CreateEnum
CREATE TYPE "GameStyle" AS ENUM ('MYSTERY_BOX', 'SPIN_WHEEL');

-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('VOUCHER', 'COINS', 'NONE');

-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'CAMPAIGN_REWARD';

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "theme" "CampaignTheme" NOT NULL DEFAULT 'MEGA_SALE',
    "heroImageUrl" TEXT,
    "ctaLabel" TEXT NOT NULL DEFAULT 'এখনই কিনুন',
    "ctaHref" TEXT NOT NULL DEFAULT '/flash-sale',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "teaserHours" INTEGER NOT NULL DEFAULT 24,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "confetti" BOOLEAN NOT NULL DEFAULT true,
    "gameEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gameStyle" "GameStyle" NOT NULL DEFAULT 'MYSTERY_BOX',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "voucherId" TEXT,
    "flashSaleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTickerItem" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "href" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignTickerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignReward" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "voucherId" TEXT,
    "coins" INTEGER,
    "label" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "stock" INTEGER,
    "givenCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPlay" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playDay" TEXT NOT NULL,
    "rewardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_isActive_startsAt_endsAt_idx" ON "Campaign"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_campaignId_variantId_key" ON "CampaignProduct"("campaignId", "variantId");

-- CreateIndex
CREATE INDEX "CampaignTickerItem_campaignId_sortOrder_idx" ON "CampaignTickerItem"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampaignReward_campaignId_sortOrder_idx" ON "CampaignReward"("campaignId", "sortOrder");

-- CreateIndex
CREATE INDEX "CampaignPlay_campaignId_playDay_idx" ON "CampaignPlay"("campaignId", "playDay");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPlay_campaignId_userId_playDay_key" ON "CampaignPlay"("campaignId", "userId", "playDay");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_flashSaleId_fkey" FOREIGN KEY ("flashSaleId") REFERENCES "FlashSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTickerItem" ADD CONSTRAINT "CampaignTickerItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReward" ADD CONSTRAINT "CampaignReward_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignReward" ADD CONSTRAINT "CampaignReward_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlay" ADD CONSTRAINT "CampaignPlay_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "CampaignReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

