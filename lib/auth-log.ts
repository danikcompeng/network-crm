// Login problems only show a short message ("That code didn't work"), so
// this logs the real reason on the server: the dev terminal locally, the
// function logs on Vercel. Never logs the email or the code.
//
// Its own file, because a "use server" file may only export actions.
export function logAuthError(step: string, error: { message: string; status?: number; code?: string }) {
  console.error(`${step} failed:`, { message: error.message, status: error.status, code: error.code });
}
