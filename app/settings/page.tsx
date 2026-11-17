import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProfileSettings } from "@/components/profile-settings";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, isActive: true },
    select: { name: true, email: true, role: true },
  });
  if (!user) redirect("/login");

  return (
    <main className="settings-page">
      <header className="settings-page__header">
        <p className="settings-eyebrow">ACCOUNT &amp; WORKSPACE</p>
        <h1>Settings</h1>
        <p>Manage your profile, security, and workspace preferences.</p>
      </header>
      <ProfileSettings initialName={user.name} initialEmail={user.email} role={user.role} />
    </main>
  );
}
