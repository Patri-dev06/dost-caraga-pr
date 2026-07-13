import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Lock, Eye, EyeOff, Mail, Briefcase } from "lucide-react";
import { apiPublicOffices, login, register, type PublicOffice } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — DOST Caraga Procurement System" },
      { name: "description", content: "Sign in to the DOST Caraga Procurement Management Platform." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* LEFT — brand hero panel */}
      <aside className="relative hidden overflow-hidden bg-[#0b2545] px-10 py-14 text-white lg:flex lg:flex-col lg:justify-center xl:px-20">
        <div className="absolute inset-0 bg-[url('/login-bg.jpg')] bg-cover bg-center" aria-hidden="true" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0e2c56]/80 via-[#0b2545]/85 to-[#071a34]/92" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#1b62b8]/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        <div className="relative max-w-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/95 p-1.5 shadow-lg">
              <img src="/dost-seal.svg" alt="DOST logo" className="h-full w-full object-contain" />
            </div>
            <p className="label-eyebrow text-white/70">DOST Caraga · nnDOST4U: Solutions and Us</p>
          </div>

          <h1 className="mt-10 text-4xl font-bold leading-[1.1] text-white xl:text-5xl">
            DOST Caraga Procurement Management System
          </h1>
          <p className="mt-4 text-lg font-semibold text-[#7db8f0]">
            Department of Science and Technology — Caraga
          </p>

          <p className="mt-8 max-w-lg text-sm leading-relaxed text-white/60">
            A unified procurement platform that seamlessly integrates the LIB, PPMP, and Purchase
            Request into one intelligent workflow.
          </p>

          <div className="mt-12 flex flex-wrap items-center gap-4 text-xs text-white/45">
            <span>© 2026 DOST Caraga</span>
            <a href="#" className="hover:text-white/80">Privacy Policy</a>
            <a href="#" className="hover:text-white/80">Terms of Service</a>
            <a href="#" className="hover:text-white/80">Security</a>
          </div>
        </div>
      </aside>

      {/* RIGHT — auth panel */}
      <section className="flex items-center justify-center bg-card px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary p-1.5">
              <img src="/dost-seal.svg" alt="DOST logo" className="h-full w-full object-contain" />
            </div>
            <p className="label-eyebrow">Department of Science and Technology</p>
          </div>

          {mode === "login" ? (
            <SignInCard onRegister={() => setMode("register")} />
          ) : (
            <RegisterCard onBack={() => setMode("login")} />
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            For authorized DOST Caraga personnel only. All activities are logged.
          </p>
        </div>
      </section>
    </div>
  );
}

function SignInCard({ onRegister }: { onRegister: () => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState("admin@dost.gov.ph");
  const [password, setPassword] = useState("password123");
  return (
    <Card className="border border-border bg-card p-6 shadow-card sm:p-7">
      <div className="mb-5 text-center">
        <h2 className="text-2xl font-bold text-[var(--brand-blue)]">DPMS Login</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use your approved DOST account to continue.</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            await login(username, password);
            toast.success("Signed in successfully.");
            navigate({ to: "/" });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to sign in.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-semibold text-navy">
            Username <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required className="h-11 border-border bg-background pl-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold text-navy">
            Password <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required className="h-11 border-border bg-background pl-9 pr-10" />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-border" />
            Remember Me
          </label>
          <a href="#" className="font-medium text-primary hover:underline">Forgot Password?</a>
        </div>
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Demo accounts (password: password123)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Superadmin", email: "superadmin@dost.gov.ph" },
              { label: "Admin", email: "admin@dost.gov.ph" },
              { label: "Regular", email: "mdelacruz@dost.gov.ph" },
            ].map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setUsername(a.email);
                  setPassword("password123");
                }}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-medium text-navy transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" className="h-11 w-full rounded-md text-sm font-semibold" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-md text-sm font-medium">
          <GoogleIcon className="h-4 w-4" />
          Sign in with Gmail
        </Button>
        <div className="pt-1 text-center text-xs text-muted-foreground">
          <p>Need Help? <a href="#" className="font-medium text-[var(--brand-blue)] hover:underline">Contact MIS Unit</a></p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> Government Secure Login
          </p>
        </div>
      </form>
      <p className="mt-5 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        No account yet?{" "}
        <button type="button" onClick={onRegister} className="font-semibold text-primary hover:underline">
          Register here
        </button>
      </p>
    </Card>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function RegisterCard({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [offices, setOffices] = useState<PublicOffice[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [officeId, setOfficeId] = useState<string>("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    apiPublicOffices()
      .then(setOffices)
      .catch(() => {});
  }, []);

  return (
    <Card className="border border-border bg-card p-6 shadow-card sm:p-7">
      <div className="mb-5 text-center">
        <h2 className="text-2xl font-bold text-[var(--brand-blue)]">Create account</h2>
        <p className="mt-1 text-sm text-muted-foreground">Registration requires admin approval.</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!officeId) {
            toast.error("Please select your office / division.");
            return;
          }
          setLoading(true);
          try {
            const result = await register({
              name: `${firstName.trim()} ${lastName.trim()}`.trim(),
              email: email.trim(),
              password,
              position: position.trim(),
              office_id: Number(officeId),
            });
            toast.success(result.message ?? "Registration submitted for admin approval.");
            onBack();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to create account.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fname" className="text-sm font-semibold text-navy">First name</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input id="fname" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Maria" className="h-11 border-border bg-background pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lname" className="text-sm font-semibold text-navy">Last name</Label>
            <Input id="lname" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dela Cruz" className="h-11 border-border bg-background" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-email" className="text-sm font-semibold text-navy">Official email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="r-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="firstname.lastname@dost.gov.ph" className="h-11 border-border bg-background pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-position" className="text-sm font-semibold text-navy">Position / Designation</Label>
          <div className="relative">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="r-position" required value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Science Research Specialist II" className="h-11 border-border bg-background pl-9" />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-navy">Office / Division <span className="text-destructive">*</span></Label>
          <Select value={officeId} onValueChange={setOfficeId} required>
            <SelectTrigger className="h-11 border-border bg-background"><SelectValue placeholder="Select office" /></SelectTrigger>
            <SelectContent>
              {offices.map((office) => (
                <SelectItem key={office.id} value={String(office.id)}>
                  {office.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-pass" className="text-sm font-semibold text-navy">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="r-pass" type={show ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="h-11 border-border bg-background pl-9 pr-10" />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="h-11 w-full rounded-md text-sm font-semibold" disabled={loading}>
          {loading ? "Submitting…" : "Create account"}
        </Button>
      </form>
      <p className="mt-5 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        Already registered?{" "}
        <button type="button" onClick={onBack} className="font-semibold text-primary hover:underline">
          Back to sign in
        </button>
      </p>
    </Card>
  );
}
