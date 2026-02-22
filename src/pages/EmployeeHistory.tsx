import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import {
  CalendarDays,
  Clock,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  MapPin,
  Download,
  Filter,
  TrendingUp,
} from "lucide-react";
import { format, startOfWeek, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { es, enUS } from "date-fns/locale";

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

type Preset = "all" | "thisWeek" | "thisMonth" | "lastMonth" | "custom";

export default function EmployeeHistory() {
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const dateFnsLocale = lang === "es" ? es : enUS;

  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (preset) {
      case "thisWeek":
        return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: now.toISOString() };
      case "thisMonth":
        return { from: startOfMonth(now).toISOString(), to: now.toISOString() };
      case "lastMonth": {
        const lastM = subMonths(now, 1);
        return { from: startOfMonth(lastM).toISOString(), to: endOfMonth(lastM).toISOString() };
      }
      case "custom":
        return {
          from: customFrom ? new Date(customFrom).toISOString() : undefined,
          to: customTo ? new Date(customTo + "T23:59:59").toISOString() : undefined,
        };
      default:
        return { from: undefined, to: undefined };
    }
  }, [preset, customFrom, customTo]);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["employee-history", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("employee_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      let history = (data.data.history || []) as any[];

      if (dateRange.from) {
        history = history.filter((e: any) => e.clock_in_at >= dateRange.from!);
      }
      if (dateRange.to) {
        history = history.filter((e: any) => e.clock_in_at <= dateRange.to!);
      }
      return history;
    },
  });

  const stats = useMemo(() => {
    if (!entries || entries.length === 0) return { totalHours: 0, totalEntries: 0, avgPerDay: 0 };
    const totalSeconds = entries.reduce((sum: number, e: any) => sum + (e.total_seconds || 0), 0);
    const totalHours = totalSeconds / 3600;
    const uniqueDays = new Set(entries.map((e: any) => e.clock_in_at?.slice(0, 10))).size;
    return {
      totalHours: +totalHours.toFixed(2),
      totalEntries: entries.length,
      avgPerDay: uniqueDays > 0 ? +(totalHours / uniqueDays).toFixed(2) : 0,
    };
  }, [entries]);

  const exportCsv = () => {
    if (!entries || entries.length === 0) return;
    const headers = ["Date,Clock In,Clock Out,Duration (h),Status,Location"];
    const rows = entries.map((e: any) => {
      const date = e.clock_in_at ? format(new Date(e.clock_in_at), "yyyy-MM-dd") : "";
      const cin = e.clock_in_at ? format(new Date(e.clock_in_at), "hh:mm a") : "";
      const cout = e.clock_out_at ? format(new Date(e.clock_out_at), "hh:mm a") : "";
      const dur = e.total_seconds ? (e.total_seconds / 3600).toFixed(2) : "";
      const loc = e.clock_in_location || "";
      return `${date},${cin},${cout},${dur},${e.status},${loc}`;
    });
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const presets: { key: Preset; label: string }[] = [
    { key: "thisWeek", label: t("thisWeek") },
    { key: "thisMonth", label: t("thisMonth") },
    { key: "lastMonth", label: t("lastMonth") },
    { key: "all", label: t("allTime") },
    { key: "custom", label: t("custom") },
  ];

  return (
    <DashboardLayout role={profile?.role === "admin" ? "admin" : "employee"} activePage="history">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
              <CalendarDays className="w-7 h-7 text-primary" />
              {t("employeeHistory")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("employeePanel")}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-[2.5rem] p-5 animate-fade-in-up stagger-1">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{t("filterByDate")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all duration-200 ${
                  preset === p.key
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap gap-3 mt-4 animate-fade-in">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("from")}</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("to")}</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
          <div className="glass-card rounded-[2rem] p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("totalHours")}</p>
              <p className="text-2xl font-bold text-foreground">{formatHours(stats.totalHours)}</p>
            </div>
          </div>
          <div className="glass-card rounded-[2rem] p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("totalEntries")}</p>
              <p className="text-2xl font-bold text-foreground">{stats.totalEntries}</p>
            </div>
          </div>
          <div className="glass-card rounded-[2rem] p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-warning/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("avgPerDay")}</p>
              <p className="text-2xl font-bold text-foreground">{formatHours(stats.avgPerDay)}</p>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-3">
          <div className="px-6 lg:px-8 pt-6 pb-4">
            <h2 className="text-base font-semibold text-foreground">{t("history")}</h2>
          </div>
          <div className="px-4 lg:px-6 pb-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("loading")}</p>
            ) : entries && entries.length > 0 ? (
              <div className="space-y-2">
                {/* Header row */}
                <div className="hidden sm:flex items-center gap-3 lg:gap-4 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="min-w-[80px]">{t("date")}</div>
                  <div className="min-w-[90px]">{t("entry")}</div>
                  <div className="w-[14px]" />
                  <div className="min-w-[90px]">{t("exit")}</div>
                  <div className="ml-auto min-w-[70px] text-right">{t("duration")}</div>
                  <div className="min-w-[80px] text-center">{t("status")}</div>
                </div>
                {entries.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 lg:gap-4 px-4 py-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors duration-200"
                  >
                    <div className="min-w-[80px]">
                      <p className="text-xs font-semibold text-foreground">
                        {entry.clock_in_at ? format(new Date(entry.clock_in_at), "EEE d MMM", { locale: dateFnsLocale }) : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm font-mono font-medium text-foreground">
                        {entry.clock_in_at ? format(new Date(entry.clock_in_at), "hh:mm a") : "—"}
                      </span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.clock_out_at ? "bg-destructive" : "bg-muted-foreground/30"}`} />
                      <span className={`text-sm font-mono font-medium ${entry.clock_out_at ? "text-foreground" : "text-muted-foreground"}`}>
                        {entry.clock_out_at ? format(new Date(entry.clock_out_at), "hh:mm a") : t("pending")}
                      </span>
                    </div>
                    <div className="ml-auto text-right min-w-[70px]">
                      <span className="text-sm font-semibold text-foreground">
                        {entry.total_seconds ? formatHours(entry.total_seconds / 3600) : "—"}
                      </span>
                    </div>
                    <div className="hidden sm:block min-w-[80px] text-center">
                      {entry.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-success/10 text-success">
                          <CircleDot className="w-2.5 h-2.5 animate-pulse" /> {t("active")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {t("completed")}
                        </span>
                      )}
                    </div>
                    {entry.clock_in_location && (
                      <div className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">{entry.clock_in_location}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noHistoryFound")}</p>
            )}
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
