import { useCallback, useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Widths below this boundary use the phone layout; 760px and wider use desktop. */
export const PHONE_BREAKPOINT_PX = 760;

export type ResponsiveMode = 'phone' | 'desktop';

export interface UseContainerResponsiveModeOptions {
  phoneBreakpoint?: number;
}

export function getResponsiveMode(
  width: number,
  phoneBreakpoint = PHONE_BREAKPOINT_PX,
): ResponsiveMode {
  return width < phoneBreakpoint ? 'phone' : 'desktop';
}

function getMeasuredWidth(element: Element | null): number | undefined {
  const width = element?.getBoundingClientRect().width;
  return width !== undefined && Number.isFinite(width) && width > 0
    ? width
    : undefined;
}

/**
 * Selects a layout mode from a container rather than the full viewport.
 * ResizeObserver is used where available; older WebViews safely fall back to
 * measuring on window resize.
 */
export function useContainerResponsiveMode<T extends Element>(
  containerRef: RefObject<T | null>,
  {
    phoneBreakpoint = PHONE_BREAKPOINT_PX,
  }: UseContainerResponsiveModeOptions = {},
): ResponsiveMode {
  const readMode = useCallback((): ResponsiveMode => {
    if (typeof window === 'undefined') {
      return 'desktop';
    }

    const width = getMeasuredWidth(containerRef.current) ?? window.innerWidth;
    return getResponsiveMode(width, phoneBreakpoint);
  }, [containerRef, phoneBreakpoint]);

  const [mode, setMode] = useState(readMode);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const update = (width?: number) => {
      const measuredWidth =
        width !== undefined && Number.isFinite(width) && width > 0
          ? width
          : (getMeasuredWidth(containerRef.current) ?? window.innerWidth);
      setMode(getResponsiveMode(measuredWidth, phoneBreakpoint));
    };

    update();

    const element = containerRef.current;
    if (element !== null && typeof ResizeObserver !== 'undefined') {
      try {
        const observer = new ResizeObserver((entries) => {
          const entry = entries.find(
            (candidate) => candidate.target === element,
          );
          update(entry?.contentRect.width);
        });

        observer.observe(element);
        return () => observer.disconnect();
      } catch {
        // A partially implemented ResizeObserver must not break phone layouts.
      }
    }

    const handleWindowResize = () => update();
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [containerRef, phoneBreakpoint]);

  return mode;
}
