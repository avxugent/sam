"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-semibold">{tCommon("somethingWentWrong")}</h2>
      <p className="text-muted-foreground">{tCommon("unexpectedError")}</p>
      <Button onClick={reset}>{tCommon("tryAgain")}</Button>
    </div>
  );
}
