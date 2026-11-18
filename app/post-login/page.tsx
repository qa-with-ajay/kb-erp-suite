
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { UserRole } from "@prisma/client";

export default async function PostLoginPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (session.user.role === UserRole.ADMIN) {
    redirect("/group-dashboard");
  }

  redirect("/dashboard");
}
