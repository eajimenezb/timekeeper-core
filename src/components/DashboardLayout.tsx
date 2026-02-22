import { ReactNode, useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "employee";
}

const employeeNav = [
  { icon: LayoutDashboard, label: "Panel", active: true },
  { icon: Clock, label: "Reloj", active: false },
  { icon: CalendarDays, label: "Historial", active: false },
  { icon: Settings, label: "Ajustes", active: false },
];

const adminNav = [
  { icon: LayoutDashboard, label: "Panel", active: true },
  { icon: Users, label: "Equipo", active: false },
  { icon: CalendarDays, label: "Reportes", active: false },
  { icon: Settings, label: "Ajustes", active: false },
];

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = role === "admin" ? adminNav : employeeNav;

  // Close mobile sidebar on resize
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Usuario";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
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
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-lg text-sidebar-accent-foreground tracking-tight animate-fade-in">
              Timekeeper
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {nav.map((item, i) => (
            <button
              key={item.label}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200
                ${item.active
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
          {!collapsed && (
            <div className="px-3 py-2 animate-fade-in">
              <p className="text-xs font-medium text-sidebar-foreground/80 truncate">{profile?.full_name || profile?.email}</p>
              <p className="text-[10px] text-sidebar-foreground/40 capitalize">{role === "admin" ? "Administrador" : "Empleado"}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent/50 transition-all duration-200"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border items-center justify-center shadow-sm hover:bg-muted transition-colors"
        >
          <ChevronLeft className={`w-3 h-3 text-muted-foreground transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-card/50 backdrop-blur-lg sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Timekeeper</span>
          </div>
          <div className="w-9" /> {/* Spacer */}
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
