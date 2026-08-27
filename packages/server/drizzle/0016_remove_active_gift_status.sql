-- Keep `card_status.gift`: price_history.previous_status/new_status can contain
-- that historical label. This migration changes only live inventory rows.
UPDATE "cards"
SET
  "status" = CASE
    WHEN "market_price" IS NOT NULL
      AND "market_price" > 0
      AND "market_price" NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      THEN 'matched'::"card_status"
    ELSE 'needs_attention'::"card_status"
  END,
  "listing_price" = CASE
    WHEN "market_price" IS NOT NULL
      AND "market_price" > 0
      AND "market_price" NOT IN (
        'NaN'::numeric,
        'Infinity'::numeric,
        '-Infinity'::numeric
      )
      THEN GREATEST(
        ROUND("market_price" * 0.98, 2),
        COALESCE("floor_price_cents"::numeric / 100, 0)
      )
    ELSE NULL
  END,
  "attention_reason" = NULL,
  "updated_at" = NOW()
WHERE "status" = 'gift'::"card_status";
--> statement-breakpoint
-- Below-threshold pricing no longer makes a listing ineligible. These rows keep
-- their persisted listing price and return to their listed state.
UPDATE "cards"
SET
  "status" = 'listed'::"card_status",
  "attention_reason" = NULL,
  "updated_at" = NOW()
WHERE "status" = 'needs_attention'::"card_status"
  AND "attention_reason" = 'listed_below_threshold'::"card_attention_reason";
