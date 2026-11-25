// The button in the login email opens this address. It swaps the one-time
// token in the link for a real login (saved in a cookie), then goes to Today.
// verifyOtp with a token_hash works in any browser, even one that didn't
// ask for the email.
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { logAuthError } from "@/lib/auth-log";
import { createClient } from "@/lib/supabase/server";

const EMAIL_TYPES: readonly EmailOtpType[] = ["email", "magiclink", "signup"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let ok = false;
  if (tokenHash && type && EMAIL_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) logAuthError("auth/confirm", error);
    ok = !error;
  }

  // Always a fixed address on this site: nothing from the link decides
  // where you end up, so it can't be used to send you somewhere else.
  return NextResponse.redirect(new URL(ok ? "/" : "/login?error=link", request.url));
}
