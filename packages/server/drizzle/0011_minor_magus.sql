CREATE TYPE "public"."card_attention_reason" AS ENUM('listed_price_drift', 'listed_missing_price', 'listed_below_threshold');--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "attention_reason" "card_attention_reason";--> statement-breakpoint
UPDATE "cards" AS c
SET "attention_reason" = CASE
	WHEN latest."new_market_price" IS NULL THEN 'listed_missing_price'::"card_attention_reason"
	WHEN latest."adjusted_to_price" IS NOT NULL THEN 'listed_price_drift'::"card_attention_reason"
	ELSE 'listed_below_threshold'::"card_attention_reason"
END
FROM (
	SELECT DISTINCT ON ("card_id")
		"card_id",
		"new_market_price",
		"adjusted_to_price",
		"checked_at",
		"id"
	FROM "price_history"
	WHERE "previous_status" = 'listed' AND "new_status" = 'needs_attention'
	ORDER BY "card_id", "checked_at" DESC, "id" DESC
) AS latest
WHERE c."id" = latest."card_id"
	AND c."status" = 'needs_attention'
	AND c."attention_reason" IS NULL;