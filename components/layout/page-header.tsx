import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  brand: { tile: "bg-primary-tint", icon: "text-primary" },
  info: { tile: "bg-[#eff6ff]", icon: "text-[#1e40af]" },
  neutral: { tile: "bg-muted", icon: "text-muted-foreground" },
} as const;

type PageHeaderProps = {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small back link rendered above the title. */
  back?: { href: string; label: ReactNode };
  tone?: keyof typeof TONES;
};

/** Icon tile + page title + optional subtitle/back link used at the top of dashboard pages. */
export function PageHeader({ icon: Icon, title, subtitle, back, tone = "brand" }: PageHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn("w-9 h-9 rounded-[9px] flex items-center justify-center flex-shrink-0", TONES[tone].tile)}>
        <Icon className={cn("h-4 w-4", TONES[tone].icon)} />
      </div>
      <div className="min-w-0">
        {back && (
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={back.href} className="text-[12px] text-muted-foreground hover:text-primary flex items-center gap-0.5">
              <ChevronLeft className="h-3 w-3" />
              {back.label}
            </Link>
          </div>
        )}
        <h1 className="text-[22px] font-bold text-foreground tracking-[-0.01em] truncate">{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
