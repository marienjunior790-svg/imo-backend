-- Core Intelligence CI-5 : opt-in agrégats marché anonymes
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "contributeMarketStats" BOOLEAN NOT NULL DEFAULT false;
