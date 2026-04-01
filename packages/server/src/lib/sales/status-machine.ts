import { orderStatusEnum } from '../../db/schema/sales.js';

export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

export const TERMINAL_STATUSES = new Set<OrderStatus>([
  'delivered',
  'cancelled',
]);

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
