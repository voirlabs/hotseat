"use client";

import { APP_NAME } from "@/lib/site";

// Last-resort error page, shown when the root layout itself fails. It renders
// its own <html> and inline styles because the app's layout and CSS may be the
// part that broke.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#080809", color: "#f3f1ed" }}>
        <main role="alert" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, letterSpacing: 0, color: "#8f8799" }}>{APP_NAME}</p>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 44, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "20px 0 16px" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 32px", maxWidth: 384, fontSize: 15, lineHeight: 1.6, color: "#b3acbc" }}>
            This page couldn&apos;t load. It&apos;s usually temporary, so try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ minHeight: 44, padding: "10px 24px", border: "none", borderRadius: 10, background: "#f2f0ed", color: "#151417", font: "500 14px system-ui, sans-serif", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
