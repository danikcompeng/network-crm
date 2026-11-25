// The one-time code in the login email.
//
// Why a code and not only the email's button: an app added to an iPhone's
// home screen keeps its own login, separate from Safari's, and a link in an
// email always opens in Safari. Typing the code logs in whichever app you
// typed it into.
//
// The code's length is a Supabase setting (Authentication -> Providers ->
// Email -> "Email OTP length"), shared with Hold and Bitewise. It can be 6 to 10
// digits, so any of those is accepted.

export const LOGIN_CODE_DIGITS = { min: 6, max: 10 } as const;

/**
 * Tidies what you typed or pasted ("1234 5678", "1234-5678") down to the
 * digits. Returns null if that isn't 6 to 10 digits.
 */
export function cleanLoginCode(typed: string): string | null {
  const digits = typed.replace(/[\s-]/g, "");
  const { min, max } = LOGIN_CODE_DIGITS;
  return new RegExp(`^\\d{${min},${max}}$`).test(digits) ? digits : null;
}

/** A plausible email: something@something.something, no spaces. Supabase does the real check. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
