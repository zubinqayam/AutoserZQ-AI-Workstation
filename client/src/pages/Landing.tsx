import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  FlaskConical, Brain, Layers, Eye, Zap, Shield, ArrowRight,
  GitBranch, Mail, Loader2, CheckCircle, Activity,
} from "lucide-react";

export default function Landing() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (mode === "signup" && !displayName.trim()) return;
    setLoading(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const body: any = { email: email.trim(), password };
      if (mode === "signup") body.displayName = displayName.trim();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      localStorage.setItem("zq_user", JSON.stringify(data.user));
      localStorage.setItem("zq_uid", data.user.id);
      localStorage.setItem("zq_displayName", data.user.displayName);
      navigate("/workspace");
    } catch (err: any) {
      toast({ title: "Auth error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleOAuth = (provider: string) => {
    toast({
      title: `${provider} Sign-In`,
      description: `${provider} OAuth requires configuring OAuth credentials. Set GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID in your environment and redeploy.`,
    });
  };

  const continueAsGuest = () => {
    const guestId = `guest-${Date.now().toString(36)}`;
    const guestName = `Guest-${guestId.slice(-4).toUpperCase()}`;
    localStorage.setItem("zq_uid", guestId);
    localStorage.setItem("zq_displayName", guestName);
    localStorage.setItem("zq_user", JSON.stringify({ id: guestId, displayName: guestName, email: "", isGuest: true }));
    navigate("/workspace");
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-white flex flex-col overflow-hidden">
      {/* Status bar at top */}
      <div className="w-full border-b border-white/5 bg-black/30 px-6 py-1.5 flex items-center gap-6 text-[10px] font-mono text-white/30 flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          KERNEL: OK
        </span>
        <span>GEMINI 2.5 FLASH · ACTIVE</span>
        <span className="ml-auto">ZQ WORKSTATION V2.4</span>
        <span>REGION: CLOUD</span>
      </div>

      {/* Nav */}
      <header className="px-6 py-3 flex items-center gap-6 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">ZQ WORKSTATION</span>
        </div>
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {["RER Pipeline", "COA · 10 Agents", "Command Center"].map((t, i) => (
            <button
              key={t}
              className={`text-xs px-3 py-1.5 rounded-md transition-colors ${i === 0 ? "text-primary border-b-2 border-primary font-semibold" : "text-white/40 hover:text-white/70"}`}
            >{t}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-white/50 hover:text-white"
            onClick={continueAsGuest}
            data-testid="btn-guest"
          >
            Continue as guest
          </Button>
          <Button size="sm" className="text-xs bg-primary text-white" onClick={() => setMode("signup")} data-testid="btn-get-started">
            Get started
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left — Hero + Features */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-12 min-w-0">
          {/* Hero */}
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs text-primary mb-6">
              <Activity className="w-3 h-3" />
              Multi-Agent Research Orchestration · V2.4 Kernel
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight text-white mb-4">
              Research that<br />
              <span className="text-primary">thinks in layers</span>
            </h1>
            <p className="text-sm text-white/50 leading-relaxed mb-8 max-w-md">
              Four sequential AI agents, each running a full Review → Research → Enhance → Report cycle, passing their complete output forward. Overseen by 10 specialized cognitive agents in the ZQ Cognitive Overlay.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button className="bg-primary text-white text-sm gap-2" onClick={() => navigate("/workspace")} data-testid="btn-launch">
                Launch Workspace <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" className="text-sm border-white/10 bg-white/5 text-white/70 hover:text-white" onClick={continueAsGuest}>
                Try as guest
              </Button>
            </div>
          </div>

          {/* Pipeline visual */}
          <div className="mt-12 max-w-2xl">
            <p className="text-[10px] text-white/25 font-mono uppercase tracking-widest mb-3">RER PIPELINE — Sequential Mode</p>
            <div className="flex items-stretch gap-1.5 flex-wrap">
              {[
                { n: "01", label: "Researcher", sub: "Raw topic → Full research cycle", color: "border-indigo-500/40 bg-indigo-500/5" },
                { n: "02", label: "Reviewer",   sub: "Reviews Tab 1 → Deep research",  color: "border-orange-500/40 bg-orange-500/5" },
                { n: "03", label: "Enhancer",   sub: "Synthesizes all findings",        color: "border-emerald-500/40 bg-emerald-500/5" },
                { n: "04", label: "Reporter",   sub: "Final comprehensive report",      color: "border-purple-500/40 bg-purple-500/5" },
              ].map((tab, i, arr) => (
                <div key={tab.n} className="flex items-center gap-1.5">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${tab.color}`}>
                    <p className="text-white/30 font-mono text-[10px]">TAB {tab.n}</p>
                    <p className="text-white/80 font-semibold">{tab.label}</p>
                    <p className="text-white/30 text-[10px] mt-0.5 max-w-[120px]">{tab.sub}</p>
                  </div>
                  {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-white/15 flex-shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* COA Agent strip */}
          <div className="mt-8 max-w-2xl">
            <p className="text-[10px] text-white/25 font-mono uppercase tracking-widest mb-3">ZQ COGNITIVE OVERLAY · 10 AGENTS</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["#818cf8", "Thinker"],   ["#f472b6", "Mr.Q"],       ["#34d399", "ALGA"],
                ["#fb923c", "DRM"],       ["#60a5fa", "Keyhole"],    ["#fbbf24", "Sparker"],
                ["#a78bfa", "Checker"],   ["#2dd4bf", "Synthesis"],  ["#f87171", "Challenger"],
                ["#94a3b8", "Evaluator"],
              ].map(([color, name]) => (
                <span key={name} className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                  style={{ borderColor: `${color}30`, backgroundColor: `${color}10`, color: color }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Feature grid */}
          <div className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
            {[
              { Icon: Brain,      title: "Sequential Reasoning",    desc: "Each tab receives the full prior report" },
              { Icon: Eye,        title: "Live COA Overlay",        desc: "Floating 10-agent cognitive panel" },
              { Icon: Layers,     title: "Command Center",          desc: "Supervisor AI chatbot + task queue" },
              { Icon: GitBranch,  title: "GitHub Integration",      desc: "Version-control your research" },
              { Icon: Shield,     title: "Project Folders",         desc: "Organize research into folders" },
              { Icon: Zap,        title: "Parallel Mode",           desc: "All 4 tabs research simultaneously" },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex gap-2.5 p-3 rounded-xl border border-white/5 bg-white/2">
                <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-white/80">{title}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Auth Card */}
        <div className="w-full md:w-[400px] flex-shrink-0 flex flex-col justify-center px-8 py-12 border-l border-white/5">
          <div className="max-w-sm w-full mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-white">{mode === "signin" ? "Welcome back" : "Create account"}</h2>
              <p className="text-xs text-white/40 mt-1">
                {mode === "signin" ? "Sign in to access ZQ Workstation" : "Start your research journey"}
              </p>
            </div>

            {/* OAuth buttons */}
            <div className="space-y-2 mb-5">
              <button
                className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-white/10 bg-white/3 text-white/70 text-sm hover:bg-white/7 hover:text-white transition-colors"
                onClick={() => handleOAuth("Google")}
                data-testid="btn-google"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              <button
                className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl border border-white/10 bg-white/3 text-white/70 text-sm hover:bg-white/7 hover:text-white transition-colors"
                onClick={() => handleOAuth("GitHub")}
                data-testid="btn-github"
              >
                <GitBranch className="w-4 h-4" />
                Continue with GitHub
              </button>
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[10px] text-white/25">or continue with email</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/50">Display name</Label>
                  <Input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                    data-testid="input-displayname"
                    required
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                  data-testid="input-email"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-white/50">Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min. 8 characters" : "Your password"}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-primary/50"
                  data-testid="input-password"
                  required
                  minLength={mode === "signup" ? 8 : 1}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary text-white mt-1"
                disabled={loading}
                data-testid="btn-auth-submit"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>

            <p className="text-center text-xs text-white/30 mt-4">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <button
                className="text-primary hover:text-primary/80 transition-colors"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                data-testid="btn-toggle-mode"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>

            <button
              className="w-full text-center text-[10px] text-white/20 mt-5 hover:text-white/40 transition-colors"
              onClick={continueAsGuest}
              data-testid="btn-guest-small"
            >
              Skip — continue as guest
            </button>

            {/* Trust signals */}
            <div className="mt-8 pt-5 border-t border-white/5 grid grid-cols-3 gap-3 text-center">
              {[
                { Icon: Shield, label: "10 Agents" },
                { Icon: CheckCircle, label: "4-Tab RER" },
                { Icon: Zap, label: "Gemini AI" },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <Icon className="w-4 h-4 text-primary/60" />
                  <span className="text-[10px] text-white/25">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-white/5 bg-black/20 px-6 py-1.5 flex items-center gap-6 text-[10px] font-mono text-white/20 flex-shrink-0">
        <span className="flex items-center gap-1.5 text-emerald-400/60">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          SYSTEM READY
        </span>
        <span>LATEST LOG: [INIT] — ZQ Workstation kernel initialized</span>
        <span className="ml-auto">LATENCY: — ms</span>
      </div>
    </div>
  );
}
