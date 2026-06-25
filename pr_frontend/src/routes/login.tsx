import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Mail, Lock, Eye, EyeOff, User, Building2, FileCheck2, ClipboardList } from "lucide-react";
import { login } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — DOST Caraga Procurement System" },
      { name: "description", content: "Sign in or register for the DOST Caraga Procurement Management Platform." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [authMode, setAuthMode] = useState("login");
  const [authPanelHeight, setAuthPanelHeight] = useState<number>();
  const loginPanelRef = useRef<HTMLDivElement>(null);
  const registerPanelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = authMode === "login" ? loginPanelRef.current : registerPanelRef.current;
    if (!panel) return;

    const updateHeight = () => setAuthPanelHeight(panel.offsetHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(panel);

    return () => observer.disconnect();
  }, [authMode]);

  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
      {/* LEFT — brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-soft-blue/60 via-secondary to-background px-10 py-14 lg:flex lg:flex-col lg:justify-center xl:px-20">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="max-w-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-card p-1.5 shadow-lg shadow-primary/20">
              <img src="/dost-seal.svg" alt="DOST logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="label-eyebrow text-primary">Department of Science and Technology</p>
              <h2 className="mt-1 text-2xl font-bold text-navy">DOST Caraga — Procurement System</h2>
            </div>
          </div>

          <h1 className="mt-8 text-4xl font-bold leading-[1.1] text-navy xl:text-5xl">
            Streamline procurement, validation, and approvals in one platform.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
            A pre-validation and monitoring system for DOST Caraga that supports purchase requests,
            PPMP &amp; APP reference checks, budget validation, and routed approvals.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {[
              { icon: ClipboardList, k: "Purchase Requests", v: "Create, route, and track PRs" },
              { icon: FileCheck2, k: "Pre-Validation", v: "PPMP, APP-CSE, Budget checks" },
              { icon: Building2, k: "Approval Routing", v: "Multi-level office workflow" },
              { icon: ShieldCheck, k: "Audit Trail", v: "Full transparency &amp; logs" },
            ].map(({ icon: Icon, k, v }) => (
              <div key={k} className="rounded-xl border border-border bg-card/80 p-3.5 shadow-card backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="label-eyebrow text-primary">{k}</p>
                </div>
                <p className="mt-1.5 text-sm font-medium text-navy" dangerouslySetInnerHTML={{ __html: v }} />
              </div>
            ))}
          </div>

          <p className="mt-10 text-xs text-muted-foreground">
            © 2026 DOST Caraga · Government of the Philippines
          </p>
        </div>
      </aside>

      {/* RIGHT — auth panel */}
      <section className="flex items-center justify-center bg-card px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-card p-1 shadow-sm">
              <img src="/dost-seal.svg" alt="DOST logo" className="h-full w-full object-contain" />
            </div>
            <p className="label-eyebrow">Department of Science and Technology</p>
            <h1 className="mt-1 text-lg font-bold text-navy">DOST Caraga — Procurement System</h1>
          </div>

          <Tabs value={authMode} onValueChange={setAuthMode} className="w-full">
            <TabsList className="relative mb-6 grid h-11 w-full grid-cols-2 overflow-hidden rounded-full bg-secondary p-1">
              <span
                className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-card shadow-sm transition-transform duration-300 ease-out ${
                  authMode === "register" ? "translate-x-full" : "translate-x-0"
                }`}
                aria-hidden="true"
              />
              <TabsTrigger value="login" className="relative z-10 rounded-full bg-transparent text-muted-foreground shadow-none transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-navy data-[state=active]:shadow-none">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="register" className="relative z-10 rounded-full bg-transparent text-muted-foreground shadow-none transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-navy data-[state=active]:shadow-none">
                Register
              </TabsTrigger>
            </TabsList>

            <div
              className="relative overflow-hidden transition-[height] duration-500 ease-out"
              style={authPanelHeight ? { height: authPanelHeight } : undefined}
            >
              <div
                ref={loginPanelRef}
                className={`absolute inset-x-0 top-0 transition-all duration-500 ease-out ${
                  authMode === "login" ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-8 opacity-0"
                }`}
                aria-hidden={authMode !== "login"}
              >
                <SignInCard />
              </div>
              <div
                ref={registerPanelRef}
                className={`absolute inset-x-0 top-0 transition-all duration-500 ease-out ${
                  authMode === "register" ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"
                }`}
                aria-hidden={authMode !== "register"}
              >
                <RegisterCard />
              </div>
            </div>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            For authorized DOST Caraga personnel only. All activities are logged.
          </p>
        </div>
      </section>
    </div>
  );
}

function SignInCard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("admin@dost.gov.ph");
  const [password, setPassword] = useState("password123");
  return (
    <Card className="border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-navy">Sign in</h2>
        <p className="mt-1 text-sm text-primary">Use your approved DOST account to access the dashboard.</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            await login(email, password);
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
          <Label htmlFor="email" className="text-sm font-semibold text-navy">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="firstname.lastname@dost.gov.ph" required className="h-11 border-border bg-background pl-9" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-semibold text-navy">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="password" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" required className="h-11 border-border bg-background pl-9 pr-10" />
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
            Keep me signed in
          </label>
          <a href="#" className="font-medium text-primary hover:underline">Forgot password?</a>
        </div>
        <Button type="submit" className="h-11 w-full rounded-md text-sm font-semibold" disabled={loading}>
          {loading ? "Signing in…" : "Login"}
        </Button>
        <Button type="button" variant="outline" className="h-11 w-full rounded-md text-sm font-medium">
          Request password reset
        </Button>
      </form>
    </Card>
  );
}

function RegisterCard() {
  const [loading, setLoading] = useState(false);
  return (
    <Card className="border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-navy">Create account</h2>
        <p className="mt-1 text-sm text-primary">Register your DOST Caraga account. Access requires admin approval.</p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setLoading(true);
          setTimeout(() => setLoading(false), 600);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fname" className="text-sm font-semibold text-navy">First name</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <Input id="fname" required placeholder="Maria" className="h-11 border-border bg-background pl-9" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lname" className="text-sm font-semibold text-navy">Last name</Label>
            <Input id="lname" required placeholder="Dela Cruz" className="h-11 border-border bg-background" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-email" className="text-sm font-semibold text-navy">Official email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="r-email" type="email" required placeholder="firstname.lastname@dost.gov.ph" className="h-11 border-border bg-background pl-9" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-navy">Office / Division</Label>
            <Select>
              <SelectTrigger className="h-11 border-border bg-background"><SelectValue placeholder="Select office" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ord">Office of the Regional Director</SelectItem>
                <SelectItem value="fad">Finance &amp; Admin Division</SelectItem>
                <SelectItem value="tsd">Technical Services Division</SelectItem>
                <SelectItem value="psto-ads">PSTO Agusan del Sur</SelectItem>
                <SelectItem value="psto-adn">PSTO Agusan del Norte</SelectItem>
                <SelectItem value="psto-sds">PSTO Surigao del Sur</SelectItem>
                <SelectItem value="psto-sdn">PSTO Surigao del Norte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-navy">Requested role</Label>
            <Select>
              <SelectTrigger className="h-11 border-border bg-background"><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="requester">Requester</SelectItem>
                <SelectItem value="validator">Validator</SelectItem>
                <SelectItem value="approver">Approver</SelectItem>
                <SelectItem value="budget">Budget Officer</SelectItem>
                <SelectItem value="procurement">Procurement Officer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-pass" className="text-sm font-semibold text-navy">Password</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input id="r-pass" type="password" required placeholder="At least 8 characters" className="h-11 border-border bg-background pl-9" />
          </div>
          <p className="text-xs text-muted-foreground">Must include uppercase, number, and symbol.</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" required className="mt-0.5 h-3.5 w-3.5 rounded border-border" />
          I confirm I am authorized DOST Caraga personnel and agree to the system's data privacy and acceptable use policy.
        </label>

        <Button type="submit" className="h-11 w-full rounded-md text-sm font-semibold" disabled={loading}>
          {loading ? "Submitting…" : "Create account"}
        </Button>
      </form>
    </Card>
  );
}
