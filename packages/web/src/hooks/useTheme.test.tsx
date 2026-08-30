import { act, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, useTheme } from './useTheme';

function mockSystemTheme(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({ matches })),
  );
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.removeProperty('color-scheme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the system preference for its initial theme when no explicit preference exists', () => {
    mockSystemTheme(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('prefers a saved explicit choice over the system preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    mockSystemTheme(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('toggles the document theme and persists the explicit choice', () => {
    mockSystemTheme(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
