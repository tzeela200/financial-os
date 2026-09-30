"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initial);
  return (
    <form action={formAction} className="login-form" noValidate>
      <label htmlFor="email">אימייל</label>
      <input id="email" name="email" type="email" autoComplete="email" dir="ltr" required />
      <label htmlFor="password">סיסמה</label>
      <input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required />
      {state.error && (
        <p role="alert" className="login-error">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "נכנסת…" : "כניסה"}
      </button>
    </form>
  );
}
