CREATE TYPE "public"."sale_update_source" AS ENUM('manual', 'api_sync');--> statement-breakpoint
CREATE TABLE "sale_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"previous_status" "order_status",
	"new_status" "order_status" NOT NULL,
	"source" "sale_update_source" DEFAULT 'manual' NOT NULL,
	"note" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_status_history" ADD CONSTRAINT "sale_status_history_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;