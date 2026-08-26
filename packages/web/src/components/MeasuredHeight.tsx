import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface MeasuredHeightProps {
  open: boolean;
  className?: string;
  contentClassName?: string;
  inert?: boolean;
  children: ReactNode;
}

/**
 * Keeps an accordion mounted while driving its wrapper between 0px and its
 * current scrollHeight. ResizeObserver covers content and responsive layout
 * changes; the layout measurement also provides a fallback for environments
 * without ResizeObserver.
 */
export function MeasuredHeight({
  open,
  className,
  contentClassName,
  inert,
  children,
}: MeasuredHeightProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const [height, setHeight] = useState(0);

  openRef.current = open;

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;

    const nextHeight = openRef.current ? content.scrollHeight : 0;
    setHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [children, measure, open]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(content);

    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      data-motion-state={open ? 'open' : 'closed'}
      inert={inert}
      style={{ height: `${height}px` }}
    >
      <div ref={contentRef} className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
