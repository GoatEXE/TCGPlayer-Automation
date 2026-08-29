import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHONE_BREAKPOINT_PX,
  useContainerResponsiveMode,
} from './useContainerResponsiveMode';

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];

  readonly disconnect = vi.fn();
  readonly observe = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this);
  }

  trigger(width: number) {
    this.callback(
      [
        {
          contentRect: { width },
          target: this.observe.mock.calls[0]?.[0],
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}

function ResponsiveModeProbe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mode = useContainerResponsiveMode(containerRef);

  return (
    <div ref={containerRef} data-testid="responsive-mode">
      {mode}
    </div>
  );
}

describe('useContainerResponsiveMode', () => {
  let containerWidth = 900;
  let innerWidthDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    TestResizeObserver.instances = [];
    innerWidthDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'innerWidth',
    );
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          bottom: 0,
          height: 0,
          left: 0,
          right: containerWidth,
          top: 0,
          width: containerWidth,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (innerWidthDescriptor) {
      Object.defineProperty(window, 'innerWidth', innerWidthDescriptor);
    }
  });

  it('uses phone mode below 760px and desktop mode at or above the boundary', () => {
    containerWidth = PHONE_BREAKPOINT_PX - 1;
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

    render(<ResponsiveModeProbe />);

    expect(screen.getByTestId('responsive-mode')).toHaveTextContent('phone');
    expect(TestResizeObserver.instances).toHaveLength(1);

    act(() => {
      TestResizeObserver.instances[0].trigger(PHONE_BREAKPOINT_PX);
    });

    expect(screen.getByTestId('responsive-mode')).toHaveTextContent('desktop');

    act(() => {
      TestResizeObserver.instances[0].trigger(PHONE_BREAKPOINT_PX + 240);
    });

    expect(screen.getByTestId('responsive-mode')).toHaveTextContent('desktop');
  });

  it('falls back to window resize when ResizeObserver is unavailable', () => {
    containerWidth = 0;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: PHONE_BREAKPOINT_PX - 1,
      writable: true,
    });
    vi.stubGlobal('ResizeObserver', undefined);

    render(<ResponsiveModeProbe />);

    expect(screen.getByTestId('responsive-mode')).toHaveTextContent('phone');

    act(() => {
      window.innerWidth = PHONE_BREAKPOINT_PX + 1;
      window.dispatchEvent(new Event('resize'));
    });

    expect(screen.getByTestId('responsive-mode')).toHaveTextContent('desktop');
  });
});
