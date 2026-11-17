import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/catalog-validation";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, role: true, isActive: true },
  });
  if (!user?.isActive) return NextResponse.json({ error: "User account was not found." }, { status: 404 });
  return NextResponse.json({ name: user.name, email: user.email, role: user.role });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = profileSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid name and email address." }, { status: 400 });
  }

  try {
    const activeUser = await prisma.user.findFirst({
      where: { id: session.user.id, isActive: true },
      select: { id: true },
    });
    if (!activeUser) return NextResponse.json({ error: "User account was not found." }, { status: 404 });
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name, email: parsed.data.email.toLowerCase() },
      select: { name: true, email: true, role: true },
    });
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
    }
    throw error;
  }
}
