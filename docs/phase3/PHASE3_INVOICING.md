# Phase 3.3 — Invoice / Packing Slip Generation

Date: 2026-04-01

## Summary
Implements printable invoice and packing slip generation for completed sales. This phase delivers browser-based print templates that include all required transaction details for customer records and shipment inclusion.

## Scope
This phase covers:
- Printable invoice template (HTML with print CSS)
- Printable packing slip template (simplified variant)
- Print button workflow from sales dashboard
- Required field verification and display
- PDF generation endpoint (optional/deferred)

## Status
📋 TODO — No implementation yet, local-first work (no external API dependencies)

## Dependencies
### Required (unblocked)
- Phase 3.1 (Sales Dashboard) ✅ COMPLETE — sale records with buyer info exist
- Phase 3.2 (Shipment Tracking) ✅ LOCAL COMPLETE — shipment records available

### Blocked/Deferred
- **PDF generation library integration** — deferred; browser print is sufficient for MVP
- **TCGPlayer API sync** — N/A for invoicing; all required data is local

## Architecture

### Data Flow
```
Sale record (with buyer info)
  ↓
GET /api/sales/:id/invoice
  ↓
Render invoice template with:
  - Seller info (from env/config)
  - Buyer info (from sale.buyerName + order metadata)
  - Card details (from listing → card)
  - Pricing (sale.salePriceCents)
  - Order metadata (sale.tcgplayerOrderId, soldAt)
  ↓
Return HTML with print-optimized CSS
  ↓
Frontend opens in new window/tab
  ↓
User triggers browser print (Ctrl+P / Cmd+P)
```

### Template Variants
Two templates share common structure but differ in included fields:

#### Invoice Template
**Purpose:** Customer receipt for tax/accounting records

**Required fields:**
- **Seller information**
  - Business/seller name
  - Address (if registered business)
  - Contact email
  - TCGPlayer seller ID (optional)
- **Buyer information**
  - Name (from `sale.buyerName`)
  - Shipping address (from order metadata if available)
- **Order information**
  - Order ID (`sale.tcgplayerOrderId`)
  - Order date (`sale.soldAt`)
  - Payment method (TCGPlayer marketplace)
- **Line items**
  - Card name (`card.name`)
  - Set name (`card.setName`)
  - Condition (`card.condition`)
  - Quantity sold (`sale.quantitySold`)
  - Unit price (calculated: `sale.salePriceCents / sale.quantitySold`)
  - Line total (`sale.salePriceCents`)
- **Pricing summary**
  - Subtotal (sum of line items)
  - Shipping (if known from order metadata)
  - Tax (if applicable, from order metadata)
  - **Total** (`sale.salePriceCents` or calculated total)
- **Footer**
  - "Thank you for your purchase"
  - Return policy reference (if applicable)
  - "Questions? Contact [seller email]"

#### Packing Slip Template
**Purpose:** Shipment verification, included in package

**Required fields:**
- **Seller name** (brief, no full address needed)
- **Buyer name and shipping address**
- **Order ID** (`sale.tcgplayerOrderId`)
- **Order date** (`sale.soldAt`)
- **Line items** (card name, set, condition, quantity only — **no prices**)
- **Shipment tracking** (if available from `shipment` table)
- **Footer**
  - "Thank you for your order!"
  - "Please leave feedback on TCGPlayer"
  - QR code linking to seller profile (optional, Phase 4 enhancement)

### Print CSS Strategy
Templates use `@media print` rules to:
- Hide navigation/chrome when printing
- Force single-column layout
- Ensure page breaks between multiple items (if batch printing)
- Use black text on white background (ink-efficient)
- Set appropriate margins for standard 8.5x11" paper

Example:
```css
@media print {
  body { margin: 0; padding: 1in; }
  .no-print { display: none; }
  .page-break { page-break-after: always; }
  * { color: black !important; background: white !important; }
}
```

## API Endpoints

### Invoice Endpoint
```
GET /api/sales/:id/invoice
```

**Response:**
- Content-Type: `text/html`
- Renders full HTML invoice template with embedded CSS
- Includes `<title>Invoice - Order #{tcgplayerOrderId}</title>` for browser tab/print preview

**Error cases:**
- Sale not found → 404
- Sale missing buyer info → 500 (should not happen if sale workflow enforces this)

### Packing Slip Endpoint
```
GET /api/sales/:id/packing-slip
```

**Response:**
- Content-Type: `text/html`
- Renders packing slip template with embedded CSS
- Includes `<title>Packing Slip - Order #{tcgplayerOrderId}</title>`

**Error cases:**
- Sale not found → 404

### Optional: PDF Generation Endpoint (Deferred)
```
GET /api/sales/:id/invoice.pdf
GET /api/sales/:id/packing-slip.pdf
```

**Implementation:**
- Use library like `puppeteer` or `@pdfme/generator`
- Render HTML template to PDF buffer
- Return as `application/pdf` with `Content-Disposition: attachment`

**Deferral rationale:** Browser print-to-PDF is sufficient for MVP. PDF generation adds dependency weight (headless Chrome for puppeteer) and complexity. Re-evaluate if user requests programmatic PDF storage or automated email attachment.

## Frontend Changes

### Sales Dashboard Integration
Add print actions to each sale row:

**Option A: Dropdown menu (preferred for multiple actions)**
```tsx
<DropdownMenu>
  <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => printInvoice(sale.id)}>
      Print Invoice
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => printPackingSlip(sale.id)}>
      Print Packing Slip
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Option B: Icon buttons (faster access, more visual space)**
```tsx
<div className="flex gap-2">
  <Button size="sm" variant="ghost" onClick={() => printInvoice(sale.id)}>
    <FileText className="h-4 w-4" />
  </Button>
  <Button size="sm" variant="ghost" onClick={() => printPackingSlip(sale.id)}>
    <Package className="h-4 w-4" />
  </Button>
</div>
```

### Print Workflow
```typescript
function printInvoice(saleId: string) {
  const url = `/api/sales/${saleId}/invoice`;
  const printWindow = window.open(url, '_blank');
  
  // Optional: auto-trigger print dialog after load
  printWindow?.addEventListener('load', () => {
    printWindow.print();
  });
}

function printPackingSlip(saleId: string) {
  const url = `/api/sales/${saleId}/packing-slip`;
  const printWindow = window.open(url, '_blank');
  
  printWindow?.addEventListener('load', () => {
    printWindow.print();
  });
}
```

**Alternative:** Keep window open for review before printing (remove auto-trigger, let user press Ctrl+P).

## Database Schema

### Seller Configuration (New Table)
Store seller information for invoice generation:

```typescript
export const sellerConfig = pgTable('seller_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessName: text('business_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  address: text('address'), // Optional for registered businesses
  phone: text('phone'),
  tcgplayerSellerId: text('tcgplayer_seller_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**Note:** Single-row table (enforced by application logic). If multi-user support is added later, add `userId` foreign key.

### Sales Table Enhancement (Already Exists)
Verify `sales` table includes required fields:
- `buyerName` — ✅ exists (varchar, nullable)
- `tcgplayerOrderId` — ✅ exists (varchar, not null)
- `soldAt` — ✅ exists (timestamp, not null)
- `salePriceCents` — ✅ exists (integer, not null)
- `quantitySold` — ✅ exists (integer, not null)

**Additional field for order metadata (optional):**
```typescript
orderMetadata: jsonb('order_metadata'), // { shippingAddress, tax, shippingCost, etc. }
```

If order metadata is not available from TCGPlayer API sync, omit shipping address from invoice. This is acceptable for MVP since TCGPlayer handles payment processing and the invoice is primarily for seller records.

## Implementation Plan

### Work Packages (Test-First)

#### Package 1: Seller Configuration
**Tests:**
- `POST /api/seller-config` creates initial configuration
- `GET /api/seller-config` returns current configuration
- `PUT /api/seller-config` updates existing configuration
- Validation: `businessName` and `contactEmail` are required

**Implementation:**
- Create `seller_config` table migration
- Create `/api/seller-config` CRUD endpoints
- Create settings page in dashboard for seller info entry

**Acceptance:**
- Seller can enter business name, email, optional address
- Configuration persists across restarts
- Validation errors display in UI

---

#### Package 2: Invoice Template + Endpoint
**Tests:**
- `GET /api/sales/:id/invoice` returns HTML with correct Content-Type
- Invoice includes all required fields from sale + seller config
- Invoice calculates subtotal/total correctly
- Print CSS hides non-print elements
- Missing seller config returns 500 with helpful error

**Implementation:**
- Create invoice HTML template (embedded in endpoint or separate `.html` file with templating)
- Implement `/api/sales/:id/invoice` endpoint
- Fetch sale + listing + card + seller config data
- Render template with data interpolation
- Add print CSS rules

**Acceptance:**
- Opening `/api/sales/:id/invoice` in browser displays formatted invoice
- Ctrl+P shows print preview with proper layout
- All required fields populate correctly
- No seller info → clear error message in UI

---

#### Package 3: Packing Slip Template + Endpoint
**Tests:**
- `GET /api/sales/:id/packing-slip` returns HTML
- Packing slip includes order info and line items WITHOUT prices
- Shipment tracking displays if available
- Print CSS optimized for simple layout

**Implementation:**
- Create packing slip HTML template (similar to invoice, simplified)
- Implement `/api/sales/:id/packing-slip` endpoint
- Join sale + shipment data if tracking exists
- Render template without pricing fields

**Acceptance:**
- Packing slip displays order verification info
- No pricing visible (prevents price-based returns)
- Tracking number included if shipment exists

---

#### Package 4: Dashboard Print Integration
**Tests:**
- Print invoice button opens new window with correct URL
- Print packing slip button opens new window with correct URL
- Auto-print triggers after load (or verify manual trigger works)

**Implementation:**
- Add print action buttons to sales table rows
- Implement `printInvoice()` and `printPackingSlip()` helpers
- Optional: add loading state while window opens

**Acceptance:**
- User can click "Print Invoice" from sale row
- New tab opens with invoice, ready to print
- Same flow works for packing slip
- Print dialog appears (if auto-trigger enabled)

---

#### Package 5: Batch Printing (Optional Enhancement)
**Tests:**
- Select multiple sales → "Print All Packing Slips" generates single HTML with page breaks
- Each slip on separate page in print preview

**Implementation:**
- Add multi-select to sales table
- Create `POST /api/sales/batch-packing-slips` endpoint accepting array of sale IDs
- Render templates with `page-break-after: always` between each slip

**Acceptance:**
- User can select 5 orders and print all packing slips in one job
- Each slip prints on separate page
- Browser print dialog shows correct page count

**Deferral:** Deferred to Phase 4 if needed; single-sale printing is sufficient for MVP.

## Testing Strategy

### Unit Tests
- Template rendering with mock data
- Seller config CRUD operations
- Data fetching and joining (sale + listing + card + shipment)

### Integration Tests
- Full endpoint flow: request → DB query → template render → HTML response
- Error handling: missing sale, missing seller config

### Manual Validation
- Open invoice in browser, verify all fields populate
- Trigger browser print, verify layout in print preview
- Print to PDF, verify output quality
- Test with missing optional fields (address, shipment tracking)
- Test with long card names, multiple line items

### Accessibility
- Print templates use semantic HTML (`<table>`, `<th>`, `<td>` for line items)
- Sufficient contrast for readability
- Font size >= 10pt for print legibility

## Configuration

### Environment Variables
No new env vars required. Seller info stored in database via settings UI.

### Seller Config Defaults
On first run, if no seller config exists:
- Redirect admin to `/settings/seller` before allowing invoice generation
- OR: use placeholder values with warning banner: "Configure seller info in Settings"

Recommended: **block invoice generation** until seller config exists (return 500 with clear message).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Browser print inconsistencies** | Invoice layout breaks in some browsers | Test in Chrome, Firefox, Safari; use standard CSS print rules; avoid complex flexbox/grid in print styles |
| **Missing buyer address** | Invoice incomplete if TCGPlayer order metadata unavailable | Make shipping address optional; note "Shipping handled by TCGPlayer marketplace" if missing |
| **Long card names overflow** | Layout breaks with verbose card titles | Use `word-wrap: break-word` and test with longest known card names |
| **Printer paper size variance** | Layout optimized for US Letter may not fit A4 | Use flexible margins and test with A4 simulation; consider separate A4 template if international users |

## Future Enhancements (Phase 4+)

1. **PDF generation endpoint** — if user requests programmatic storage or email automation
2. **Batch printing** — select multiple sales, print all packing slips in one job
3. **QR codes** — link to TCGPlayer seller profile or order tracking
4. **Custom branding** — logo upload, custom footer text
5. **Multi-language support** — if selling internationally
6. **Email integration** — auto-send invoice on sale confirmation

## Success Criteria

Phase 3.3 is complete when:
- [ ] Seller configuration table and CRUD endpoints implemented
- [ ] Settings page for seller info entry exists and validates required fields
- [ ] Invoice template renders with all required fields from sale + seller config
- [ ] Packing slip template renders with order info, line items (no prices), and tracking
- [ ] Print buttons integrated into sales dashboard
- [ ] Print workflow opens new window and displays correct template
- [ ] Print CSS produces clean output in browser print preview
- [ ] Unit tests pass for template rendering and endpoint logic
- [ ] Integration tests pass for full endpoint flow
- [ ] Manual validation confirms readable print output
- [ ] Error handling for missing seller config or sale records

## References
- Phase 3.1 Sales Dashboard: `packages/web/src/pages/SalesPage.tsx`
- Phase 3.2 Shipment tracking: `packages/server/src/db/schema.ts` (`shipment` table)
- Sale model: `packages/server/src/db/schema.ts` (`sale` table)
- Print CSS best practices: [MDN @media print](https://developer.mozilla.org/en-US/docs/Web/CSS/@media)
