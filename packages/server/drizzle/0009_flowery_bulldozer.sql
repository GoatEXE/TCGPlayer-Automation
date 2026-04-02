CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"success" boolean NOT NULL,
	"error" text,
	"sale_id" integer,
	"card_id" integer,
	"tcgplayer_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;