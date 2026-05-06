"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";

const createSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  mustChangePassword: z.boolean().default(true),
  twoFactorRequired: z.boolean().default(false),
});

const editSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email().max(255),
  password: z.string().max(128).optional(),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  twoFactorRequired: z.boolean().optional(),
});

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  provider: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  twoFactorRequired: boolean;
  createdAt: Date | string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

function RolePill({ role }: { role: string }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#fef3c7] text-[#92400e]">
        ADMIN
      </span>
    );
  }
  if (role === "EDITOR") {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#e8f0fc] text-[#1e64c8]">
        EDITOR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#f1f5f9] text-[#64748b]">
      VIEWER
    </span>
  );
}

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const { toast } = useToast();
  const [users, setUsers] = useState(initialUsers);
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  const createForm = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "VIEWER" as const, mustChangePassword: true, twoFactorRequired: false },
  });
  const editForm = useForm({ resolver: zodResolver(editSchema) });

  const createRole = useWatch({ control: createForm.control, name: "role" });
  const createMustChangePassword = useWatch({ control: createForm.control, name: "mustChangePassword" });
  const createTwoFactorRequired = useWatch({ control: createForm.control, name: "twoFactorRequired" });
  const editRole = useWatch({ control: editForm.control, name: "role" });
  const editTwoFactorRequired = useWatch({ control: editForm.control, name: "twoFactorRequired" });

  async function handleCreate(data: z.infer<typeof createSchema>) {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const user = await res.json();
    setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
    setCreateOpen(false);
    createForm.reset({ role: "VIEWER" });
    toast({ title: t("userCreated") });
  }

  async function handleEdit(data: z.infer<typeof editSchema>) {
    if (!editUser) return;
    const payload: Record<string, unknown> = { name: data.name, email: data.email, role: data.role };
    if (data.password) payload.password = data.password;
    if (data.twoFactorRequired !== undefined) payload.twoFactorRequired = data.twoFactorRequired;

    const res = await fetch(`/api/users/${editUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
    setEditUser(null);
    toast({ title: t("userUpdated") });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast({ title: t("userDeleted") });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-[#0f172a]">{t("title")}</h2>
          <p className="text-[12.5px] text-[#64748b]">{t("subtitle")}</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-[36px] px-4 rounded-[7px] bg-[#ffd200] text-[#0f172a] font-bold hover:brightness-95 text-[13px]">
              <Plus className="h-4 w-4 mr-1" />
              {t("addUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("createUser")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-create-name">
                  {tField("name")} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input id="user-create-name" required aria-required="true" autoComplete="name" {...createForm.register("name")} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-create-email">
                  {tField("email")} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input id="user-create-email" required aria-required="true" autoComplete="email" {...createForm.register("email")} type="email" placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-create-password">
                  {tField("password")} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <Input id="user-create-password" required aria-required="true" autoComplete="new-password" {...createForm.register("password")} type="password" placeholder={t("passwordPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-create-role">{tField("role")}</Label>
                <Select
                  value={createRole}
                  onValueChange={(v) => createForm.setValue("role", v as "ADMIN" | "EDITOR" | "VIEWER")}
                >
                  <SelectTrigger id="user-create-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">{t("rolesViewer")}</SelectItem>
                    <SelectItem value="EDITOR">{t("rolesEditor")}</SelectItem>
                    <SelectItem value="ADMIN">{t("rolesAdmin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Security options</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-must-change-password"
                    checked={createMustChangePassword}
                    onCheckedChange={(v) => createForm.setValue("mustChangePassword", !!v)}
                  />
                  <Label htmlFor="create-must-change-password" className="text-sm font-normal cursor-pointer">
                    {t("mustChangePassword")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-2fa-required"
                    checked={createTwoFactorRequired}
                    onCheckedChange={(v) => createForm.setValue("twoFactorRequired", !!v)}
                  />
                  <Label htmlFor="create-2fa-required" className="text-sm font-normal cursor-pointer">
                    {t("twoFactorRequired")}
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{tCommon("cancel")}</Button>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {tCommon("create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* User table */}
      <div className="border border-[#e2e8f0] rounded-[10px] overflow-x-auto bg-white">
        <table className="w-full min-w-[720px] text-[13px]">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("name")}</th>
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("email")}</th>
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("role")}</th>
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("provider")}</th>
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("twoFactor")}</th>
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{tField("created")}</th>
              <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{tCommon("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] transition-colors">
                <td className="px-4 py-[10px]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#1e64c8] text-white text-[10.5px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(user.name)}
                    </div>
                    <span className="font-medium text-[13px] text-[#0f172a]">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-[11px] text-[#64748b] font-normal">(you)</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-[10px] text-[#64748b]">{user.email}</td>
                <td className="px-4 py-[10px]"><RolePill role={user.role} /></td>
                <td className="px-4 py-[10px] text-[12px] text-[#64748b]">
                  {user.provider === "microsoft-entra-id" ? t("providerEntra") : t("providerCredentials")}
                </td>
                <td className="px-4 py-[10px]">
                  {user.provider === "credentials" ? (
                    user.totpEnabled ? (
                      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#dcfce7] text-[#16a34a]">
                        {t("active")}
                      </span>
                    ) : (
                      <span className="text-[#64748b]">—</span>
                    )
                  ) : (
                    <span className="text-[#64748b]">—</span>
                  )}
                </td>
                <td className="px-4 py-[10px] text-[#64748b] text-[12px]">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-[10px]">
                  <div className="flex justify-end gap-1">
                    {/* Edit */}
                    <Dialog
                      open={editUser?.id === user.id}
                      onOpenChange={(open) => { if (!open) setEditUser(null); }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-[#e2e8f0] rounded-md bg-[#f8fafc] hover:bg-white"
                          title={t("editUser")}
                          onClick={() => {
                            setEditUser(user);
                            editForm.reset({
                              name: user.name,
                              email: user.email,
                              role: user.role as "ADMIN" | "EDITOR" | "VIEWER",
                              password: "",
                              twoFactorRequired: user.twoFactorRequired,
                            });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#1e64c8]" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("editUser")}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
                          <div className="space-y-1.5">
                            <Label htmlFor={`user-edit-name-${user.id}`}>{tField("name")}</Label>
                            <Input id={`user-edit-name-${user.id}`} autoComplete="name" {...editForm.register("name")} />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`user-edit-email-${user.id}`}>{tField("email")}</Label>
                            <Input id={`user-edit-email-${user.id}`} autoComplete="email" {...editForm.register("email")} type="email" />
                          </div>
                          {user.provider === "credentials" && (
                            <div className="space-y-1.5">
                              <Label htmlFor={`user-edit-password-${user.id}`}>{tField("password")}</Label>
                              <Input
                                id={`user-edit-password-${user.id}`}
                                autoComplete="new-password"
                                {...editForm.register("password")}
                                type="password"
                                placeholder={t("passwordPlaceholder")}
                              />
                            </div>
                          )}
                          {user.provider !== "credentials" && (
                            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                              This user authenticates via Microsoft SSO — password cannot be changed here.
                            </p>
                          )}
                          <div className="space-y-1.5">
                            <Label htmlFor={`user-edit-role-${user.id}`}>{tField("role")}</Label>
                            <Select
                              value={editRole}
                              onValueChange={(v) => editForm.setValue("role", v as "ADMIN" | "EDITOR" | "VIEWER")}
                            >
                              <SelectTrigger id={`user-edit-role-${user.id}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="VIEWER">{t("rolesViewer")}</SelectItem>
                                <SelectItem value="EDITOR">{t("rolesEditor")}</SelectItem>
                                <SelectItem value="ADMIN">{t("rolesAdmin")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {user.provider === "credentials" && (
                            <div className="space-y-2 rounded-lg border p-3">
                              <p className="text-xs font-medium text-muted-foreground">Security options</p>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`edit-2fa-required-${user.id}`}
                                  checked={editTwoFactorRequired ?? false}
                                  onCheckedChange={(v) => editForm.setValue("twoFactorRequired", !!v)}
                                />
                                <Label htmlFor={`edit-2fa-required-${user.id}`} className="text-sm font-normal cursor-pointer">
                                  {t("twoFactorRequired")}
                                </Label>
                              </div>
                            </div>
                          )}
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>{tCommon("cancel")}</Button>
                            <Button type="submit" disabled={editForm.formState.isSubmitting}>
                              {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {tCommon("save")}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>

                    {/* Disable 2FA (admin override — no code required) */}
                    {user.provider === "credentials" && user.totpEnabled && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-600 hover:text-amber-700"
                            title={t("twoFactor")}
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disable 2FA for {user.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This admin override disables two-factor authentication for this
                              user without requiring their TOTP code. Use this when a user has
                              lost access to their authenticator app.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                const res = await fetch("/api/auth/2fa/disable", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ userId: user.id }),
                                });
                                const data = await res.json();
                                if (!res.ok) {
                                  toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
                                } else {
                                  setUsers((prev) =>
                                    prev.map((u) =>
                                      u.id === user.id ? { ...u, totpEnabled: false } : u
                                    )
                                  );
                                  toast({ title: "2FA disabled for " + user.name });
                                }
                              }}
                            >
                              {t("twoFactor")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Delete */}
                    {user.id !== currentUserId && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-[#fecaca] rounded-md text-[#ef4444] hover:bg-red-50"
                          title={t("deleteUser")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("deleteConfirmTitle", { name: user.name })}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("deleteConfirmDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(user.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {tCommon("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
