import { forwardRef, useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { BlueprintRegistrationMarks } from './BlueprintPanel';
import { classNames } from './classNames';

export interface BlueprintInputProps extends ComponentPropsWithoutRef<'input'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

/** A labeled native input with Industry focus, hint, and validation states. */
export const BlueprintInput = forwardRef<HTMLInputElement, BlueprintInputProps>(
  function BlueprintInput(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      className,
      error,
      fieldClassName,
      hint,
      id,
      label,
      required,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? `industry-input-${generatedId}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy =
      [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={classNames('industry-field', fieldClassName)}>
        {label ? (
          <label className="industry-field__label" htmlFor={inputId}>
            {label}
            {required ? (
              <span className="industry-field__required" aria-hidden="true">
                {' *'}
              </span>
            ) : null}
          </label>
        ) : null}
        <div className="industry-blueprint industry-input-frame">
          <input
            {...props}
            ref={ref}
            id={inputId}
            required={required}
            className={classNames('industry-input', className)}
            aria-describedby={describedBy}
            aria-invalid={error ? true : ariaInvalid}
          />
          <BlueprintRegistrationMarks />
        </div>
        {hint ? (
          <p id={hintId} className="industry-field__hint">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="industry-field__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
