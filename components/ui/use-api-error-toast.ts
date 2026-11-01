"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import type { ApiErrorBody } from "@/lib/api-client";
import { apiErrorMessage } from "@/lib/api-client";

/**
 * The standard toast for a failed API call: "Error" with the server's message
 * (and any details), or the generic "Something went wrong." when the response
 * had no message (a network failure or a body-less 500). The returned function
 * keeps one identity across renders, so loaders can list it as an effect
 * dependency without re-running.
 */
export function useApiErrorToast(): (error: ApiErrorBody) => void {
  const { toast } = useToast();
  const tCommon = useTranslations("common");
  const latest = useRef({ toast, tCommon });
  useLayoutEffect(() => {
    latest.current = { toast, tCommon };
  });
  return useCallback((error: ApiErrorBody) => {
    const { toast, tCommon } = latest.current;
    toast({ title: tCommon("error"), description: apiErrorMessage(error, tCommon("somethingWentWrong")), variant: "destructive" });
  }, []);
}
