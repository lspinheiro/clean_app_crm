"use client";

import { useActionState } from "react";

import { joinAction, type JoinState } from "@/app/actions/join";

const initialState: JoinState = { error: null };

export function JoinForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(joinAction, initialState);

  return (
    <form action={action} className="form-stack">
      <input name="code" type="hidden" value={code} />
      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <p className="field-hint">Use at least 8 characters.</p>
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" required />
      </div>
      <div className="field">
        <label htmlFor="suburb">Suburb</label>
        <input id="suburb" name="suburb" autoComplete="address-level2" required />
        <p className="field-hint">The suburb you travel from. It helps you find jobs near you.</p>
      </div>
      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Joining…" : "Join the pool"}
      </button>
      <p className="consent-caption">
        The company sees your name, phone, and suburb so they can offer you work. They do not
        see your password.
      </p>
    </form>
  );
}
