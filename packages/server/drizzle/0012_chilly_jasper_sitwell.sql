CREATE TYPE "public"."sale_line_type" AS ENUM('sale', 'gift');--> statement-breakpoint
ALTER TYPE "public"."card_status" ADD VALUE 'gifted' BEFORE 'error';--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "sale_line_type" "sale_line_type" DEFAULT 'sale' NOT NULL;