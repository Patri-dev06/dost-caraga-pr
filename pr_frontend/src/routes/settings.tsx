import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { apiGetSystemSettings, apiUpdateSystemSettings, apiGetSignatories, apiUpdateProfile, type SystemPreferenceRecord, type Signatory } from "@/lib/api";
import { useCanAccess, useCurrentUser } from "@/lib/current-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DOST Caraga" },
      { name: "description", content: "Manage your profile, notification preferences, and system settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const canAccess = useCanAccess();
  // Everyone can open Settings for their profile; only accounts with the "settings"
  // module (admin/superadmin) see and manage the system-wide preferences.
  const canManageSystem = canAccess("settings");
  const { user, refresh } = useCurrentUser();

  const queryClient = useQueryClient();
  const [draftSettings, setDraftSettings] = useState<Record<string, SystemPreferenceRecord["value"]>>({});
  const [profile, setProfile] = useState({ name: "", email: "", office: "", position: "" });
  const [draftProfile, setDraftProfile] = useState(profile);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [confirmProfileSave, setConfirmProfileSave] = useState(false);

  // Show the signed-in user's real account details.
  useEffect(() => {
    if (!user) return;
    const p = { name: user.name, email: user.email, office: user.office, position: user.position };
    setProfile(p);
    setDraftProfile(p);
  }, [user]);

  const { data: systemSettings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ["system-settings"],
    queryFn: apiGetSystemSettings,
    enabled: canManageSystem, // avoids a 403 for regular users
  });
  const { data: signatories = [] } = useQuery({
    queryKey: ["signatories"],
    queryFn: apiGetSignatories,
    enabled: canManageSystem,
  });
  const updateSettings = useMutation({
    mutationFn: apiUpdateSystemSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(["system-settings"], settings);
      setDraftSettings({});
      toast.success("System preferences updated.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to update system preferences.");
    },
  });

  const startProfileEdit = () => {
    setDraftProfile(profile);
    setIsEditingProfile(true);
  };

  const cancelProfileEdit = () => {
    setDraftProfile(profile);
    setIsEditingProfile(false);
  };

  const profileMutation = useMutation({
    mutationFn: () => apiUpdateProfile({ name: draftProfile.name, email: draftProfile.email, position: draftProfile.position }),
    onSuccess: (updated) => {
      setProfile({ name: updated.name, email: updated.email, office: updated.office, position: updated.position });
      setIsEditingProfile(false);
      setConfirmProfileSave(false);
      refresh(); // update the name/initials shown in the topbar
      toast.success("Profile updated.");
    },
    onError: (error) => {
      setConfirmProfileSave(false);
      toast.error(error instanceof Error ? error.message : "Unable to update profile.");
    },
  });
  const saveProfile = () => profileMutation.mutate();
  const settingsByCategory = systemSettings.reduce<Record<string, SystemPreferenceRecord[]>>((groups, setting) => {
    groups[setting.category] = [...(groups[setting.category] ?? []), setting];
    return groups;
  }, {});
  const hasSettingDrafts = Object.keys(draftSettings).length > 0;
  const settingValue = (setting: SystemPreferenceRecord) => draftSettings[setting.key] ?? setting.value;

  const saveSystemSettings = () => {
    updateSettings.mutate(Object.entries(draftSettings).map(([key, value]) => ({ key, value })));
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Personal preferences and administrator-managed system controls." />

      <Card className="border border-border bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="label-eyebrow">Profile</p>
            <h3 className="mt-1 text-base font-bold text-navy">Account Information</h3>
          </div>
          {!isEditingProfile && (
            <Button variant="outline" className="border-border" onClick={startProfileEdit}>
              Edit Details
            </Button>
          )}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ProfileField
            label="Full Name"
            value={isEditingProfile ? draftProfile.name : profile.name}
            editing={isEditingProfile}
            onChange={(value) => setDraftProfile((current) => ({ ...current, name: value }))}
          />
          <ProfileField
            label="Email"
            type="email"
            value={isEditingProfile ? draftProfile.email : profile.email}
            editing={isEditingProfile}
            onChange={(value) => setDraftProfile((current) => ({ ...current, email: value }))}
          />
          {/* Office is an organizational assignment managed by the Superadmin, not self-editable. */}
          <ProfileField
            label="Office"
            value={profile.office}
            editing={false}
            onChange={() => {}}
          />
          <ProfileField
            label="Position"
            value={isEditingProfile ? draftProfile.position : profile.position}
            editing={isEditingProfile}
            onChange={(value) => setDraftProfile((current) => ({ ...current, position: value }))}
          />
        </div>
        {isEditingProfile && (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" className="border-border" onClick={cancelProfileEdit}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmProfileSave(true)}>Save Profile</Button>
          </div>
        )}
      </Card>

      {canManageSystem && (
      <Card className="border border-border bg-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="label-eyebrow">System Preferences</p>
            <h3 className="mt-1 text-base font-bold text-navy">Administration Controls</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure agency defaults, procurement labels, and workflow settings used across the system.
            </p>
          </div>
          <Button onClick={saveSystemSettings} disabled={!hasSettingDrafts || updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save Preferences"}
          </Button>
        </div>

        {settingsLoading ? (
          <div className="mt-5 rounded-md border border-border bg-secondary/25 p-4 text-sm text-muted-foreground">
            Fetching system preferences, kindly wait.
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {Object.entries(settingsByCategory).map(([category, settings]) => (
              <div key={category}>
                <p className="label-eyebrow mb-3">{category}</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {settings.map((setting) => (
                    <SystemPreferenceField
                      key={setting.key}
                      setting={setting}
                      value={settingValue(setting)}
                      users={signatories}
                      onChange={(value) => setDraftSettings((current) => ({ ...current, [setting.key]: value }))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      <Card className="border border-border bg-card p-6">
        <p className="label-eyebrow">Notifications</p>
        <h3 className="mt-1 text-base font-bold text-navy">Email Notifications</h3>
        <div className="mt-4 space-y-4">
          {[
            ["PR submitted", "Notify when you submit a Purchase Request.", true],
            ["PR returned or rejected", "Notify when your PR needs revision.", true],
            ["PR approved", "Notify when your PR is approved.", true],
            ["Reference data changes", "Notify when PPMP or APP is updated.", false],
          ].map(([t, d, on]) => (
            <div key={t as string} className="flex items-center justify-between gap-4 border-b border-border/60 pb-4 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-navy">{t}</p>
                <p className="text-xs text-muted-foreground">{d}</p>
              </div>
              <Switch defaultChecked={on as boolean} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" className="border-border" onClick={() => setDraftSettings({})} disabled={!hasSettingDrafts}>
          Reset Preference Changes
        </Button>
        <Button onClick={saveSystemSettings} disabled={!hasSettingDrafts || updateSettings.isPending}>
          {updateSettings.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <AlertDialog open={confirmProfileSave} onOpenChange={setConfirmProfileSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update profile details?</AlertDialogTitle>
            <AlertDialogDescription>
              Please confirm that the profile details are correct before saving. These changes will update the account information shown in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review Again</AlertDialogCancel>
            <AlertDialogAction onClick={saveProfile} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? "Saving..." : "Confirm Changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SystemPreferenceField({
  setting,
  value,
  users,
  onChange,
}: {
  setting: SystemPreferenceRecord;
  value: SystemPreferenceRecord["value"];
  users: Signatory[];
  onChange: (value: SystemPreferenceRecord["value"]) => void;
}) {
  const isUserPicker = setting.key.endsWith("_user_id");
  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label className="label-eyebrow">{setting.label}</Label>
          {setting.description && <p className="mt-1 text-xs text-muted-foreground">{setting.description}</p>}
        </div>
        {setting.type === "boolean" && <Switch checked={Boolean(value)} onCheckedChange={onChange} />}
      </div>
      {isUserPicker ? (
        <Select value={value == null || value === "" ? "" : String(value)} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="mt-3 h-10 border-border bg-background">
            <SelectValue placeholder="Select an account" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name}
                {u.position ? ` — ${u.position}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        setting.type !== "boolean" && (
          <Input
            type={setting.type === "number" ? "number" : "text"}
            value={value == null ? "" : String(value)}
            onChange={(event) => onChange(setting.type === "number" ? Number(event.target.value) : event.target.value)}
            className="mt-3 h-10 border-border bg-background"
          />
        )
      )}
    </div>
  );
}

function ProfileField({
  label,
  value,
  editing,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="label-eyebrow">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-10 border-border"
        />
      ) : (
        <div className="mt-1 flex min-h-10 items-center rounded-md border border-border bg-secondary/25 px-3 text-sm font-medium text-navy">
          {value}
        </div>
      )}
    </div>
  );
}
