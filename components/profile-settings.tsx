"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";
import { LOW_STOCK_NOTIFICATIONS_KEY, UI_PREFERENCES_CHANGED_EVENT } from "@/lib/ui-preferences";

type Props = {
  initialName: string;
  initialEmail: string;
  role: string;
};

function roleLabel(role: string) {
  if (role === "ADMIN") return "Administrator";
  if (role === "MANAGER") return "Manager";
  if (role === "CASHIER") return "Staff";
  return role;
}

export function ProfileSettings({ initialName, initialEmail, role }: Props) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [lowStockNotifications, setLowStockNotifications] = useState(true);
  const { update } = useSession();
  const router = useRouter();

  useEffect(() => {
    setLowStockNotifications(localStorage.getItem(LOW_STOCK_NOTIFICATIONS_KEY) !== "false");
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("");
    setProfileError("");
    setSavingProfile(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to update your profile.");

      setName(data.name);
      setEmail(data.email);
      try {
        await update();
        router.refresh();
        setProfileMessage("Your profile has been updated.");
      } catch {
        setProfileMessage("Your profile was saved. Refresh the page to update the header.");
      }
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Unable to update your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to change your password.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Your password has been changed.");
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : "Unable to change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  function updateLowStockPreference(enabled: boolean) {
    setLowStockNotifications(enabled);
    localStorage.setItem(LOW_STOCK_NOTIFICATIONS_KEY, String(enabled));
    window.dispatchEvent(new Event(UI_PREFERENCES_CHANGED_EVENT));
  }

  return (
    <div className="settings-layout">
      <section id="profile" className="settings-card">
        <div className="settings-card__heading">
          <div className="settings-avatar" aria-hidden="true">
            {name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "U"}
          </div>
          <div>
            <h2>Profile</h2>
            <p>{roleLabel(role)} account details</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={(event) => void saveProfile(event)}>
          <label>
            Full name
            <input autoComplete="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Email address
            <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {profileError && <p className="settings-message settings-message--error" role="alert">{profileError}</p>}
          {profileMessage && <p className="settings-message" role="status">{profileMessage}</p>}
          <button type="submit" className="settings-submit" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>

      <section id="security" className="settings-card">
        <div className="settings-card__heading">
          <div>
            <h2>Security</h2>
            <p>Change your account password</p>
          </div>
        </div>
        <form className="settings-form" onSubmit={(event) => void changePassword(event)}>
          <label>
            Current password
            <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <div className="settings-form__row">
            <label>
              New password
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </label>
            <label>
              Confirm new password
              <input type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </label>
          </div>
          <p className="settings-hint">Use at least 8 characters. Your current password is required to confirm this change.</p>
          {passwordError && <p className="settings-message settings-message--error" role="alert">{passwordError}</p>}
          {passwordMessage && <p className="settings-message" role="status">{passwordMessage}</p>}
          <button type="submit" className="settings-submit" disabled={savingPassword}>
            {savingPassword ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>

      <section id="preferences" className="settings-card">
        <div className="settings-card__heading">
          <div>
            <h2>Preferences</h2>
            <p>Choose which alerts appear in your header</p>
          </div>
        </div>
        <label className="settings-toggle">
          <span>
            <strong>Low-stock notifications</strong>
            <small>Show alerts for products at or below minimum stock in the active unit.</small>
          </span>
          <input
            type="checkbox"
            checked={lowStockNotifications}
            onChange={(event) => updateLowStockPreference(event.target.checked)}
          />
        </label>
        <p className="settings-hint">This preference is saved in this browser.</p>
      </section>

      <section id="system" className="settings-card settings-card--system">
        <div className="settings-card__heading">
          <div>
            <h2>Workspace settings</h2>
            <p>Choose which business unit is active for your work</p>
          </div>
        </div>
        <BusinessUnitSwitcher />
        <p className="settings-hint">System-wide business and tax settings are managed by an authorized administrator.</p>
      </section>
    </div>
  );
}
