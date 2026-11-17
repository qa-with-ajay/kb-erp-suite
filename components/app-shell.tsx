"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AppNavItem = {
  label: string;
  href: string;
};

type Props = {
  children: React.ReactNode;
  items: AppNavItem[];
  userName: string;
  userRole: string;
};

export function AppShell({ children, items, userName, userRole }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith("/login") || items.length === 0) return children;

  const activeItem = [...items]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <Link href={items[0]?.href ?? "/login"} className="app-shell__brand" aria-label="Kumar Brothers ERP home">
          <span className="app-shell__brand-mark" aria-hidden="true">KB</span>
          <span>
            <span className="app-shell__brand-subtitle">Business suite</span>
          </span>
        </Link>
        <p className="app-shell__section-label">Workspace</p>
        <nav className="app-shell__nav" aria-label="Main navigation">
          {items.map((item) => {
            const active = activeItem?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="app-shell__nav-link"
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="app-shell__sidebar-footer">
          <p className="app-shell__user-name">{userName}</p>
          <p className="app-shell__user-role">{userRole}</p>
        </div>
      </aside>
      <div className="app-shell__main">
        {children}
      </div>
    </div>
  );
}
