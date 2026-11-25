import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const inputSchema = z.object({ email: z.string().trim().email().max(254) });
const genericMessage = "If an active account matches that email, a password reset link will be sent shortly.";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

function createMailTransport() {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.replace(/\s/g, "");
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);

  if (!user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP email configuration is incomplete.");
  }

  return {
    from: process.env.EMAIL_FROM?.trim() || user,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    }),
  };
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

  let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const mail = createMailTransport();
    transporter = mail.transporter;
    await transporter.sendMail({
      from: mail.from,
      to: user.email,
      subject: "Reset your KB-ERP password",
      text: `We received a request to reset your KB-ERP password. Open this link within 15 minutes to set a new password: ${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#243249"><h2>Password reset request</h2><p>We received a request to reset your KB-ERP password.</p><p><a href="${resetUrl}" style="display:inline-block;background:#126541;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a></p><p>This link expires in 15 minutes and can be used once. If you did not request this, ignore this email.</p></div>`,
    });
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    console.error("Password reset email delivery failed. Check SMTP configuration and Gmail App Password.", error instanceof Error ? error.message : "Unknown SMTP error");
  } finally {
    transporter?.close();
  }

  return NextResponse.json({ message: genericMessage });
}
