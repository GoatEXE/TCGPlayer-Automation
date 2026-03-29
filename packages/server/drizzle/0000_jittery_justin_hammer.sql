CREATE TYPE "public"."card_status" AS ENUM('pending', 'matched', 'listed', 'needs_attention', 'gift', 'error');--> statement-breakpoint
CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tcgplayer_id" integer,
	"product_line" text DEFAULT 'Riftbound' NOT NULL,
	"set_name" text,
	"product_name" text NOT NULL,
	"title" text,
	"number" text,
	"rarity" text,
	"condition" text DEFAULT 'Near Mint' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" "card_status" DEFAULT 'pending' NOT NULL,
	"market_price" numeric(10, 2),
	"listing_price" numeric(10, 2),
	"photo_url" text,
	"notes" text,
	"imported_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
