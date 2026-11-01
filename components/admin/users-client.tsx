"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Role } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn, getInitials } from "@/lib/utils";
import { formatDate, toIsoDay } from "@/lib/dates";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, Loader2, ShieldOff, Download } from "lucide-react";
import { SortableTh } from "@/components/ui/sortable-th";
import { createUserSchema, editUserFormSchema } from "@/lib/schemas/user";
import { apiFetch, jsonBody, downloadFile } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";
import { useServerList } from "@/components/admin/use-server-list";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  provider: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  twoFactorRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type SortCol = "name" | "email" | "role" | "twoFactor" | "lastLoginAt" | "createdAt";

function RolePill({ role }: { role: Role }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#fef3c7] text-[#92400e]">
        ADMIN
      </span>
    );
  }
  if (role === "MAINTAINER") {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#f3e8ff] text-[#7e22ce]">
        MAINTAINER
      </span>
    );
  }
  if (role === "EDITOR") {
    return (
      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-primary-tint text-primary">
        EDITOR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-muted text-muted-foreground">
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
  const tAuth = useTranslations("auth");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [users, applyChange] = useServerList(initialUsers);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let av = "", bv = "";
      if (sortCol === "name") { av = a.name; bv = b.name; }
      else if (sortCol === "email") { av = a.email; bv = b.email; }
      else if (sortCol === "role") { av = a.role; bv = b.role; }
      else if (sortCol === "twoFactor") { av = String(a.totpEnabled ?? false); bv = String(b.totpEnabled ?? false); }
      else if (sortCol === "lastLoginAt") { av = a.lastLoginAt ?? ""; bv = b.lastLoginAt ?? ""; }
      else if (sortCol === "createdAt") { av = a.createdAt; bv = b.createdAt; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [users, sortCol, sortDir]);

  const createForm = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: "VIEWER" as const, mustChangePassword: true, twoFactorRequired: false },
  });
  const editForm = useForm({ resolver: zodResolver(editUserFormSchema) });

  const createRole = useWatch({ control: createForm.control, name: "role" });
  const createMustChangePassword = useWatch({ control: createForm.control, name: "mustChangePassword" });
  const createTwoFactorRequired = useWatch({ control: createForm.control, name: "twoFactorRequired" });
  const editRole = useWatch({ control: editForm.control, name: "role" });
  const editTwoFactorRequired = useWatch({ control: editForm.control, name: "twoFactorRequired" });

  async function handleCreate(data: z.output<typeof createUserSchema>) {
    const res = await apiFetch<User>("/api/users", jsonBody("POST", data));
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const user = res.data;
    applyChange((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
    setCreateOpen(false);
    createForm.reset(); // back to defaultValues, flags included
    toast({ title: t("userCreated") });
  }

  async function handleEdit(data: z.output<typeof editUserFormSchema>) {
    if (!editUser) return;
    const payload: Record<string, unknown> = { name: data.name, email: data.email, role: data.role };
    if (data.password) payload.password = data.password;
    if (data.twoFactorRequired !== undefined) payload.twoFactorRequired = data.twoFactorRequired;

    const res = await apiFetch<User>(`/api/users/${editUser.id}`, jsonBody("PUT", payload));
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const updated = res.data;
    applyChange((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
    setEditUser(null);
    toast({ title: t("userUpdated") });
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    applyChange((prev) => prev.filter((u) => u.id !== id));
    toast({ title: t("userDeleted") });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-foreground">{t("title")}</h2>
          <p className="text-[12.5px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="h-[36px] px-4 rounded-[7px] text-[13px]"
          onClick={async () => {
            if (!(await downloadFile("/api/users/export", `sam-users-${toIsoDay(new Date())}.csv`))) {
              toast({ title: tCommon("error"), variant: "destructive" });
            }
          }}
        >
          <Download className="h-4 w-4 mr-1" />
          {t("exportCsv")}
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="h-[36px] px-4 rounded-[7px] bg-brand-yellow text-[#0f172a] font-bold hover:brightness-95 text-[13px]">
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
                <Input
                  id="user-create-password"
                  required
                  aria-required="true"
                  autoComplete="new-password"
                  {...createForm.register("password")}
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  className={cn(createForm.formState.errors.password && "border-destructive")}
                />
                {createForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{tAuth("passwordTooShort")}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-create-role">{tField("role")}</Label>
                <Select
                  value={createRole}
                  onValueChange={(v) => createForm.setValue("role", v as Role)}
                >
                  <SelectTrigger id="user-create-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">{t("rolesViewer")}</SelectItem>
                    <SelectItem value="EDITOR">{t("rolesEditor")}</SelectItem>
                    <SelectItem value="MAINTAINER">{t("rolesMaintainer")}</SelectItem>
                    <SelectItem value="ADMIN">{t("rolesAdmin")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("securityOptions")}</p>
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
      </div>

      <div className="border border-border rounded-[10px] overflow-x-auto bg-card">
        <table className="w-full min-w-[720px] text-[13px]">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-border bg-background">
              <SortableTh col="name" label={t("name")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="email" label={t("email")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="role" label={t("role")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap">{t("provider")}</th>
              <SortableTh col="twoFactor" label={t("twoFactor")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="lastLoginAt" label={t("lastLogin")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="createdAt" label={tField("created")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap">{tCommon("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-background transition-colors">
                <td className="px-4 py-[10px]">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary text-white text-[10.5px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(user.name)}
                    </div>
                    <span className="font-medium text-[13px] text-foreground">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">{t("you")}</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-[10px] text-muted-foreground">{user.email}</td>
                <td className="px-4 py-[10px]"><RolePill role={user.role} /></td>
                <td className="px-4 py-[10px] text-[12px] text-muted-foreground">
                  {user.provider === "microsoft-entra-id" ? t("providerEntra") : t("providerCredentials")}
                </td>
                <td className="px-4 py-[10px]">
                  {user.provider === "credentials" ? (
                    user.totpEnabled ? (
                      <span className="inline-flex items-center text-[11px] font-semibold px-[9px] py-[2px] rounded-[5px] bg-[#dcfce7] text-[#16a34a]">
                        {t("active")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-[10px] text-muted-foreground text-[12px]">
                  {user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}
                </td>
                <td className="px-4 py-[10px] text-muted-foreground text-[12px]">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-[10px]">
                  <div className="flex justify-end gap-1">
                    <Dialog
                      open={editUser?.id === user.id}
                      onOpenChange={(open) => { if (!open) setEditUser(null); }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card"
                          title={t("editUser")}
                          onClick={() => {
                            setEditUser(user);
                            editForm.reset({
                              name: user.name,
                              email: user.email,
                              role: user.role,
                              password: "",
                              twoFactorRequired: user.twoFactorRequired,
                            });
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-primary" />
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
                                className={cn(editForm.formState.errors.password && "border-destructive")}
                              />
                              {editForm.formState.errors.password && (
                                <p className="text-xs text-destructive">{tAuth("passwordTooShort")}</p>
                              )}
                            </div>
                          )}
                          {user.provider !== "credentials" && (
                            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                              {t("ssoPasswordNotice")}
                            </p>
                          )}
                          <div className="space-y-1.5">
                            <Label htmlFor={`user-edit-role-${user.id}`}>{tField("role")}</Label>
                            <Select
                              value={editRole}
                              onValueChange={(v) => editForm.setValue("role", v as Role)}
                            >
                              <SelectTrigger id={`user-edit-role-${user.id}`}><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="VIEWER">{t("rolesViewer")}</SelectItem>
                                <SelectItem value="EDITOR">{t("rolesEditor")}</SelectItem>
                                <SelectItem value="MAINTAINER">{t("rolesMaintainer")}</SelectItem>
                                <SelectItem value="ADMIN">{t("rolesAdmin")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {user.provider === "credentials" && (
                            <div className="space-y-2 rounded-lg border p-3">
                              <p className="text-xs font-medium text-muted-foreground">{t("securityOptions")}</p>
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
                            <AlertDialogTitle>{t("disable2faTitle", { name: user.name })}</AlertDialogTitle>
                            <AlertDialogDescription>{t("disable2faDescription")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                const res = await apiFetch("/api/auth/2fa/disable", jsonBody("POST", { userId: user.id }));
                                if (!res.ok) {
                                  showApiError(res.error);
                                } else {
                                  applyChange((prev) =>
                                    prev.map((u) =>
                                      u.id === user.id ? { ...u, totpEnabled: false } : u
                                    )
                                  );
                                  toast({ title: t("twoFactorDisabledFor", { name: user.name }) });
                                }
                              }}
                            >
                              {t("twoFactor")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {user.id !== currentUserId && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-[#fecaca] rounded-md text-destructive hover:bg-red-50"
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
