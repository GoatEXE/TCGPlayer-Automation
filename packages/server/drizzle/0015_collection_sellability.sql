ALTER TABLE "catalog_cards" ADD COLUMN "card_kind" text;
--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "purpose" text DEFAULT 'owned' NOT NULL;
--> statement-breakpoint
CREATE INDEX "collections_purpose_idx" ON "collections" USING btree ("purpose");
