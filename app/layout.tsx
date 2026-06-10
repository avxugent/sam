import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { AppBackground } from "@/components/layout/app-background";
import { prisma } from "@/lib/prisma";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["app.title", "branding.faviconStorageKey"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const appTitle = map["app.title"] || "SAM";
  const hasFavicon = !!map["branding.faviconStorageKey"];

  return {
    title: {
      default: `${appTitle} – Simple Asset Management`,
      template: `%s – ${appTitle}`,
    },
    description: "Manage AV hardware assets across your facilities",
    ...(hasFavicon
      ? { icons: [{ rel: "icon", url: "/api/branding/favicon" }] }
      : {}),
  };
}

// Runs synchronously before hydration to prevent flash of wrong theme
const themeScript = `(function(){var t=localStorage.getItem('sam-theme')||'light';if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  const bgSetting = await prisma.appSetting.findUnique({
    where: { key: "branding.backgroundMode" },
  });
  const backgroundMode = bgSetting?.value ?? "";

  return (
    <html lang={locale} translate="no" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased">
        {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
            <Toaster />
          </NextIntlClientProvider>
        </ThemeProvider>
        <AppBackground backgroundMode={backgroundMode} />
      </body>
    </html>
  );
}
