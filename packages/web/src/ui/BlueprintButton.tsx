import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { BlueprintRegistrationMarks } from './BlueprintPanel';
import { classNames } from './classNames';

export type BlueprintButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface BlueprintButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: BlueprintButtonVariant;
  icon?: ReactNode;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
}

/** A square, keyboard-accessible Industry action button. */
export function BlueprintButton({
  children,
  className,
  fullWidth = false,
  icon,
  iconPosition = 'start',
  type = 'button',
  variant = 'secondary',
  ...props
}: BlueprintButtonProps) {
  const iconOnly = icon !== undefined && children === undefined;
  const iconElement = icon ? (
    <span className="industry-button__icon" aria-hidden="true">
      {icon}
    </span>
  ) : null;

  return (
    <button
      {...props}
      type={type}
      className={classNames(
        'industry-blueprint',
        'industry-button',
        `industry-button--${variant}`,
        fullWidth && 'industry-button--block',
        iconOnly && 'industry-button--icon-only',
        className,
      )}
    >
      {iconPosition === 'start' && iconElement}
      {children}
      {iconPosition === 'end' && iconElement}
      <BlueprintRegistrationMarks />
    </button>
  );
}
