import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import authConfig from "./auth.config";

function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        if ("selectedRoleCode" in user && typeof user.selectedRoleCode === "string") {
          token.selectedRoleCode = user.selectedRoleCode;
        }
      }

      if (typeof token.userId === "string") {
        const profile = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { name: true, email: true, role: true, isActive: true, passwordVersion: true },
        });
        if (!profile?.isActive) {
          token.userDisabled = true;
        } else if (typeof token.passwordVersion === "number" && token.passwordVersion !== profile.passwordVersion) {
          token.userDisabled = true;
        } else {
          token.userDisabled = false;
          token.passwordVersion = profile.passwordVersion;
        }
        if (profile?.isActive && !token.userDisabled) {
          token.name = profile.name;
          token.email = profile.email;
          token.role = profile.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (typeof token.userId !== "string" || !isUserRole(token.role)) {
          throw new Error("Authenticated session is missing user authorization details.");
        }
        session.user.id = token.userDisabled ? "" : token.userId;
        session.user.role = token.role;
        if (typeof token.selectedRoleCode === "string") {
          session.user.selectedRoleCode = token.selectedRoleCode;
        }
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.email === "string") session.user.email = token.email;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        roleCode: { label: "Role", type: "text" },
      },
      async authorize(credentials) {
        const parsed = z.object({
          email: z.string().email(),
          password: z.string().min(1),
          roleCode: z.string().min(2).max(64),
        }).safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user || !user.isActive) return null;

        const selectedRole = await prisma.role.findFirst({
          where: { code: parsed.data.roleCode, isActive: true },
          select: { id: true, code: true, scope: true },
        });
        if (!selectedRole) return null;

        const assignment = selectedRole.scope === "GROUP"
          ? await prisma.userGroupRole.findFirst({
              where: { userId: user.id, roleId: selectedRole.id, role: { isActive: true } },
              select: { userId: true },
            })
          : await prisma.userBusinessUnitRole.findFirst({
              where: {
                userId: user.id,
                roleId: selectedRole.id,
                role: { isActive: true },
                businessUnit: { isActive: true },
              },
              select: { userId: true },
            });
        if (!assignment) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          selectedRoleCode: selectedRole.code,
        };
      },
    }),
  ],
});
