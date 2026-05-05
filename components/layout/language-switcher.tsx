"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { setLocale } from "@/app/actions/locale";
import { locales, localeLabels, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const current = useLocale() as Locale;
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === current || pending) return;
    startTransition(async () => {
      await setLocale(next);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("language")}
          className="h-[34px] px-2 rounded-[6px] gap-1.5 text-[12px] font-medium uppercase text-[#64748b] hover:text-[#0f172a]"
          disabled={pending}
        >
          <Languages className="h-4 w-4" />
          <span>{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => handleSelect(loc)}
            className={cn(
              "flex items-center justify-between cursor-pointer text-[13px]",
              loc === current && "font-medium text-[#1e64c8]"
            )}
          >
            <span>{localeLabels[loc]}</span>
            {loc === current && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
