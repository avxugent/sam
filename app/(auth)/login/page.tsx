import { LoginClient } from "@/components/auth/login-client";
import { ssoEnabled } from "@/lib/auth";

export default function LoginPage() {
  return <LoginClient ssoEnabled={ssoEnabled} />;
}

export const metadata = { title: "Sign in – SAM" };
