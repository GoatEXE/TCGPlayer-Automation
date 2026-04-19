CREATE TYPE "public"."auto_expense_kind" AS ENUM('shipping_order', 'supplies_order', 'transaction_flat_order', 'marketplace_percent_line', 'transaction_percent_line');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('supplies', 'shipping', 'tcgplayer_fees', 'inventory_acquisition', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'sale_auto_estimate');--> statement-breakpoint
CREATE TABLE "expense_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"auto_record_sale_expenses" boolean DEFAULT false NOT NULL,
	"auto_record_shipping" boolean DEFAULT true NOT NULL,
	"shipping_cost_cents" integer DEFAULT 99 NOT NULL,
	"auto_record_supplies" boolean DEFAULT true NOT NULL,
	"supplies_cost_cents" integer DEFAULT 25 NOT NULL,
	"auto_record_tcgplayer_fees" boolean DEFAULT true NOT NULL,
	"marketplace_fee_bps" integer DEFAULT 1075 NOT NULL,
	"transaction_fee_bps" integer DEFAULT 250 NOT NULL,
	"transaction_flat_fee_cents" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"amount_cents" integer NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text,
	"description" text,
	"quantity" integer,
	"unit" text,
	"unit_cost_cents" integer,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"is_estimate" boolean DEFAULT false NOT NULL,
	"auto_kind" "auto_expense_kind",
	"sale_id" integer,
	"tcgplayer_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_occurred_at_idx" ON "expenses" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_sale_id_idx" ON "expenses" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "expenses_tcgplayer_order_id_idx" ON "expenses" USING btree ("tcgplayer_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_order_level_auto_estimate_idx" ON "expenses" USING btree ("tcgplayer_order_id","auto_kind") WHERE "expenses"."source" = 'sale_auto_estimate' and "expenses"."tcgplayer_order_id" is not null and "expenses"."auto_kind" in ('shipping_order', 'supplies_order', 'transaction_flat_order');