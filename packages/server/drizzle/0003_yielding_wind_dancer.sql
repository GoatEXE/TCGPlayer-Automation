CREATE TYPE "public"."price_check_source" AS ENUM('manual', 'scheduled');--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"source" "price_check_source" DEFAULT 'manual' NOT NULL,
	"previous_market_price" numeric(10, 2),
	"new_market_price" numeric(10, 2),
	"previous_listing_price" numeric(10, 2),
	"new_listing_price" numeric(10, 2),
	"previous_status" "card_status",
	"new_status" "card_status",
	"drift_percent" numeric(8, 2),
	"notification_sent" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;