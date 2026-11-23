import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({ email: z.string().trim().email().max(254) });
const genericMessage = "If an active account matches that email, a password reset link will be sent shortly.";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ message: genericMessage }); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: genericMessage });

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true, email: true },
  });
  if (!user) return NextResponse.json({ message: genericMessage });

  const recentCount = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
  });
  if (recentCount >= 3) return NextResponse.json({ message: genericMessage });

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const baseUrl = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.error("Password reset email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
    return NextResponse.json({ message: genericMessage });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Reset your KB-ERP password",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243249"><h2>Password reset request</h2><p>We received a request to reset your KB-ERP password.</p><p><a href="${resetUrl}" style="display:inline-block;background:#126541;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a></p><p>This link expires in 15 minutes and can be used once. If you did not request this, ignore this email.</p></div>`,
      }),
    });
    if (!response.ok) {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      console.error("Password reset email delivery failed:", response.status);
    }
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.error("Password reset email delivery failed:", error);
  }

  return NextResponse.json({ message: genericMessage });
}
