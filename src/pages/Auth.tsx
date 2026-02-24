import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { LogIn, UserPlus, Mail, Lock, User, ArrowRight } from "lucide-react";

export default function Auth() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { full_name: signupName },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Signup failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Check your email", description: "We sent a confirmation link to your email." });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-[45%] relative bg-gradient-to-br from-[hsl(210,90%,25%)] via-[hsl(200,85%,35%)] to-[hsl(150,60%,40%)] items-center justify-center p-12 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        </div>
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />

        <div className="relative z-10 text-center space-y-8 max-w-md">
          <div className="flex justify-center">
            <img 
              src="/axistrack-logo.png" 
              alt="AxisTrack" 
              className="w-36 h-36 object-contain drop-shadow-2xl brightness-0 invert"
            />
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold text-white tracking-tight">
              AxisTrack
            </h1>
            <p className="text-lg text-white/70 font-medium">
              Master Your Time, Lead Your Team
            </p>
          </div>
          <div className="pt-6 space-y-4">
            {[
              "Real-time employee tracking",
              "Automated payroll reports",
              "Multi-location management"
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-white/80 text-sm">
                <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3 h-3" />
                </div>
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center space-y-3">
            <img 
              src="/axistrack-logo.png" 
              alt="AxisTrack" 
              className="w-20 h-20 object-contain mx-auto"
            />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">AxisTrack</h1>
            <p className="text-sm text-muted-foreground">Master Your Time, Lead Your Team</p>
          </div>

          {/* Welcome text - desktop */}
          <div className="hidden lg:block space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              {activeTab === "login" ? "Welcome back" : "Get started"}
            </h2>
            <p className="text-muted-foreground text-sm">
              {activeTab === "login" 
                ? "Sign in to your account to continue" 
                : "Create your account to get started"}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-muted/60 rounded-2xl p-1.5 gap-1">
            <button
              onClick={() => setActiveTab("login")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                activeTab === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => setActiveTab("signup")}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                activeTab === "signup"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Login Form */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="login-email" 
                    type="email" 
                    placeholder="you@company.com"
                    value={loginEmail} 
                    onChange={e => setLoginEmail(e.target.value)} 
                    required 
                    className="pl-10 h-12 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-sm font-medium text-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="login-password" 
                    type="password" 
                    placeholder="••••••••"
                    value={loginPassword} 
                    onChange={e => setLoginPassword(e.target.value)} 
                    required 
                    className="pl-10 h-12 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" disabled={loading}>
                <LogIn className="w-4 h-4 mr-2" /> Log In
              </Button>
            </form>
          )}

          {/* Signup Form */}
          {activeTab === "signup" && (
            <form onSubmit={handleSignup} className="space-y-5 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="signup-name" className="text-sm font-medium text-foreground">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="signup-name" 
                    placeholder="John Doe"
                    value={signupName} 
                    onChange={e => setSignupName(e.target.value)} 
                    required 
                    className="pl-10 h-12 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-sm font-medium text-foreground">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="signup-email" 
                    type="email" 
                    placeholder="you@company.com"
                    value={signupEmail} 
                    onChange={e => setSignupEmail(e.target.value)} 
                    required 
                    className="pl-10 h-12 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-sm font-medium text-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="signup-password" 
                    type="password" 
                    placeholder="Min. 6 characters"
                    value={signupPassword} 
                    onChange={e => setSignupPassword(e.target.value)} 
                    required 
                    minLength={6} 
                    className="pl-10 h-12 rounded-xl border-border/60 bg-muted/30 focus:bg-background transition-colors"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" disabled={loading}>
                <UserPlus className="w-4 h-4 mr-2" /> Create Account
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                You'll receive a confirmation email before you can log in.
              </p>
            </form>
          )}

          {/* Footer */}
          <p className="text-center text-[11px] text-muted-foreground/50 pt-4">
            Powered by <span className="font-semibold">AxisTrack</span>
          </p>
        </div>
      </div>
    </div>
  );
}
