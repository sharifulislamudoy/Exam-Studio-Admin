"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  secondary = false,
  danger = false,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      {...p}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""} ${p.className || ""}`}
    />
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Status({ children }: { children: ReactNode }) {
  return <span className="status">{children}</span>;
}
export function Panel({ children }: { children: ReactNode }) {
  return <section className="panel">{children}</section>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="backdrop"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <Button secondary onClick={onClose}>
            বন্ধ করুন
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
