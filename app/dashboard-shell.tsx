"use client";

import { useRef, useState, type ReactNode } from "react";
import type { UserView } from "./contracts";
import { Button } from "./ui";

const navigation = {
  overview: { label: "সারসংক্ষেপ", shortLabel: "সারসংক্ষেপ", icon: "home" },
  assessments: {
    label: "পরীক্ষা ও হোমওয়ার্ক",
    shortLabel: "পরীক্ষা ও কাজ",
    icon: "clipboard",
  },
  students: { label: "শিক্ষার্থী", shortLabel: "শিক্ষার্থী", icon: "users" },
  review: { label: "নম্বর ও ফলাফল", shortLabel: "ফলাফল", icon: "chart" },
} as const;

export type DashboardTab = keyof typeof navigation;
const tabs = Object.keys(navigation) as DashboardTab[];

const iconPaths = {
  school: "M2 10l10-5 10 5-10 5-10-5z M6 12v5c3 3 9 3 12 0v-5 M22 10v6",
  home: "M3 10l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 21v-7h6v7",
  clipboard: "M9 5H6a2 2 0 0 0-2 2v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a2 2 0 0 0-2-2h-3 M9 3h6v4H9z M8 12h8 M8 16h6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-4 M15 3a4 4 0 0 1 0 8 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  chart: "M3 3v18h18 M8 16v-4 M13 16V8 M18 16V5",
  person: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M18 6 6 18",
  logout: "M10 4H5v16h5 M9 12h12 M17 8l4 4-4 4",
} as const;

export function DashboardIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg
      aria-hidden="true"
      className="dashboard-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function DashboardShell({
  teacher,
  tab,
  onTabChange,
  onCreate,
  onLogout,
  children,
}: {
  teacher: UserView;
  tab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  onCreate: () => void;
  onLogout: () => Promise<void>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    setSigningOut(true);
    setLogoutError("");
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "লগআউট করা যায়নি।",
      );
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="studio-topbar">
        <div className="studio-topbar-inner">
          <button
            type="button"
            className="studio-brand"
            onClick={() => onTabChange("overview")}
          >
            <span className="studio-brand-mark">
              <DashboardIcon name="school" />
            </span>
            <span>
              <strong>Exam Studio</strong>
              <small>Teacher Dashboard</small>
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="প্রোফাইল খুলুন"
            aria-haspopup="dialog"
            onClick={() => {
              setLogoutError("");
              dialog.current?.showModal();
            }}
          >
            <DashboardIcon name="person" />
          </button>
        </div>
      </header>

      <div className="studio-layout">
        <nav className="studio-nav" aria-label="ড্যাশবোর্ড মেনু">
          {tabs.map((id) => {
            const { icon, label, shortLabel } = navigation[id];
            return (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? "page" : undefined}
                aria-label={label}
                onClick={() => onTabChange(id)}
              >
                <span className="nav-icon">
                  <DashboardIcon name={icon} />
                </span>
                <span className="nav-label">{label}</span>
                <span className="nav-label-short" aria-hidden="true">
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </nav>

        <main key={tab} className="studio-main">
          <header
            className={tab === "overview" ? "pagehead dashboard-hero" : "pagehead"}
          >
            <div>
              {tab === "overview" && (
                <p className="hero-tag">Teacher Workspace</p>
              )}
              <h1>{navigation[tab].label}</h1>
              <p className="muted">
                {tab === "overview"
                  ? `স্বাগতম, ${teacher.name}। পরীক্ষা, হোমওয়ার্ক ও ফলাফল এক জায়গায় পরিচালনা করুন।`
                  : "পরীক্ষা ও হোমওয়ার্কের সময় নির্ধারণে বাংলাদেশ সময় ব্যবহার করুন।"}
              </p>
            </div>
            {tab !== "students" && (
              <Button onClick={onCreate}>
                <DashboardIcon name="plus" />
                নতুন পরীক্ষা / হোমওয়ার্ক
              </Button>
            )}
          </header>
          {children}
        </main>
      </div>

      <dialog
        ref={dialog}
        className="profile-drawer"
        aria-labelledby="teacher-profile-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <section className="drawer-content">
          <header className="drawer-heading">
            <h2 id="teacher-profile-title">আমার প্রোফাইল</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="প্রোফাইল বন্ধ করুন"
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              <DashboardIcon name="close" />
            </button>
          </header>
          <div className="teacher-card">
            <span className="teacher-avatar">
              <DashboardIcon name="person" />
            </span>
            <span className="teacher-role">শিক্ষক</span>
            <strong>{teacher.name}</strong>
            <small>{teacher.email}</small>
          </div>
          {logoutError && (
            <p className="error" role="alert">{logoutError}</p>
          )}
          <Button
            secondary
            className="drawer-logout"
            onClick={() => void logout()}
            disabled={signingOut}
          >
            <DashboardIcon name="logout" />
            {signingOut ? "লগআউট হচ্ছে…" : "লগআউট"}
          </Button>
        </section>
      </dialog>
    </>
  );
}
