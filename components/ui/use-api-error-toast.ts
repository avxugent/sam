"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { apiErrorMessage } from "@/lib/utils";
import type { ApiErrorBody } from "@/lib/api-client";

/**
 * The standard toast for a failed API call: "Error" with the server's message
 * (and any details), or the generic "Something went wrong." when the response
 * had no message (a network failure or a body-less 500).
 */
export function useApiErrorToast(): (error: ApiErrorBody) => void {
  const { toast } = useToast();
  const tCommon = useTranslations("common");
  return useCallback(
    (error: ApiErrorBody) =>
      toast({ title: tCommon("error"), description: apiErrorMessage(error, tCommon("somethingWentWrong")), variant: "destructive" }),
    [toast, tCommon]
  );
}
