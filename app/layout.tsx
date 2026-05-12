import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Medical Literature Research Agent",
  description:
    "An autonomous research agent that searches PubMed, synthesizes findings across papers, and answers clinical questions with verifiable citations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
