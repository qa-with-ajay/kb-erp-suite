"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

type LoginRole = { code: string; name: string; scope: "GROUP" | "BUSINESS_UNIT" };

export function LoginForm({ roles }: { roles: LoginRole[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm font-medium">
        Role
        <select name="roleCode" required defaultValue="" className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3">
          <option value="" disabled>Select your role</option>
          {roles.map((role) => (
            <option key={role.code} value={role.code}>{role.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded-lg border border-gray-300 p-3" />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded-lg border border-gray-300 p-3" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <div className="text-right text-sm"><a href="/forgot-password" className="font-semibold text-emerald-800 hover:underline">Forgot password?</a></div>
      <button disabled={pending} className="w-full rounded-lg bg-emerald-900 p-3 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
