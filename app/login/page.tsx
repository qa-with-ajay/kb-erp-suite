import { prisma } from "@/lib/prisma";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const roles = await prisma.role.findMany({
    where: { isActive: true },
    select: { code: true, name: true, scope: true },
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="login-brand__mark" aria-hidden="true">KB</span>
          <span className="login-brand__name">Kumar Brothers <span>&amp; Associates</span></span>
        </div>
        <div className="login-heading">
          <p className="login-eyebrow">BUSINESS WORKSPACE</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage your inventory, sales, and operations.</p>
        </div>
        <LoginForm roles={roles} />
        <p className="login-footnote">Access is managed by your administrator. Public registration is disabled.</p>
      </section>
      <aside className="login-aside" aria-label="Business suite introduction">
        <div className="login-aside__glow" />
        <div className="login-aside__content">
          <span className="login-aside__kicker">ONE PLACE. EVERY UNIT.</span>
          <h2>Run your business with clarity.</h2>
          <p>A connected workspace for the people, products, and daily operations behind Kumar Brothers.</p>
          <div className="login-aside__footer">
            <span className="login-aside__dot" />
            <span>Inventory &amp; billing management</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
