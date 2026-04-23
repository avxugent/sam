"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Monitor, Loader2, ShieldCheck, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function TwoFactorChallenge() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (code.replace(/\s/g, "").length === 6) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = code.replace(/\s/g, "");
    if (trimmed.length !== 6) return;

    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Verification failed.");
      setCode("");
      inputRef.current?.focus();
      return;
    }

    // Full navigation forces the browser to re-read the updated session cookie.
    // router.push() is insufficient here because the new Set-Cookie header from
    // the signIn() call inside the verify route may not arrive in time before
    // the proxy checks the session on the next request.
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">SAM</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <ShieldCheck className="h-10 w-10 text-primary" />
            </div>
            <CardTitle>Two-Factor Authentication</CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">Authentication code</Label>
                <Input
                  ref={inputRef}
                  id="code"
                  value={code}
                  onChange={(e) => {
                    // Only allow digits and spaces
                    const v = e.target.value.replace(/[^\d\s]/g, "");
                    if (v.replace(/\s/g, "").length <= 6) setCode(v);
                  }}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={7} // 6 digits + possible space
                />
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || code.replace(/\s/g, "").length !== 6}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out and use a different account
              </Button>
            </form>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Open your authenticator app (Google Authenticator, Aegis, 1Password, etc.)
              and enter the current 6-digit code for SAM.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
