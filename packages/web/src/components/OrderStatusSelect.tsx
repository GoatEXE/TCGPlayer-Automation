import type { OrderStatus } from '../api/types';

interface OrderStatusSelectProps {
  currentStatus: OrderStatus;
  onChange: (nextStatus: OrderStatus) => void;
}

const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function OrderStatusSelect({
  currentStatus,
  onChange,
}: OrderStatusSelectProps) {
  const validNext = transitions[currentStatus];

  // Terminal statuses — render as badge
  if (validNext.length === 0) {
    return (
      <span className={`sales-status sales-status-${currentStatus}`}>
        {currentStatus}
      </span>
    );
  }

  return (
    <select
      className="order-status-select"
      value={currentStatus}
      onChange={(e) => onChange(e.target.value as OrderStatus)}
      aria-label="Change order status"
    >
      <option value={currentStatus}>{currentStatus}</option>
      {validNext.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
