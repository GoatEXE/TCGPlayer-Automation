import { describe, expect, it } from 'vitest';
import { isValidTransition, TERMINAL_STATUSES } from '../status-machine.js';

describe('sales status machine', () => {
  it('allows valid forward transitions', () => {
    expect(isValidTransition('pending', 'confirmed')).toBe(true);
    expect(isValidTransition('confirmed', 'shipped')).toBe(true);
    expect(isValidTransition('shipped', 'delivered')).toBe(true);
  });

  it('allows cancellation from non-terminal statuses', () => {
    expect(isValidTransition('pending', 'cancelled')).toBe(true);
    expect(isValidTransition('confirmed', 'cancelled')).toBe(true);
    expect(isValidTransition('shipped', 'cancelled')).toBe(true);
  });

  it('rejects invalid backward transitions', () => {
    expect(isValidTransition('shipped', 'confirmed')).toBe(false);
    expect(isValidTransition('delivered', 'pending')).toBe(false);
  });

  it('treats cancelled and delivered as terminal', () => {
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true);
    expect(TERMINAL_STATUSES.has('delivered')).toBe(true);
    expect(isValidTransition('cancelled', 'confirmed')).toBe(false);
    expect(isValidTransition('delivered', 'shipped')).toBe(false);
  });
});
