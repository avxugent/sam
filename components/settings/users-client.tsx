"use client";

import { useState } from "react";
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

function roleBadge(role: string) {
  if (role === "ADMIN") return <Badge>ADMIN</Badge>;
  if (role === "EDITOR") return <Badge variant="secondary">EDITOR</Badge>;
  return <Badge variant="outline">VIEWER</Badge>;
}

function providerBadge(provider: string) {
  if (provider === "microsoft-entra-id") {
    return (
      <Badge variant="outline" className="text-xs border-blue-300 text-blue-600 bg-blue-50">
        Microsoft SSO
      </Badge>
    );
  }
  return null;
}

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[];
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [users, setUsers] = useState(initialUsers);
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
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const user = await res.json();
    setUsers((prev) => [...prev, user].sort((a, b) => a.name.localeCompare(b.name)));
    setCreateOpen(false);
    createForm.reset({ role: "VIEWER" });
    toast({ title: "User created" });
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
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
    setEditUser(null);
    toast({ title: "User updated" });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast({ title: "User deleted" });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add User</DialogTitle>
            </DialogHeader>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input {...createForm.register("name")} placeholder="Jane Doe" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...createForm.register("email")} type="email" placeholder="jane@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input {...createForm.register("password")} type="password" placeholder="Min 8 characters" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={createRole}
                  onValueChange={(v) => createForm.setValue("role", v as "ADMIN" | "EDITOR" | "VIEWER")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                    <SelectItem value="EDITOR">Editor</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
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
                    Require password change on first login
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="create-2fa-required"
                    checked={createTwoFactorRequired}
                    onCheckedChange={(v) => createForm.setValue("twoFactorRequired", !!v)}
                  />
                  <Label htmlFor="create-2fa-required" className="text-sm font-normal cursor-pointer">
                    Require two-factor authentication
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* User table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Auth</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">2FA</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Created</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium">
                  {user.name}
                  {user.id === currentUserId && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-2.5">{roleBadge(user.role)}</td>
                <td className="px-4 py-2.5">
                  {providerBadge(user.provider) ?? (
                    <span className="text-xs text-muted-foreground">Local</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {user.provider === "credentials" ? (
                    user.totpEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldOff className="h-3.5 w-3.5" />
                        Off
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-2.5">
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
                          className="h-7 w-7"
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
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit User</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
                          <div className="space-y-1.5">
                            <Label>Name</Label>
                            <Input {...editForm.register("name")} />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input {...editForm.register("email")} type="email" />
                          </div>
                          {user.provider === "credentials" && (
                            <div className="space-y-1.5">
                              <Label>New Password</Label>
                              <Input
                                {...editForm.register("password")}
                                type="password"
                                placeholder="Leave blank to keep current"
                              />
                            </div>
                          )}
                          {user.provider !== "credentials" && (
                            <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                              This user authenticates via Microsoft SSO — password cannot be changed here.
                            </p>
                          )}
                          <div className="space-y-1.5">
                            <Label>Role</Label>
                            <Select
                              value={editRole}
                              onValueChange={(v) => editForm.setValue("role", v as "ADMIN" | "EDITOR" | "VIEWER")}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="VIEWER">Viewer</SelectItem>
                                <SelectItem value="EDITOR">Editor</SelectItem>
                                <SelectItem value="ADMIN">Admin</SelectItem>
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
                                  Require two-factor authentication
                                </Label>
                              </div>
                            </div>
                          )}
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                            <Button type="submit" disabled={editForm.formState.isSubmitting}>
                              {editForm.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Save
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
                            title="Disable 2FA for this user"
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
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                const res = await fetch("/api/auth/2fa/disable", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ userId: user.id }),
                                });
                                const data = await res.json();
                                if (!res.ok) {
                                  toast({ title: "Error", description: data.error, variant: "destructive" });
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
                              Disable 2FA
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={user.id === currentUserId}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {user.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete this user account.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(user.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
