import { describe, it, expect } from 'vitest';
import { StatusBadge } from '../StatusBadge';
import type { Card } from '../../api/types';

describe('StatusBadge', () => {
  const testCases: Array<{
    status: Card['status'];
    label: string;
    color: string;
  }> = [
    { status: 'pending', label: 'Pending', color: '#6b7280' },
    { status: 'matched', label: 'Ready to List', color: '#8b5cf6' },
    { status: 'listed', label: 'Listed', color: '#10b981' },
    { status: 'gift', label: 'Gift', color: '#3b82f6' },
    { status: 'needs_attention', label: 'Needs Attention', color: '#f59e0b' },
    { status: 'error', label: 'Error', color: '#ef4444' },
  ];

  testCases.forEach(({ status, label, color }) => {
    it(`renders ${status} status with correct label`, () => {
      const component = StatusBadge({ status });
      expect(component.props.children).toBe(label);
    });

    it(`renders ${status} status with correct color`, () => {
      const component = StatusBadge({ status });
      expect(component.props.style.backgroundColor).toBe(color);
    });

    it(`renders ${status} status with white text`, () => {
      const component = StatusBadge({ status });
      expect(component.props.style.color).toBe('white');
    });
  });

  it('applies correct styling properties', () => {
    const component = StatusBadge({ status: 'listed' });
    const style = component.props.style;

    expect(style.display).toBe('inline-block');
    expect(style.borderRadius).toBe('9999px');
    expect(style.fontSize).toBe('0.75rem');
    expect(style.fontWeight).toBe('600');
    expect(style.textTransform).toBe('uppercase');
  });

  it('renders as a span element', () => {
    const component = StatusBadge({ status: 'listed' });
    expect(component.type).toBe('span');
  });
});
