import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldAlert, SlidersHorizontal, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetPurchaseRequests, apiGetRoles, apiGetUsers, apiUpdateUser, type RoleRecord, type UserRecord, type UserTier } from "@/lib/api";
import { MODULE_LABELS, TOGGLEABLE_MODULES, type ModuleKey } from "@/lib/modules";
import { useCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Management — DOST Caraga" },
      { name: "description", content: "Superadmin: manage accounts, tiers, and per-user module access." },
    ],
  }),
  component: UsersPage,
});

const TIERS: { value: UserTier; label: string; desc: string }[] = [
  { value: "superadmin", label: "Superadmin", desc: "Full access + user management" },
  { value: "admin", label: "Admin (Supply)", desc: "All modules except user management" },
  { value: "regular", label: "Regular", desc: "Only the modules you grant below" },
];

const STATUSES = ["Active", "Pending", "Deactivated"] as const;

const tierBadge: Record<UserTier, string> = {
  superadmin: "bg-destructive/10 text-destructive border-destructive/30",
  admin: "bg-primary/10 text-primary border-primary/30",
  regular: "bg-secondary text-navy border-border",
};

// Mirror of the backend User::effectiveModules() so the preview matches exactly.
const ALL_MODULES: ModuleKey[] = ["dashboard", "pr", "lib", "ppmp", "rfq", "validation", "approvals", "references", "reports", "users", "audit", "settings"];
function effectiveModules(tier: UserTier, granted: string[]): ModuleKey[] {
  if (tier === "superadmin") return ALL_MODULES;
  if (tier === "admin") return ALL_MODULES.filter((m) => m !== "users");
  return ["dashboard", ...TOGGLEABLE_MODULES.filter((m) => granted.includes(m))];
}

function UsersPage() {
  const { user: me } = useCurrentUser();
  const qc = useQueryClient();
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ["users"], queryFn: apiGetUsers });
  const { data: roles = [], isLoading: rolesLoading } = useQuery({ queryKey: ["roles"], queryFn: apiGetRoles });
  const { data: prs = [] } = useQuery({ queryKey: ["purchase-requests"], queryFn: apiGetPurchaseRequests });

  const [editing, setEditing] = useState<UserRecord | null>(null);

  // Defensive guard (the route is already Superadmin-gated by ModuleGuard).
  if (me && me.tier !== "superadmin") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <ShieldAlert className="mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-navy">Superadmin only</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">Only the Superadmin can manage users and their module access.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Administration"
        title="User & Access Management"
        subtitle="Set each account's tier and choose exactly which modules they can use."
      />

      <Tabs defaultValue="users">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="overflow-hidden border border-border bg-card">
            <Table>
              <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
                <TableHead className="label-eyebrow">Name</TableHead>
                <TableHead className="label-eyebrow">Email</TableHead>
                <TableHead className="label-eyebrow">Office</TableHead>
                <TableHead className="label-eyebrow">Tier</TableHead>
                <TableHead className="label-eyebrow">Roles</TableHead>
                <TableHead className="label-eyebrow">Modules</TableHead>
                <TableHead className="label-eyebrow">Status</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow></TableHeader>
              <TableBody>
                {usersLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold text-navy">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>{u.office}</TableCell>
                    <TableCell>
                      <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", tierBadge[u.tier])}>
                        {u.tier}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-xs text-muted-foreground">{u.roles.join(", ") || "—"}</TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {u.tier === "regular" ? `${u.accessModules.filter((m) => m !== "dashboard").length} modules` : "All modules"}
                      </span>
                    </TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(u)}>
                        <SlidersHorizontal className="h-3.5 w-3.5" /> Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rolesLoading && <Card className="border border-border bg-card p-5 text-sm text-muted-foreground">Fetching data, kindly wait.</Card>}
            {roles.map((r) => (
              <Card key={r.name} className="border border-border bg-card p-5">
                <p className="label-eyebrow">Role</p>
                <h3 className="mt-1 text-lg font-bold text-navy">{r.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
                <div className="mt-4">
                  <p className="label-eyebrow mb-2">Permissions</p>
                  <ul className="space-y-1.5">
                    {r.perms.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-sm text-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <ManageAccessDialog
        user={editing}
        roles={roles}
        prs={prs}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["users"] });
          setEditing(null);
        }}
      />
    </div>
  );
}

function ManageAccessDialog({
  user,
  roles,
  prs,
  onOpenChange,
  onSaved,
}: {
  user: UserRecord | null;
  roles: RoleRecord[];
  prs: { requestedBy: string; prNo: string; status: string }[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        {user && <ManageAccessBody user={user} roles={roles} prs={prs} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function ManageAccessBody({
  user,
  roles,
  prs,
  onSaved,
}: {
  user: UserRecord;
  roles: RoleRecord[];
  prs: { requestedBy: string; prNo: string; status: string }[];
  onSaved: () => void;
}) {
  const [tier, setTier] = useState<UserTier>(user.tier);
  const [status, setStatus] = useState<string>(user.status);
  const [granted, setGranted] = useState<string[]>(user.modules.length ? user.modules : ["pr", "lib", "ppmp"]);
  const [newPassword, setNewPassword] = useState("");
  // Roles (an account may hold several): signatory roles like BAC Chairman drive the pickers that list them.
  const [roleIds, setRoleIds] = useState<number[]>(() => roles.filter((r) => user.roles.includes(r.name)).map((r) => r.id));
  const toggleRole = (id: number) => setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const works = prs.filter((p) => p.requestedBy === user.name);
  const effective = effectiveModules(tier, granted);

  const mutation = useMutation({
    mutationFn: () =>
      apiUpdateUser(user.id, {
        tier,
        status,
        modules: tier === "regular" ? granted : null,
        role_ids: roleIds,
        // Only send a password when the admin actually typed a new one.
        ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(newPassword.trim() ? `Access & password updated for ${user.name}.` : `Access updated for ${user.name}.`);
      setNewPassword("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unable to update access."),
  });

  const toggle = (m: string) => setGranted((g) => (g.includes(m) ? g.filter((x) => x !== m) : [...g, m]));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{user.name}</DialogTitle>
        <DialogDescription>{user.email} · {user.office}</DialogDescription>
      </DialogHeader>

      {/* Account status */}
      <div className="space-y-2">
        <p className="label-eyebrow">Account status</p>
        {user.status === "Pending" && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            This account self-registered and is awaiting approval. Set it to <strong>Active</strong> to allow sign-in.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                status === s ? "border-primary bg-primary/5 text-navy" : "border-border text-muted-foreground hover:bg-secondary/50",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Reset password (Superadmin) */}
      <div className="space-y-2">
        <Label className="label-eyebrow" htmlFor="reset-pw">Reset password</Label>
        <Input
          id="reset-pw"
          type="password"
          autoComplete="new-password"
          placeholder="Type a new password (min 8 chars) to reset"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave blank to keep the current password. Saving with a value here immediately resets this user's password.</p>
      </div>

      {/* Tier */}
      <div className="space-y-2">
        <p className="label-eyebrow">Account tier</p>
        <div className="grid gap-2">
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTier(t.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                tier === t.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
              )}
            >
              <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", tier === t.value ? "border-primary bg-primary" : "border-muted-foreground/40")} />
              <span>
                <span className="block text-sm font-semibold text-navy">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Per-user modules (regular only) */}
      {tier === "regular" && (
        <div className="space-y-2">
          <p className="label-eyebrow">Modules this user can access</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {TOGGLEABLE_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-secondary/40">
                <Checkbox checked={granted.includes(m)} onCheckedChange={() => toggle(m)} />
                <span className="text-navy">{MODULE_LABELS[m]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Dashboard is always available.</p>
        </div>
      )}

      {/* Roles */}
      <div className="space-y-2">
        <p className="label-eyebrow">Roles</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm hover:bg-secondary/40" title={r.desc}>
              <Checkbox className="mt-0.5" checked={roleIds.includes(r.id)} onCheckedChange={() => toggleRole(r.id)} />
              <span className="text-navy">{r.name}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">An account can hold several roles. Only one account can be the Regional Director.</p>
      </div>

      {/* Effective access preview */}
      <div className="space-y-2">
        <p className="label-eyebrow">Effective access</p>
        <div className="flex flex-wrap gap-1.5">
          {effective.map((m) => (
            <span key={m} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-navy">
              {MODULE_LABELS[m]}
            </span>
          ))}
        </div>
      </div>

      {/* Their works */}
      <div className="space-y-2">
        <p className="label-eyebrow flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Purchase Requests by this user ({works.length})</p>
        {works.length === 0 ? (
          <p className="text-xs text-muted-foreground">No purchase requests on record for this user.</p>
        ) : (
          <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {works.slice(0, 20).map((w) => (
              <li key={w.prNo} className="flex items-center justify-between text-xs">
                <span className="font-medium text-navy">{w.prNo}</span>
                <span className="text-muted-foreground">{w.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DialogFooter>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save access"}
        </Button>
      </DialogFooter>
    </>
  );
}
