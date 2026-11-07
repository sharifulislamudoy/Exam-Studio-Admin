import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Exam Studio — Teacher",
  description: "Personal classroom exam and homework dashboard",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body>{children}</body>
    </html>
  );
}
