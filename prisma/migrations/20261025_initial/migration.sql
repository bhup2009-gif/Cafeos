-- PostgreSQL reference only; not applied or runtime-verified in this environment.
CREATE TABLE "Outlet" ("id" TEXT PRIMARY KEY,"name" TEXT NOT NULL);
CREATE TABLE "Staff" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"name" TEXT NOT NULL,"role" TEXT NOT NULL CHECK ("role" IN ('owner','manager','cashier','barista')),"salt" TEXT NOT NULL,"passwordHash" TEXT NOT NULL);
CREATE INDEX "Staff_outletId_idx" ON "Staff"("outletId");
CREATE TABLE "Session" ("tokenHash" TEXT PRIMARY KEY,"staffId" TEXT NOT NULL REFERENCES "Staff"("id"),"expiresAt" TIMESTAMPTZ NOT NULL);
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"name" TEXT NOT NULL,"category" TEXT NOT NULL,"pricePaise" INTEGER NOT NULL CHECK("pricePaise">0),"taxBps" INTEGER NOT NULL CHECK("taxBps" BETWEEN 0 AND 3000),"available" BOOLEAN NOT NULL DEFAULT TRUE,"station" TEXT NOT NULL,"variants" JSONB NOT NULL,"modifiers" JSONB NOT NULL,"recipe" JSONB NOT NULL);
CREATE INDEX "Product_outletId_idx" ON "Product"("outletId");
CREATE TABLE "Ingredient" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"name" TEXT NOT NULL,"unit" TEXT NOT NULL,"quantity" DECIMAL(18,3) NOT NULL CHECK("quantity">=0),"reorderLevel" DECIMAL(18,3) NOT NULL);
CREATE INDEX "Ingredient_outletId_idx" ON "Ingredient"("outletId");
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"number" INTEGER NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"status" TEXT NOT NULL,"mode" TEXT NOT NULL,"tableNo" INTEGER,"customer" TEXT,"lines" JSONB NOT NULL,"subtotalPaise" INTEGER NOT NULL,"discountPaise" INTEGER NOT NULL,"taxPaise" INTEGER NOT NULL,"totalPaise" INTEGER NOT NULL,"refundPaise" INTEGER NOT NULL DEFAULT 0,"invoice" TEXT UNIQUE,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"paidAt" TIMESTAMPTZ,UNIQUE("outletId","number"));
CREATE INDEX "Order_outletId_paidAt_idx" ON "Order"("outletId","paidAt");
CREATE UNIQUE INDEX "one_open_order_per_table" ON "Order"("outletId","tableNo") WHERE "status"='open' AND "tableNo" IS NOT NULL;
CREATE TABLE "KitchenTicket" ("id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL REFERENCES "Order"("id"),"station" TEXT NOT NULL,"status" TEXT NOT NULL,"lines" JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE "Payment" ("id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL REFERENCES "Order"("id"),"method" TEXT NOT NULL,"amountPaise" INTEGER NOT NULL CHECK("amountPaise">0),"reference" TEXT,"confirmation" TEXT NOT NULL);
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE TABLE "Operation" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"actorId" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"result" JSONB NOT NULL);
CREATE TABLE "AuditEvent" ("id" TEXT PRIMARY KEY,"outletId" TEXT NOT NULL REFERENCES "Outlet"("id"),"actorId" TEXT NOT NULL,"action" TEXT NOT NULL,"detail" TEXT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX "AuditEvent_outletId_createdAt_idx" ON "AuditEvent"("outletId","createdAt");
