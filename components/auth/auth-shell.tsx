import { Monitor } from "lucide-react";

/**
 * The centered, branded frame around the sign-in and first-run pages (login,
 * its forced steps and 2FA challenge, setup). Rendered by their layouts, which
 * read the branding, so every page the user sees before the app looks the same.
 */
export function AuthShell({
  appTitle,
  logoUrl,
  children,
}: {
  appTitle: string;
  logoUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain flex-shrink-0" />
          ) : (
            <Monitor className="h-8 w-8 text-primary flex-shrink-0" />
          )}
          <span className="text-2xl font-bold">{appTitle}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
