// A labelled multi-line box (notes), with its error underneath.
import type { Ref, TextareaHTMLAttributes } from "react";
import { ErrorText } from "./error-text";
import { FIELD_CLASS } from "./select-field";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label: string;
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

export function TextAreaField({ id, label, error, className = "", ref, ...props }: Props) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={`min-h-28 resize-none py-3 leading-relaxed ${FIELD_CLASS} ${className}`}
        {...props}
      />
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  );
}
