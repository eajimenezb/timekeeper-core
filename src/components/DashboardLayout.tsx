import { ReactNode, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Globe,
  Building2,
  Sun,
  Moon,
  MapPin,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "employee";
  activePage?: string;
  onNavClick?: (id: string) => void;
}

export default function DashboardLayout({ children, role, activePage = "panel", onNavClick }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const { darkMode, setDarkMode } = useCompanySettings();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fetch company name
  const { data: company } = useQuery({
    queryKey: ["company-info", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await supabase.from("companies").select("name").eq("id", profile.company_id).single();
      return data as { name: string } | null;
    },
    enabled: !!profile?.company_id,
  });

  // Fetch company logo
  const { data: companyLogo } = useQuery({
    queryKey: ["company-logo", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await supabase.from("companies").select("logo_url").eq("id", profile.company_id).single();
      return (data as any)?.logo_url as string | null;
    },
    enabled: !!profile?.company_id,
  });

  // Fetch employee's assigned location for sidebar branding
  const { data: userLocation } = useQuery({
    queryKey: ["user-location-sidebar", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data: userData } = await supabase.from("users").select("location_id" as any).eq("id", profile.id).single();
      if (!(userData as any)?.location_id) return null;
      const { data: loc } = await (supabase.from as any)("locations").select("name, logo_url").eq("id", (userData as any).location_id).single();
      return loc as { name: string; logo_url: string | null } | null;
    },
    enabled: !!profile?.id && role === "employee",
  });

  // For employees: show location branding; for admins: show company branding
  const brandLogo = role === "employee" ? (userLocation?.logo_url || companyLogo || null) : (companyLogo || null);
  const brandName = role === "employee" ? (userLocation?.name || company?.name || "Company") : (company?.name || "Company");

  const employeeNav = [
    { icon: LayoutDashboard, label: t("panel"), id: "panel", path: "/" },
    
    { icon: CalendarDays, label: t("history"), id: "history", path: "/history" },
    { icon: Settings, label: t("settings"), id: "settings", path: "/" },
  ];

  const adminNav = [
    { icon: LayoutDashboard, label: t("panel"), id: "panel", path: "/" },
    { icon: Users, label: t("team"), id: "team", path: "/" },
    { icon: MapPin, label: t("locations") || "Locations", id: "locations", path: "/" },
    { icon: Settings, label: t("settings"), id: "settings", path: "/" },
  ];

  const nav = role === "admin" ? adminNav : employeeNav;

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div className="min-h-screen flex bg-background">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen z-50
          bg-sidebar text-sidebar-foreground
          flex flex-col
          transition-all duration-300 ease-out
          ${collapsed ? "lg:w-20" : "lg:w-64"}
          ${mobileOpen ? "w-64 translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Company Logo */}
        <div className={`flex items-center gap-4 px-5 border-b border-sidebar-border shrink-0 ${role === "employee" ? "h-24" : "h-20"}`}>
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className={`${role === "employee" ? "w-[60px] h-[60px]" : "w-12 h-12"} rounded-xl object-cover shrink-0`} />
          ) : (
            <div className={`${role === "employee" ? "w-[60px] h-[60px]" : "w-12 h-12"} rounded-xl bg-primary flex items-center justify-center shrink-0`}>
              <Building2 className={`${role === "employee" ? "w-7 h-7" : "w-6 h-6"} text-primary-foreground`} />
            </div>
          )}
          {!collapsed && (
            <span className={`font-bold ${role === "employee" ? "text-2xl" : "text-xl"} text-sidebar-accent-foreground tracking-tight animate-fade-in truncate`}>
              {brandName}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => { if (onNavClick) { onNavClick(item.id); } else { navigate(item.path); } setMobileOpen(false); }}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200
                ${item.id === activePage
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                }
              `}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {/* Language Toggle */}
          <button
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
          >
            <Globe className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{lang === "es" ? "English" : "Español"}</span>}
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200"
          >
            {darkMode ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
            {!collapsed && <span>{darkMode ? (lang === "es" ? "Modo claro" : "Light mode") : (lang === "es" ? "Modo oscuro" : "Dark mode")}</span>}
          </button>

          {!collapsed && (
            <div className="px-3 py-2 animate-fade-in">
              <p className="text-xs font-medium text-sidebar-foreground/80 truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-[10px] text-sidebar-foreground/40 capitalize">{role === "admin" ? t("administrator") : t("employee")}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent/50 transition-all duration-200"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{t("closeSession")}</span>}
          </button>

          {/* Powered by */}
          {!collapsed && (
            <div className="px-3 pt-2 animate-fade-in">
              <p className="text-[10px] text-sidebar-foreground/30 flex items-center gap-1">
                {t("poweredBy")} <img src="/axistrack-logo.png" alt="AxisTrack" className="w-3 h-3 inline object-contain" /> <span className="font-semibold">AxisTrack</span>
              </p>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border items-center justify-center shadow-sm hover:bg-muted transition-colors"
        >
          <ChevronLeft className={`w-3 h-3 text-muted-foreground transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 h-16 border-b border-border bg-card/50 backdrop-blur-lg sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-3">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className={`${role === "employee" ? "w-11 h-11" : "w-9 h-9"} rounded-lg object-cover`} />
            ) : (
              <div className={`${role === "employee" ? "w-11 h-11" : "w-9 h-9"} rounded-lg bg-primary flex items-center justify-center`}>
                <Building2 className={`${role === "employee" ? "w-6 h-6" : "w-5 h-5"} text-primary-foreground`} />
              </div>
            )}
            <span className={`font-bold ${role === "employee" ? "text-lg" : "text-base"} truncate max-w-[160px]`}>{brandName}</span>
          </div>
          <button
            onClick={() => setLang(lang === "es" ? "en" : "es")}
            className="p-2 -mr-2 rounded-xl hover:bg-muted transition-colors"
          >
            <Globe className="w-5 h-5 text-muted-foreground" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
