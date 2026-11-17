import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/catalog-validation";

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = passwordSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your current password and a new password of at least 8 characters." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, isActive: true },
  });
  if (!user?.isActive) return NextResponse.json({ error: "User account was not found." }, { status: 404 });

  const currentPasswordMatches = await compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentPasswordMatches) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  if (await compare(parsed.data.newPassword, user.passwordHash)) {
    return NextResponse.json({ error: "Choose a new password that differs from your current password." }, { status: 400 });
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } });
  return NextResponse.json({ success: true });
}
