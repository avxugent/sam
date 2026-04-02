import { Suspense } from "react";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorChallenge />
    </Suspense>
  );
}

export const metadata = { title: "Two-Factor Authentication – SAM" };
