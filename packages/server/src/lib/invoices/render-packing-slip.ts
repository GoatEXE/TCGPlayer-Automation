import type { PackingSlipData, RenderableDate } from './types.js';

const DOCUMENT_STYLES = `
  :root {
    color-scheme: light;
    font-family: Arial, Helvetica, sans-serif;
    line-height: 1.4;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: #f5f5f5;
    color: #111827;
  }

  .no-print {
    display: flex;
    justify-content: flex-end;
    padding: 1rem;
  }

  .print-button {
    border: 1px solid #111827;
    background: white;
    color: #111827;
    padding: 0.625rem 1rem;
    cursor: pointer;
    font: inherit;
  }

  .page {
    max-width: 8.5in;
    margin: 0 auto 2rem;
    background: white;
    padding: 1in;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  }

  .header,
  .section-grid {
    display: grid;
    gap: 1.5rem;
  }

  .header,
  .section-grid {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-bottom: 2rem;
  }

  .panel {
    border: 1px solid #d1d5db;
    padding: 1rem;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.5rem;
    font-size: 1.875rem;
  }

  h2 {
    margin-bottom: 0.75rem;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: minmax(96px, auto) 1fr;
    gap: 0.5rem 0.75rem;
  }

  dt {
    font-weight: 700;
  }

  dd {
    margin: 0;
    word-break: break-word;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
  }

  th,
  td {
    border: 1px solid #d1d5db;
    padding: 0.75rem;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #f3f4f6;
  }

  .number {
    text-align: right;
    white-space: nowrap;
  }

  .footer {
    border-top: 1px solid #d1d5db;
    padding-top: 1rem;
    color: #374151;
  }

  @media print {
    body {
      margin: 0;
      padding: 0;
      background: white !important;
      color: black !important;
    }

    .no-print {
      display: none !important;
    }

    .page {
      width: auto;
      max-width: none;
      margin: 0;
      padding: 1in;
      box-shadow: none;
    }

    .page-break {
      page-break-after: always;
    }

    * {
      color: black !important;
      background: white !important;
      box-shadow: none !important;
    }
  }
`;

export function renderPackingSlipHtml(data: PackingSlipData): string {
  const sellerName = data.seller.sellerName.trim();
  const lineItemsHtml = data.lineItems
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.setName)}</td>
          <td>${escapeHtml(item.condition)}</td>
          <td class="number">${item.quantity}</td>
        </tr>
      `,
    )
    .join('');

  const sellerSection = sellerName
    ? `
      <section class="panel">
        <h2>Seller</h2>
        <dl>
          <dt>Name</dt>
          <dd>${escapeHtml(sellerName)}</dd>
          ${renderOptionalDefinition('Seller ID', data.seller.sellerId)}
        </dl>
      </section>
    `
    : '';

  const shipmentSection = data.shipment
    ? `
      <section class="panel">
        <h2>Shipment Details</h2>
        <dl>
          ${renderOptionalDefinition('Carrier', data.shipment.carrier)}
          ${renderOptionalDefinition('Tracking', data.shipment.trackingNumber)}
          ${renderOptionalDefinition('Shipped', formatDateTime(data.shipment.shippedAt))}
          ${renderOptionalDefinition('Delivered', formatDateTime(data.shipment.deliveredAt))}
          ${renderOptionalDefinition('Notes', data.shipment.notes, true)}
        </dl>
      </section>
    `
    : '';

  const notesSection = data.notes?.trim()
    ? `
      <section class="panel">
        <h2>Notes</h2>
        <p>${formatMultilineText(data.notes)}</p>
      </section>
    `
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Packing Slip - Order #${escapeHtml(data.orderId)}</title>
    <style>${DOCUMENT_STYLES}</style>
  </head>
  <body>
    <div class="no-print">
      <button class="print-button" type="button" onclick="window.print()">Print packing slip</button>
    </div>
    <main class="page">
      <header class="header">
        <section>
          <h1>Packing Slip</h1>
          <p>Order #${escapeHtml(data.orderId)}</p>
          <p>Date: ${escapeHtml(formatDateTime(data.soldAt))}</p>
        </section>
        <section class="panel">
          <h2>Order Information</h2>
          <dl>
            <dt>Order ID</dt>
            <dd>${escapeHtml(data.orderId)}</dd>
            <dt>Status</dt>
            <dd>${renderValue(data.orderStatus)}</dd>
            <dt>Buyer</dt>
            <dd>${renderValue(data.buyerName)}</dd>
          </dl>
        </section>
      </header>

      <section class="section-grid">
        ${sellerSection}
        <section class="panel">
          <h2>Ship To</h2>
          <dl>
            <dt>Buyer</dt>
            <dd>${renderValue(data.buyerName)}</dd>
            <dt>Shipping Address</dt>
            <dd>${renderValue(data.buyerAddress, true)}</dd>
          </dl>
        </section>
        ${shipmentSection}
        ${notesSection}
      </section>

      <section>
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Set</th>
              <th>Condition</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>${lineItemsHtml}</tbody>
        </table>
      </section>

      <footer class="footer">
        <p>Thank you for your order!</p>
        <p>Please leave feedback on TCGPlayer.</p>
      </footer>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDateTime(value: RenderableDate | undefined): string {
  if (value == null) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function formatMultilineText(value: string): string {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function renderOptionalDefinition(
  label: string,
  value: string | null | undefined,
  multiline = false,
): string {
  const normalized = value?.trim();

  if (!normalized || normalized === '—') {
    return '';
  }

  return `
    <dt>${escapeHtml(label)}</dt>
    <dd>${multiline ? formatMultilineText(normalized) : escapeHtml(normalized)}</dd>
  `;
}

function renderValue(
  value: string | null | undefined,
  multiline = false,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    return '—';
  }

  return multiline ? formatMultilineText(normalized) : escapeHtml(normalized);
}
