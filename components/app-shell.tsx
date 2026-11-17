"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LOW_STOCK_NOTIFICATIONS_KEY, UI_PREFERENCES_CHANGED_EVENT } from "@/lib/ui-preferences";

export type AppNavItem = {
  label: string;
  href: string;
};

type Props = {
  children: React.ReactNode;
  items: AppNavItem[];
  userName: string;
  userRole: string;
  canViewLowStock: boolean;
};

type LowStockNotification = {
  productId: string;
  productName: string;
  sku: string;
  baseUnit: string;
  currentStock: string;
  minimumStock: string;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

function getRoleName(role: string) {
  if (role === "ADMIN") return "Administrator";
  if (role === "MANAGER") return "Manager";
  if (role === "CASHIER") return "Staff";
  return role;
}

function ProfileMenu({ userName, userRole }: { userName: string; userRole: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  return (
    <div className="app-shell__profile" ref={menuRef}>
      <button
        type="button"
        className="app-shell__profile-button"
        aria-expanded={open}
        aria-controls={open ? "app-shell-profile-menu" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-shell__avatar" aria-hidden="true">{getInitials(userName)}</span>
        <span className="app-shell__profile-summary">
          <span className="app-shell__profile-name">{userName}</span>
          <span className="app-shell__profile-role">{getRoleName(userRole)}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="app-shell__chevron">
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="app-shell__profile-menu" id="app-shell-profile-menu">
          <div className="app-shell__menu-heading">
            <span className="app-shell__avatar app-shell__avatar--large" aria-hidden="true">{getInitials(userName)}</span>
            <span>
              <span className="app-shell__profile-name">{userName}</span>
              <span className="app-shell__profile-role">{getRoleName(userRole)}</span>
            </span>
          </div>
          <Link href="/settings#profile" className="app-shell__menu-link" onClick={() => setOpen(false)}>Profile</Link>
          <Link href="/settings#preferences" className="app-shell__menu-link" onClick={() => setOpen(false)}>Preferences</Link>
          <Link href="/settings#system" className="app-shell__menu-link" onClick={() => setOpen(false)}>System settings</Link>
          <Link href="/settings#security" className="app-shell__menu-link" onClick={() => setOpen(false)}>Change password</Link>
          <div className="app-shell__menu-divider" />
          <button
            type="button"
            className="app-shell__menu-link app-shell__menu-link--danger"
            onClick={() => void signOut({ redirectTo: "/login" })}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function LowStockNotifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LowStockNotification[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/notifications/low-stock", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load low-stock notifications.");
        setItems(data.items);
        setCount(data.count);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load low-stock notifications.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell__notification">
      <button
        type="button"
        className="app-shell__notification-button"
        aria-label={`Low-stock notifications${count ? `, ${count} products` : ""}`}
        aria-expanded={open}
        aria-controls={open ? "app-shell-low-stock-panel" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-shell__bell-icon">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && <span className="app-shell__notification-count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <section className="app-shell__notification-panel" id="app-shell-low-stock-panel" aria-label="Low-stock alerts">
          <div className="app-shell__notification-heading">
            <div>
              <h2>Low-stock alerts</h2>
              <p>{count} product{count === 1 ? "" : "s"} at or below minimum stock</p>
            </div>
            <button type="button" className="app-shell__panel-close" aria-label="Close notifications" onClick={() => setOpen(false)}>x</button>
          </div>
          {loading ? <p className="app-shell__notification-message">Loading alerts...</p> : null}
          {error ? <p className="app-shell__notification-error" role="alert">{error}</p> : null}
          {!loading && !error && items.length === 0 ? <p className="app-shell__notification-message">No low-stock alerts for this unit.</p> : null}
          {!loading && !error && items.length > 0 ? (
            <ul className="app-shell__notification-list">
              {items.map((item) => (
                <li key={item.productId}>
                  <span className="app-shell__notification-product">{item.productName}<small>{item.sku}</small></span>
                  <span className="app-shell__notification-stock">{item.currentStock} / {item.minimumStock} {item.baseUnit}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/dashboard" className="app-shell__notification-link" onClick={() => setOpen(false)}>Open unit dashboard</Link>
        </section>
      )}
    </div>
  );
}

export function AppShell({ children, items, userName, userRole, canViewLowStock }: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const currentUserName = session?.user?.name || userName;
  const currentUserRole = session?.user?.role || userRole;

  useEffect(() => {
    function syncPreference() {
      setNotificationsEnabled(localStorage.getItem(LOW_STOCK_NOTIFICATIONS_KEY) !== "false");
    }
    syncPreference();
    window.addEventListener(UI_PREFERENCES_CHANGED_EVENT, syncPreference);
    window.addEventListener("storage", syncPreference);
    return () => {
      window.removeEventListener(UI_PREFERENCES_CHANGED_EVENT, syncPreference);
      window.removeEventListener("storage", syncPreference);
    };
  }, []);

  if (pathname.startsWith("/login") || !session?.user?.id) return children;

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
        {items.length > 0 ? (
          <>
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
          </>
        ) : <p className="app-shell__no-access">No workspace access assigned</p>}
      </aside>
      <div className="app-shell__main">
        <header className="app-shell__topbar">
          <div className="app-shell__topbar-brand">
            <p>KUMAR BROTHERS &amp; ASSOCIATES</p>
            <span>KB Interiors business suite</span>
          </div>
          <div className="app-shell__topbar-actions">
            {canViewLowStock && notificationsEnabled && <LowStockNotifications />}
            <ProfileMenu userName={currentUserName} userRole={currentUserRole} />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
