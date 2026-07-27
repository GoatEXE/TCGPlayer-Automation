CREATE TABLE "catalog_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalog_set_id" integer NOT NULL,
	"tcg_product_id" integer,
	"product_name" text NOT NULL,
	"title" text,
	"collector_number" text,
	"normalized_number" text,
	"rarity" text,
	"photo_url" text,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "catalog_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tcgtracking_set_id" integer,
	"product_line" text DEFAULT 'Riftbound' NOT NULL,
	"set_code" text NOT NULL,
	"name" text NOT NULL,
	"is_supplemental" boolean DEFAULT false NOT NULL,
	"published_on" text,
	"products_modified" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"catalog_card_id" integer NOT NULL,
	"condition" text DEFAULT 'Near Mint' NOT NULL,
	"finish" text DEFAULT 'Normal' NOT NULL,
	"language" text DEFAULT 'EN' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'scanner' NOT NULL,
	"notes" text,
	"first_seen_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "catalog_cards" ADD CONSTRAINT "catalog_cards_catalog_set_id_catalog_sets_id_fk" FOREIGN KEY ("catalog_set_id") REFERENCES "public"."catalog_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_catalog_card_id_catalog_cards_id_fk" FOREIGN KEY ("catalog_card_id") REFERENCES "public"."catalog_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_cards_set_number_idx" ON "catalog_cards" USING btree ("catalog_set_id","normalized_number");--> statement-breakpoint
CREATE INDEX "catalog_cards_product_name_idx" ON "catalog_cards" USING btree ("product_name");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_cards_tcg_product_id_unique" ON "catalog_cards" USING btree ("tcg_product_id");--> statement-breakpoint
CREATE INDEX "catalog_sets_set_code_idx" ON "catalog_sets" USING btree ("set_code");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sets_product_line_set_code_unique" ON "catalog_sets" USING btree ("product_line","set_code");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_sets_tcgtracking_set_id_unique" ON "catalog_sets" USING btree ("tcgtracking_set_id");--> statement-breakpoint
CREATE INDEX "collection_items_collection_id_idx" ON "collection_items" USING btree ("collection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_items_merge_key_unique" ON "collection_items" USING btree ("collection_id","catalog_card_id","condition","finish","language");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_name_unique" ON "collections" USING btree ("name");