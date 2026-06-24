import { createFileRoute } from "@tanstack/react-router";
import { UserPlus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetRoles, apiGetUsers } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "User Management — DOST Caraga" },
      { name: "description", content: "Manage users, assign roles, and review access permissions." },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ["users"], queryFn: apiGetUsers });
  const { data: roles = [], isLoading: rolesLoading } = useQuery({ queryKey: ["roles"], queryFn: apiGetRoles });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Administration"
        title="User & Role Management"
        subtitle="Manage user accounts and role-based permissions."
        actions={<Button className="gap-2"><UserPlus className="h-4 w-4" /> Invite User</Button>}
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
                <TableHead className="label-eyebrow">Roles</TableHead>
                <TableHead className="label-eyebrow">Status</TableHead>
                <TableHead className="label-eyebrow">Last Login</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow></TableHeader>
              <TableBody>
                {usersLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold text-navy">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>{u.office}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className="rounded-full border border-soft-blue bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">{r}</span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={u.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{u.lastLogin}</TableCell>
                    <TableCell><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></TableCell>
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
    </div>
  );
}
