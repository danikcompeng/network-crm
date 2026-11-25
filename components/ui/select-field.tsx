// A labelled native <select>: the phone's own picker, accessible for free.
// Same look and error handling as TextField.
import type { ReactNode, Ref, SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { ErrorText } from "./error-text";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  ref?: Ref<HTMLSelectElement>;
};

export const FIELD_CLASS =
  "w-full rounded-(--radius-field) border border-edge bg-surface px-4 text-base text-ink placeholder:text-ink-muted " +
  "aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:focus-visible:outline-danger";

export function SelectField({ id, label, error, hint, className = "", ref, children, ...props }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className={`h-12 appearance-none pr-11 ${FIELD_CLASS} ${className}`}
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon size={18} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted" />
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
