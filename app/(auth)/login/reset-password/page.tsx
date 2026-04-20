import { ResetPasswordClient } from "@/components/auth/reset-password-client";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token ?? ""} />;
}

export const metadata = { title: "Reset password – SAM" };
