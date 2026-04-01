# Phase 3.2 — Shipment Tracking (Local-First)

Date: 2026-04-01
Status: LOCAL COMPLETE — WP-S1 through WP-S8 implemented; TCGPlayer API push-back remains blocked on seller API credentials
Depends on: Phase 3.1 complete (sales + order-status infrastructure)

---

## 1. Scope

### Buildable now

| Capability | Detail |
|---|---|
| `shipments` DB table | Carrier, tracking number, shipped/delivered timestamps, notes per sale |
| `POST /api/sales/:id/ship` | Record a shipment against a confirmed/shipped sale; auto-advance order status to `shipped` |
| `PATCH /api/shipments/:id` | Update tracking number, carrier, mark delivered |
| `GET /api/sales/:id/shipment` | Fetch shipment for a sale |
| Shipment entry form (web) | Modal from Sales History table — carrier dropdown, tracking number, shipped date |
| Shipment timeline in dashboard | Shipment details rendered alongside existing `SaleStatusTimeline` |

### Blocked (requires TCGPlayer API)

| Capability | Blocker |
|---|---|
| Push tracking info to TCGPlayer | Seller API credentials |
| Auto-update delivery status from carrier API | Out of scope (no carrier API integration planned) |

---

## 2. Data Model

### New table: `shipments`

Adapted from `PROJECT_PLAN.md` §3 Shipment entity, adjusted to match actual codebase conventions (serial PK, not UUID; FK to `sales`).

```
shipments
├── id              serial PK
├── saleId          integer FK → sales.id (CASCADE on delete), UNIQUE
├── carrier         text (nullable — e.g. 'USPS', 'UPS', 'FedEx', 'PWE')
├── trackingNumber  text (nullable — PWE/plain white envelope has none)
├── shippedAt       timestamp with tz (nullable — set when actually shipped)
├── deliveredAt     timestamp with tz (nullable — set when delivery confirmed)
├── notes           text (nullable — e.g. 'Plain white envelope, no tracking')
├── createdAt       timestamp with tz DEFAULT now()
├── updatedAt       timestamp with tz DEFAULT now()
```

**Design notes:**
- **1:1 with sales** — `saleId` is UNIQUE. One shipment per sale line-item. If multiple sale rows share a `tcgplayerOrderId` (multi-card order), they each get a shipment row but typically with the same carrier/tracking (entered once via the UI, which fills all sales in that order).
- **`labelData` (jsonb) from PROJECT_PLAN.md is deferred** — no label generation in this slice. The column can be added when invoice/packing slip work lands in Phase 3.3.
- **No carrier enum** — free text is more flexible. The UI provides a dropdown with common values but allows custom entry.
- **`shippedAt` nullable** — a shipment record can be created in advance (e.g., "will ship tomorrow") then updated with the actual ship date.
- **Future API compat:** When TCGPlayer API access arrives, a `pushTracking()` function reads `carrier` + `trackingNumber` from this table and POSTs to TCGPlayer. No schema changes needed.

---

## 3. Work Packages (strict order)

### WP-S1: Schema + migration

**Files:**
- `packages/server/src/db/schema/shipments.ts` — **new file**: `shipments` table definition + types
- `packages/server/src/db/schema/index.ts` — add re-export
- Run `drizzle-kit generate` → new migration in `packages/server/drizzle/`

**Acceptance criteria:**
- ✅ Migration SQL creates `shipments` table with unique constraint on `sale_id`
- ✅ `pnpm --filter server test` passes (no regressions)
- ✅ `Shipment` / `NewShipment` types exported
- ✅ Idempotent `createShipmentOnConfirm()` function created and wired into sales routes
- ✅ Shipment auto-created when sale transitions to `confirmed` (POST, PATCH /:id, PATCH /batch-status)
- ✅ Tests cover creation, duplicate prevention, and non-confirmed transitions

**Completed:** 2026-04-01
**Risk:** Low. Additive table only.

---

### WP-S2: Shipment routes (server)

**Completed:** 2026-04-01

**Files:**
- `packages/server/src/routes/shipments.ts` — **new file**:
  - `POST /api/sales/:id/ship` — create shipment for a sale
    - Validates sale exists and is in `confirmed` or `shipped` status
    - Rejects if shipment already exists for this sale (409 Conflict)
    - Body: `{ carrier?, trackingNumber?, shippedAt?, notes? }`
    - If sale is `confirmed`, auto-transitions to `shipped` (writes `sale_status_history` row)
    - Returns created shipment
  - `GET /api/sales/:id/shipment` — get shipment for a sale
    - Returns shipment or 404
  - `PATCH /api/shipments/:id` — update shipment
    - Updatable: `carrier`, `trackingNumber`, `shippedAt`, `deliveredAt`, `notes`
    - If `deliveredAt` is set and sale is `shipped`, auto-transitions sale to `delivered` (writes `sale_status_history`)
    - Returns updated shipment
- `packages/server/src/routes/index.ts` — register shipment routes

**Acceptance criteria:**
- Creating a shipment on a `confirmed` sale moves it to `shipped` + writes audit trail
- Setting `deliveredAt` on a `shipped` sale moves it to `delivered` + writes audit trail
- Duplicate shipment creation returns 409
- Invalid sale status returns 400
- Non-existent sale returns 404

**Risk:** Medium. Auto-advancing order status on ship/deliver is the key logic. Must reuse `isValidTransition` from `lib/sales/status-machine.ts` and insert `sale_status_history` rows with correct `source: 'manual'`.

---

### WP-S3: Shipment route tests (server)

**Completed:** 2026-04-01

**Files:**
- `packages/server/src/routes/__tests__/shipments.test.ts` — **new file**

**Test cases:**
1. `POST /api/sales/:id/ship` — creates shipment, returns 201
2. `POST /api/sales/:id/ship` — auto-advances `confirmed` → `shipped`, writes status history
3. `POST /api/sales/:id/ship` — on already-`shipped` sale, creates shipment without status change
4. `POST /api/sales/:id/ship` — rejects on `pending` sale → 400
5. `POST /api/sales/:id/ship` — rejects on `delivered`/`cancelled` sale → 400
6. `POST /api/sales/:id/ship` — rejects duplicate shipment → 409
7. `POST /api/sales/:id/ship` — sale not found → 404
8. `GET /api/sales/:id/shipment` — returns shipment
9. `GET /api/sales/:id/shipment` — no shipment → 404
10. `PATCH /api/shipments/:id` — updates carrier + tracking
11. `PATCH /api/shipments/:id` — setting `deliveredAt` auto-advances `shipped` → `delivered`
12. `PATCH /api/shipments/:id` — shipment not found → 404

**Acceptance criteria:** All 12 cases pass. `pnpm --filter server test` green.

> Test-first: write tests before WP-S2 implementation.

---

### WP-S4: API client + types (web)

**Files:**
- `packages/web/src/api/types.ts` — add:
  - `Shipment` interface (`id`, `saleId`, `carrier`, `trackingNumber`, `shippedAt`, `deliveredAt`, `notes`, `createdAt`, `updatedAt`)
  - `CreateShipmentRequest` (`carrier?`, `trackingNumber?`, `shippedAt?`, `notes?`)
  - `UpdateShipmentRequest` (`carrier?`, `trackingNumber?`, `shippedAt?`, `deliveredAt?`, `notes?`)
- `packages/web/src/api/client.ts` — add methods:
  - `createShipment(saleId, data): Promise<Shipment>`
  - `getShipment(saleId): Promise<Shipment>`
  - `updateShipment(shipmentId, data): Promise<Shipment>`

**Acceptance criteria:** `pnpm --filter web build` passes.

---

### WP-S5: ShipmentFormModal component (web)

**Files:**
- `packages/web/src/components/ShipmentFormModal.tsx` — **new file**
  - Modal triggered from Sales History table action column on `confirmed`/`shipped` sales
  - Fields: carrier (dropdown: USPS, UPS, FedEx, PWE, Other + free text), tracking number, shipped date (defaults to now), notes
  - For sales that already have a shipment, loads existing data for editing
  - Submit calls `api.createShipment()` or `api.updateShipment()` as appropriate
  - On success: refreshes sales list (status may have changed)

**Acceptance criteria:**
- Pre-fills existing shipment data in edit mode
- Carrier dropdown with common values + custom entry
- Tracking number is optional (PWE shipments have none)
- Submit creates or updates correctly

---

### WP-S6: Shipment info in SalesTable (web)

**Files:**
- `packages/web/src/components/SalesTable.tsx` — modify:
  - Add "Tracking" column showing carrier + tracking number (or "—" if no shipment)
  - Add "📦 Ship" action button for `confirmed`/`shipped` sales → opens `ShipmentFormModal`
  - For `shipped`/`delivered` rows with tracking, show tracking number as text (or link if carrier is USPS/UPS/FedEx with known URL pattern)
- `packages/web/src/components/SaleStatusTimeline.tsx` — modify:
  - When a shipment exists for the sale, render shipment details (carrier, tracking, dates) inline in the timeline between the `shipped` and `delivered` entries

**Acceptance criteria:**
- Ship button visible only for `confirmed`/`shipped` sales
- Tracking info displays in table and timeline
- Existing SalesTable behavior preserved

---

### WP-S7: Frontend component tests (web)

**Files:**
- `packages/web/src/components/__tests__/ShipmentFormModal.test.tsx` — **new file**
  1. Renders create mode with empty fields
  2. Renders edit mode with pre-filled data
  3. Submits create with correct payload
  4. Submits update with correct payload
  5. Calls onClose on cancel
- `packages/web/src/components/__tests__/SalesTable.test.tsx` — **add cases**
  6. Ship button renders for confirmed sale
  7. Ship button renders for shipped sale
  8. Ship button hidden for pending/delivered/cancelled sales
  9. Tracking column shows carrier + number when present

**Acceptance criteria:** `pnpm --filter web test` passes.

---

### WP-S8: Wire into App (web)

**Files:**
- `packages/web/src/App.tsx` — add shipment modal state, handler for create/update shipment, pass to SalesTable
- `packages/web/src/App.css` — shipment modal + tracking column styles

**Acceptance criteria:**
- Ship button in SalesTable opens ShipmentFormModal
- After shipment creation, sales list refreshes (shows updated status + tracking)
- After shipment update, data refreshes
- `pnpm --filter web test` + `pnpm --filter web build` pass

---

## 4. Implementation Order

```
WP-S1  Schema + migration              [server, blocking]
  ↓
WP-S2  Shipment routes                 [server]  ←── test-first with WP-S3
WP-S3  Route tests                     [server]
  ↓
WP-S4  API client + types              [web]
  ↓
WP-S5  ShipmentFormModal               [web]  ←── test-first with WP-S7
WP-S6  Shipment info in SalesTable     [web]
WP-S7  Frontend tests                  [web]
  ↓
WP-S8  Wire into App                   [web]
```

**Parallelizable:** WP-S5 + WP-S6 (independent components). WP-S2 + WP-S3 (test-first pair).

---

## 5. Test Summary

### Server (12 test cases)

| Area | Key assertions |
|---|---|
| Create shipment | 201 response, shipment data returned |
| Auto-advance confirmed→shipped | Sale status updated, `sale_status_history` row written |
| Auto-advance shipped→delivered | On `deliveredAt` set |
| Reject invalid states | 400 for pending/delivered/cancelled sales |
| Duplicate prevention | 409 on second shipment for same sale |
| Get/update | Standard CRUD |

### Web (9 test cases)

| Area | Key assertions |
|---|---|
| ShipmentFormModal | Create/edit modes, payload correctness, cancel |
| SalesTable integration | Ship button visibility by status, tracking display |

---

## 6. Blocked Items (deferred to API access)

| Item | Requirement | Deferral approach |
|---|---|---|
| Push tracking to TCGPlayer | `TCGPLAYER_SELLER_API_KEY` + authenticated seller API | Future `pushTrackingToTcgplayer(shipmentId)` function reads from `shipments` table — no schema change needed |
| Auto-detect delivery | Carrier tracking API | Out of scope entirely; manual `deliveredAt` entry suffices |
| `labelData` jsonb column | Label generation (Phase 3.3) | Add column in Phase 3.3 migration when invoice/packing slip work starts |

---

## 7. Checklist Mapping (PROJECT_PLAN.md §6.2)

Current §6.2 checklist after WP-S1/WP-S2/WP-S3 should read:

```
- [x] Create shipment records when orders are confirmed
- [ ] UI to enter tracking number and carrier
- [ ] Push tracking info back to TCGPlayer via their API (update order status)
- [ ] Display shipment status timeline in dashboard
```

Milestone 3.2 status: **in progress** (server shipment model/routes/tests complete; web UI and dashboard timeline remain).
