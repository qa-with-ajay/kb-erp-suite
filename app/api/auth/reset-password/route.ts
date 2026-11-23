import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(12).max(128),
});
function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid reset request." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Use a password between 12 and 128 characters and a valid reset link." }, { status: 400 });

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const passwordHash = await hash(parsed.data.password, 12);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt <= now) return false;
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, passwordVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: token.userId, id: { not: token.id } } });
    await tx.auditLog.create({
      data: {
        userId: token.userId,
        action: "PASSWORD_RESET",
        entity: "User",
        entityId: token.userId,
        details: { method: "EMAIL_TOKEN" },
      },
    });
    return true;
  });

  if (!result) return NextResponse.json({ error: "This reset link is invalid, expired, or already used. Request a new link." }, { status: 400 });
  return NextResponse.json({ message: "Password updated. You can now sign in with your new password." });
}
