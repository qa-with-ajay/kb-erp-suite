"use server";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export type LoginState = { error: string | null };

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      roleCode: String(formData.get("roleCode") ?? ""),
      redirectTo: "/post-login",
    });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Invalid email or password." };
    throw error;
  }
  return { error: null };
}
