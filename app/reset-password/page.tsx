"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirmPassword) { setMessage("Passwords do not match."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Unable to reset password."); return; }
      setSuccess(true);
      setMessage(data.message);
    } catch {
      setMessage("Unable to reset your password right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="login-card">
      <div className="login-brand"><span className="login-brand__mark">KB</span><span className="login-brand__name">Kumar Brothers <span>&amp; Associates</span></span></div>
      <div className="login-heading"><p className="login-eyebrow">ACCOUNT RECOVERY</p><h1>Set a new password</h1><p>Choose a strong password for your KB-ERP account.</p></div>
      {!token ? <p role="alert" className="text-sm text-red-700">Reset token is missing. Request a new reset link.</p> : success ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">New password
            <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <label className="block text-sm font-medium">Confirm new password
            <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-3" />
          </label>
          <p className="text-xs text-gray-500">Use 12–128 characters. Your password is stored securely as a hash.</p>
          {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
          <button disabled={pending} className="w-full rounded-lg bg-emerald-900 p-3 font-semibold text-white disabled:opacity-60">{pending ? "Updating..." : "Update password"}</button>
        </form>
      )}
      <p className="login-footnote"><Link href="/login" className="font-semibold text-emerald-800 hover:underline">Back to login</Link></p>
    </section>
  );
}

export default function ResetPasswordPage() {
  return <main className="login-page"><Suspense fallback={<section className="login-card">Loading password reset...</section>}><ResetPasswordForm /></Suspense><aside className="login-aside"><div className="login-aside__content"><span className="login-aside__kicker">SECURE ACCOUNT RECOVERY</span><h2>Protect your workspace.</h2><p>Reset links expire after 15 minutes and can only be used once.</p></div></aside></main>;
}
