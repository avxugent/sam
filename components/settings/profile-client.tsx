"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const nameSchema = z.object({
  name: z.string().min(1, "Name is required.").max(128, "Name is too long."),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(128),
  confirmPassword: z.string().min(1, "Please confirm your new password."),
}).superRefine(({ newPassword, confirmPassword }, ctx) => {
  if (newPassword !== confirmPassword) {
    ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});

type NameForm = z.infer<typeof nameSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

type Props = {
  name: string;
  email: string;
  provider: string;
};

export function ProfileClient({ name, email, provider }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const isCredentials = provider === "credentials";

  // ── Name form ──────────────────────────────────────────────────────────────
  const {
    register: registerName,
    handleSubmit: handleNameSubmit,
    formState: { errors: nameErrors },
  } = useForm<NameForm>({ resolver: zodResolver(nameSchema), defaultValues: { name } });

  const [nameSaving, setNameSaving] = useState(false);

  async function onNameSubmit(data: NameForm) {
    setNameSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast({ title: "Error", description: body.error ?? "Failed to update name.", variant: "destructive" });
      } else {
        toast({ title: "Name updated." });
        router.refresh();
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setNameSaving(false);
    }
  }

  // ── Password form ──────────────────────────────────────────────────────────
  const {
    register: registerPw,
    handleSubmit: handlePwSubmit,
    formState: { errors: pwErrors },
    reset: resetPw,
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const [pwSaving, setPwSaving] = useState(false);

  async function onPasswordSubmit(data: PasswordForm) {
    setPwSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        toast({ title: "Error", description: body.error ?? "Failed to update password.", variant: "destructive" });
      } else {
        toast({ title: "Password updated." });
        resetPw();
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display name</CardTitle>
          <CardDescription>This name is shown in the navigation bar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleNameSubmit(onNameSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                {...registerName("name")}
                className={cn(nameErrors.name && "border-destructive")}
                autoComplete="name"
              />
              {nameErrors.name && (
                <p className="text-xs text-destructive">{nameErrors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email address cannot be changed here.</p>
            </div>
            <Button type="submit" disabled={nameSaving}>
              {nameSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save name
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password — credentials users only */}
      {isCredentials && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>Provide your current password to set a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePwSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">
                  Current password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  {...registerPw("currentPassword")}
                  className={cn(pwErrors.currentPassword && "border-destructive")}
                  autoComplete="current-password"
                />
                {pwErrors.currentPassword && (
                  <p className="text-xs text-destructive">{pwErrors.currentPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">
                  New password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  {...registerPw("newPassword")}
                  className={cn(pwErrors.newPassword && "border-destructive")}
                  autoComplete="new-password"
                />
                {pwErrors.newPassword && (
                  <p className="text-xs text-destructive">{pwErrors.newPassword.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">
                  Confirm new password <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  {...registerPw("confirmPassword")}
                  className={cn(pwErrors.confirmPassword && "border-destructive")}
                  autoComplete="new-password"
                />
                {pwErrors.confirmPassword && (
                  <p className="text-xs text-destructive">{pwErrors.confirmPassword.message}</p>
                )}
              </div>
              <Button type="submit" disabled={pwSaving}>
                {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!isCredentials && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Your account is managed via SSO. Password changes are not available here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
