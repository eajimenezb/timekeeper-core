import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Users,
  TrendingUp,
  AlertCircle,
  CalendarDays,
  Clock,
  CircleDot,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm font-semibold text-muted-foreground tabular-nums">
      {time.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
    </span>
  );
}

export default function AdminDashboard() {
  const { profile } = useAuth();

  const { data: adminData, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data as {
        employees: { id: string; full_name: string; email: string; role: string }[];
        punches: any[];
        total_hours_per_employee: { user_id: string; total_hours: number }[];
      };
    },
  });

  const { data: companyData } = useQuery({
    queryKey: ["admin-company"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("employee_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data?.company as { plan_type: string; subscription_status: string; trial_ends_at: string } | null;
    },
  });

  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Admin";
  const totalEmployees = adminData?.employees?.length ?? 0;
  const activePunches = adminData?.punches?.filter((p: any) => p.status === "active").length ?? 0;
  const completedToday = adminData?.punches?.filter(
    (p: any) => p.status === "completed" && p.clock_in_at && new Date(p.clock_in_at).toDateString() === new Date().toDateString()
  ).length ?? 0;

  // Compute efficiency: employees who punched today / total employees
  const todayPunchUsers = new Set(
    adminData?.punches
      ?.filter((p: any) => p.clock_in_at && new Date(p.clock_in_at).toDateString() === new Date().toDateString())
      .map((p: any) => p.user_id) ?? []
  );
  const efficiency = totalEmployees > 0 ? Math.round((todayPunchUsers.size / totalEmployees) * 100) : 0;

  // Delays: punches with clock_in_at after 9 AM today
  const delays = adminData?.punches?.filter((p: any) => {
    if (!p.clock_in_at) return false;
    const d = new Date(p.clock_in_at);
    return d.toDateString() === new Date().toDateString() && d.getHours() >= 9;
  }).length ?? 0;

  // Trial days remaining
  const trialDaysLeft = companyData?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(companyData.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  // Chart: daily attendance for the last 7 days
  const chartData = (() => {
    const days: { name: string; asistencias: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const count = new Set(
        adminData?.punches?.filter((p: any) => p.clock_in_at && new Date(p.clock_in_at).toDateString() === dateStr)
          .map((p: any) => p.user_id) ?? []
      ).size;
      days.push({
        name: format(d, "EEE", { locale: es }),
        asistencias: count,
      });
    }
    return days;
  })();

  const getEmployeeName = (uid: string) => {
    const emp = adminData?.employees?.find((e) => e.id === uid);
    return emp?.full_name || emp?.email || uid.slice(0, 8);
  };

  // Get latest punch per employee for live monitoring
  const latestPunches = (() => {
    if (!adminData?.punches || !adminData?.employees) return [];
    const map = new Map<string, any>();
    for (const p of adminData.punches) {
      if (!map.has(p.user_id) || new Date(p.clock_in_at) > new Date(map.get(p.user_id).clock_in_at)) {
        map.set(p.user_id, p);
      }
    }
    return adminData.employees.map((emp) => ({
      ...emp,
      lastPunch: map.get(emp.id) ?? null,
    }));
  })();

  return (
    <DashboardLayout role="admin">
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              Hola, {firstName} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Panel Estratégico</p>
          </div>
          <div className="flex items-center gap-3">
            {companyData?.subscription_status === "trialing" && trialDaysLeft !== null && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning">
                <Clock className="w-3 h-3" />
                {trialDaysLeft} días de prueba
              </span>
            )}
            <LiveClock />
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Empleados Activos",
              value: totalEmployees,
              icon: Users,
              color: "text-primary",
              bg: "bg-primary/10",
            },
            {
              label: "Eficiencia Hoy",
              value: `${efficiency}%`,
              icon: TrendingUp,
              color: "text-success",
              bg: "bg-success/10",
            },
            {
              label: "Retrasos Hoy",
              value: delays,
              icon: AlertCircle,
              color: "text-destructive",
              bg: "bg-destructive/10",
            },
            {
              label: "Licencia Restante",
              value: trialDaysLeft !== null ? `${trialDaysLeft}d` : "∞",
              icon: CalendarDays,
              color: "text-warning",
              bg: "bg-warning/10",
            },
          ].map((card, i) => (
            <div
              key={card.label}
              className={`glass-card rounded-[2rem] p-5 space-y-3 animate-fade-in-up stagger-${i + 1}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
                <div className={`w-8 h-8 rounded-xl ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-3xl font-bold text-foreground">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Chart + Live Monitoring */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Chart */}
          <div className="lg:col-span-3 glass-card rounded-[2.5rem] p-6 animate-fade-in-up stagger-5">
            <h2 className="text-base font-semibold text-foreground mb-4">Asistencia Semanal</h2>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "1rem",
                      fontSize: "12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    }}
                    labelStyle={{ fontWeight: 600 }}
                    cursor={{ fill: "hsl(var(--muted))", radius: 8 } as any}
                  />
                  <Bar
                    dataKey="asistencias"
                    name="Asistencias"
                    fill="hsl(var(--primary))"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Live Monitoring */}
          <div className="lg:col-span-2 glass-card rounded-[2.5rem] p-6 animate-fade-in-up stagger-6">
            <h2 className="text-base font-semibold text-foreground mb-4">Monitoreo en Vivo</h2>
            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {latestPunches.map((emp) => {
                const isActive = emp.lastPunch?.status === "active";
                const hasToday = emp.lastPunch?.clock_in_at && new Date(emp.lastPunch.clock_in_at).toDateString() === new Date().toDateString();
                const wasLate = hasToday && new Date(emp.lastPunch.clock_in_at).getHours() >= 9;

                let status: { label: string; color: string; Icon: typeof CheckCircle2 };
                if (isActive) {
                  status = { label: "Activo", color: "text-success", Icon: CircleDot };
                } else if (hasToday && wasLate) {
                  status = { label: "Retraso", color: "text-warning", Icon: AlertCircle };
                } else if (hasToday) {
                  status = { label: "Puntual", color: "text-success", Icon: CheckCircle2 };
                } else {
                  status = { label: "Ausente", color: "text-destructive", Icon: XCircle };
                }

                return (
                  <div key={emp.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {(emp.full_name || emp.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{emp.full_name || emp.email}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {emp.lastPunch?.clock_in_at
                          ? format(new Date(emp.lastPunch.clock_in_at), "hh:mm a", { locale: es })
                          : "Sin registro"}
                      </p>
                    </div>
                    {/* Status */}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${status.color}`}>
                      <status.Icon className={`w-3 h-3 ${isActive ? "animate-pulse" : ""}`} />
                      {status.label}
                    </span>
                  </div>
                );
              })}
              {latestPunches.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Sin empleados registrados</p>
              )}
            </div>
          </div>
        </div>

        {/* Hours per Employee Table */}
        {adminData?.total_hours_per_employee && adminData.total_hours_per_employee.length > 0 && (
          <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-6">
            <div className="px-6 lg:px-8 pt-6 pb-4">
              <h2 className="text-base font-semibold text-foreground">Horas por Empleado</h2>
            </div>
            <div className="px-4 lg:px-6 pb-6 space-y-2">
              {adminData.total_hours_per_employee.map((row) => {
                const maxHours = Math.max(...adminData.total_hours_per_employee.map((r) => r.total_hours), 1);
                const pct = (row.total_hours / maxHours) * 100;
                return (
                  <div key={row.user_id} className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-foreground min-w-[140px] truncate">
                      {getEmployeeName(row.user_id)}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-foreground min-w-[60px] text-right">
                      {formatHours(row.total_hours)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
