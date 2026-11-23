"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setMessage(data.message || "If an active account matches that email, a reset link will be sent shortly.");
    } catch {
      setMessage("Unable to submit the request right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span className="login-brand__mark">KB</span><span className="login-brand__name">Kumar Brothers <span>&amp; Associates</span></span></div>
        <div className="login-heading">
          <p className="login-eyebrow">ACCOUNT RECOVERY</p>
          <h1>Forgot password?</h1>
          <p>Enter your registered email address. If an active account matches, we will send a secure reset link.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">Registered email
            <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-3" />
          </label>
          {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
          <button disabled={pending} className="w-full rounded-lg bg-emerald-900 p-3 font-semibold text-white disabled:opacity-60">{pending ? "Sending..." : "Send reset link"}</button>
        </form>
        <p className="login-footnote"><Link href="/login" className="font-semibold text-emerald-800 hover:underline">Back to login</Link></p>
      </section>
      <aside className="login-aside"><div className="login-aside__content"><span className="login-aside__kicker">SECURE ACCOUNT RECOVERY</span><h2>Get back to business.</h2><p>Password reset links are single-use and expire after 15 minutes.</p></div></aside>
    </main>
  );
}
