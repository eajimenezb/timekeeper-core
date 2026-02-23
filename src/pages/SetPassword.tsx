import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Clock, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const verifyToken = async () => {
      // Parse token_hash from URL hash (e.g., #token_hash=xxx&type=recovery)
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (tokenHash && type === "recovery") {
        // Verify the token client-side, bypassing server redirect
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (!error) {
          setReady(true);
          // Clean the URL hash
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      // Fallback: check existing session
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setReady(true);
    };

    verifyToken();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Mark user as confirmed
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("users").update({ is_confirmed: true } as any).eq("id", user.id);
    }

    // Sign out so they can log in fresh with their new password
    await supabase.auth.signOut();
    toast({ title: "Password set successfully! Please log in." });
    setLoading(false);
    navigate("/auth");
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
        <p className="text-muted-foreground">Verifying your link...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-2">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Welcome!</h1>
          <p className="text-muted-foreground">Set your password to get started</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Set Your Password
            </CardTitle>
          </CardHeader>
          <form onSubmit={handleSetPassword}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Setting password..." : "Set Password & Continue"}
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
