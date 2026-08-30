import type { ComponentPropsWithoutRef } from 'react';
import { classNames } from './classNames';

export function BlueprintRegistrationMarks() {
  return (
    <>
      <span
        className="industry-blueprint__mark industry-blueprint__mark--top-left"
        aria-hidden="true"
      />
      <span
        className="industry-blueprint__mark industry-blueprint__mark--top-right"
        aria-hidden="true"
      />
      <span
        className="industry-blueprint__mark industry-blueprint__mark--bottom-left"
        aria-hidden="true"
      />
      <span
        className="industry-blueprint__mark industry-blueprint__mark--bottom-right"
        aria-hidden="true"
      />
    </>
  );
}

export interface BlueprintPanelProps extends ComponentPropsWithoutRef<'section'> {
  tone?: 'ground' | 'surface';
}

/** A square Industry panel with non-interactive blueprint registration marks. */
export function BlueprintPanel({
  children,
  className,
  tone = 'ground',
  ...props
}: BlueprintPanelProps) {
  return (
    <section
      {...props}
      className={classNames(
        'industry-blueprint',
        'industry-panel',
        tone === 'surface' && 'industry-panel--surface',
        className,
      )}
    >
      {children}
      <BlueprintRegistrationMarks />
    </section>
  );
}
