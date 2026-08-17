import type { Metadata } from "next";

import { BrandBubbles } from "../../../components/brand-bubbles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="brand-lockup">
          <BrandBubbles />
          The Clean Crew
        </div>
        <div>
          <h1>Your cleaning week, on record.</h1>
          <p>Clients, sites, the pool and every upcoming job in one operational workspace.</p>
        </div>
        <p>Gold Coast · Australia/Brisbane</p>
      </section>
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <div className="auth-panel__inner">
          <h2 id="sign-in-title">Sign in</h2>
          <p className="auth-panel__intro">Use the company admin account prepared for your team.</p>
          <LoginForm />
          <p className="auth-note">Company accounts are concierge-created during the alpha.</p>
        </div>
      </section>
    </main>
  );
}
