import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PortfolioSignal",
  description:
    "Portfolio-aware finance frontend MVP for AI analysis and personalized market news.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
