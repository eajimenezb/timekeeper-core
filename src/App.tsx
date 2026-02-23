import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CompanySettingsProvider } from "@/hooks/useCompanySettings";
import Auth from "./pages/Auth";
import SetPassword from "./pages/SetPassword";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeHistory from "./pages/EmployeeHistory";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RoleRouter() {
  const { profile, loading } = useAuth();
  if (loading || !profile) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (profile.role === "admin") return <AdminDashboard />;
  return <EmployeeDashboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <CompanySettingsProvider>
            <Routes>
              <Route path="/auth" element={<AuthRedirect />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/" element={<ProtectedRoute><RoleRouter /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><EmployeeHistory /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </CompanySettingsProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

function AuthRedirect() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
}

export default App;
