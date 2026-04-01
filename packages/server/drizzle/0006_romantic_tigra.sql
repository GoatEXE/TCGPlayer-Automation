CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."card_status" ADD VALUE 'sold';--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer,
	"tcgplayer_order_id" text,
	"quantity_sold" integer NOT NULL,
	"sale_price_cents" integer NOT NULL,
	"buyer_name" text,
	"order_status" "order_status" DEFAULT 'pending' NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;