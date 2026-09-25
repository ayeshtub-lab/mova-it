"use client";

import "./globals.css";
import { ErrorScreen } from "./ErrorScreen";

// Replaces the root layout when it fails, so it brings its own <html> and <body>.
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-background text-foreground">
        <ErrorScreen {...props} />
      </body>
    </html>
  );
}
