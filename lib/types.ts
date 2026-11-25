/** What a form's server action sends back: ok, or a message (and per-field messages). */
export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};
