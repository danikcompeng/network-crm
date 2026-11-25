// Network's buttons: flat, drawn with a hairline, 12 px corners
// (plans/crm.md, Design direction). Pressed, the background deepens; no
// movement, so Reduce Motion needs no special case.
//
// Size and width are options, never extra classes: without a class
// merger, a "w-auto" added after "w-full" can lose depending on stylesheet
// order (Hold learnt this the hard way).

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonOptions = {
  /** "md": 48 px tall, 16 px text (default). "sm": 44 px, 14 px text, for headers and rows. */
  size?: "md" | "sm";
  /** Fill the width of its container (default) or fit its label. */
  block?: boolean;
};

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-(--radius-field) font-semibold whitespace-nowrap " +
  "transition-[background-color,color,border-color,opacity] duration-(--motion-fast) ease-(--ease-out) " +
  "aria-disabled:cursor-not-allowed";

const SIZES = {
  md: "min-h-12 px-5 text-base",
  sm: "min-h-11 px-4 text-sm",
} as const;

const VARIANTS: Record<ButtonVariant, string> = {
  // Pressed: the accent at 85% over the page, so the press is visible in both themes.
  primary: "bg-accent-fill text-on-accent active:opacity-85",
  secondary: "border border-edge bg-surface text-ink hover:border-ink-muted active:bg-surface-press",
  danger: "bg-danger text-surface active:opacity-85",
  ghost: "text-ink-muted hover:text-ink active:bg-surface-press active:text-ink",
};

export function buttonClass(variant: ButtonVariant = "primary", options: ButtonOptions = {}, extra = ""): string {
  const { size = "md", block = true } = options;
  return [BASE, SIZES[size], block ? "w-full" : "w-auto", VARIANTS[variant], extra].filter(Boolean).join(" ");
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonOptions & {
    variant?: ButtonVariant;
    /**
     * Working on it: the button can't be pressed again, but keeps its focus
     * and full colour (aria-disabled, not disabled: disabled would push
     * keyboard focus away and grey it out).
     */
    busy?: boolean;
  };

export function Button({
  variant = "primary",
  size,
  block,
  busy = false,
  className = "",
  type = "button",
  onClick,
  onKeyDown,
  ...props
}: Props) {
  return (
    <button
      type={type}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        // A held-down Enter repeats; for a destructive button that would
        // mean "yes" twice. One press, one action.
        if (variant === "danger" && event.repeat) event.preventDefault();
        onKeyDown?.(event);
      }}
      className={buttonClass(variant, { size, block }, className)}
      {...props}
    />
  );
}
