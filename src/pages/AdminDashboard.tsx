import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useFaceEnrollment } from "@/hooks/useFaceEnrollment";
import DashboardLayout from "@/components/DashboardLayout";
import AdminSettings from "@/components/AdminSettings";
import FaceCapture from "@/components/FaceCapture";
import {
  Users,
  AlertCircle,
  CalendarDays,
  Clock,
  CircleDot,
  CheckCircle2,
  XCircle,
  UserPlus,
  Pencil,
  Archive,
  RotateCcw,
  ClipboardEdit,
  X,
  Save,
  ChevronDown,
  MapPin,
  Plus,
  Trash2,
  Upload,
  Image,
  Coffee,
  Download,
  ScanFace,
} from "lucide-react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
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
  const { lang } = useLanguage();
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-sm font-semibold text-muted-foreground tabular-nums">
      {time.toLocaleTimeString(lang === "es" ? "es-CO" : "en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
    </span>
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("panel");
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const { settings } = useCompanySettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateFnsLocale = lang === "es" ? es : enUS;

  // Modals
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [empForm, setEmpForm] = useState({ full_name: "", email: "", role: "employee", location_id: "" });
  const [setupLink, setSetupLink] = useState<string | null>(null);

  const [showPunchModal, setShowPunchModal] = useState(false);
  const [editingPunch, setEditingPunch] = useState<any>(null);
  const [punchForm, setPunchForm] = useState({ clock_in_at: "", clock_out_at: "" });

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [locForm, setLocForm] = useState({ name: "", address: "", lat: "", lng: "", error_margin_meters: "100", break_after_hours: "", break_duration_minutes: "" });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Face enrollment state
  const { enroll: faceEnroll, checkStatus: faceCheckStatus, enrolling: faceEnrolling } = useFaceEnrollment();
  const [showFaceEnrollModal, setShowFaceEnrollModal] = useState(false);
  const [faceEnrollTargetId, setFaceEnrollTargetId] = useState<string | null>(null);
  const [faceEnrollTargetName, setFaceEnrollTargetName] = useState<string>("");
  const [faceStatuses, setFaceStatuses] = useState<Record<string, boolean>>({});

  const geocodeAddress = useCallback(async (address: string) => {
    if (!address.trim()) {
      toast({ title: lang === "es" ? "Ingresa una dirección" : "Enter an address", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const results = await res.json();
      if (results.length > 0) {
        setLocForm(prev => ({ ...prev, lat: results[0].lat, lng: results[0].lon }));
        toast({ title: lang === "es" ? "Coordenadas encontradas" : "Coordinates found" });
      } else {
        toast({ title: lang === "es" ? "No se encontró la dirección" : "Address not found", variant: "destructive" });
      }
    } catch {
      toast({ title: lang === "es" ? "Error al buscar dirección" : "Error searching address", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  }, [lang, toast]);

  const { data: adminData, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data as {
        employees: { id: string; full_name: string; email: string; role: string; is_active: boolean; location_id: string | null; is_confirmed: boolean }[];
        punches: any[];
        total_hours_per_employee: { user_id: string; total_hours: number }[];
      };
    },
  });

  const { data: companyInfo } = useQuery({
    queryKey: ["company-name", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;
      const { data } = await supabase.from("companies").select("name").eq("id", profile.company_id).single();
      return data as { name: string } | null;
    },
    enabled: !!profile?.company_id,
  });
  const companyName = companyInfo?.name || "";

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
  const totalEmployees = adminData?.employees?.filter((e) => e.is_active !== false).length ?? 0;
  const activePunches = adminData?.punches?.filter((p: any) => p.status === "active").length ?? 0;

  const outEmployees = totalEmployees - activePunches;

  const todayPunches = adminData?.punches?.filter((p: any) =>
    p.clock_in_at && new Date(p.clock_in_at).toDateString() === new Date().toDateString()
  ).length ?? 0;

  const trialDaysLeft = companyData?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(companyData.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

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
      days.push({ name: format(d, "EEE", { locale: dateFnsLocale }), asistencias: count });
    }
    return days;
  })();

  const getEmployeeName = (uid: string) => {
    const emp = adminData?.employees?.find((e) => e.id === uid);
    return emp?.full_name || emp?.email || uid.slice(0, 8);
  };

  const latestPunches = (() => {
    if (!adminData?.punches || !adminData?.employees) return [];
    const map = new Map<string, any>();
    for (const p of adminData.punches) {
      if (!map.has(p.user_id) || new Date(p.clock_in_at) > new Date(map.get(p.user_id).clock_in_at)) {
        map.set(p.user_id, p);
      }
    }
    return adminData.employees
      .filter((emp) => emp.role !== "admin")
      .map((emp) => ({ ...emp, lastPunch: map.get(emp.id) ?? null }));
  })();

  // Toggle employee active status (file/activate)
  const toggleEmployeeActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast({ title: lang === "es" ? "Empleado actualizado" : "Employee updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Save employee (create or edit name/role)
  const saveEmployee = useMutation({
    mutationFn: async () => {
      const locationId = empForm.location_id || null;
      if (editingEmployee) {
        const { error } = await supabase.from("users").update({ full_name: empForm.full_name, role: empForm.role, location_id: locationId } as any).eq("id", editingEmployee.id);
        if (error) throw error;
      } else {
        // Use edge function to create auth user + profile
        const res = await supabase.functions.invoke("create_employee", {
          body: {
            email: empForm.email,
            full_name: empForm.full_name,
            role: empForm.role,
            location_id: locationId,
            redirect_to: "https://axistrack.lovable.app/set-password",
          },
        });
        if (res.error) throw new Error(res.error.message || "Failed to create employee");
        if (res.data && !res.data.success) throw new Error(res.data.error || "Failed to create employee");
        // Return the setup link if available
        return res.data?.setup_link || null;
      }
    },
    onSuccess: (link: string | null) => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setShowEmployeeModal(false);
      setEditingEmployee(null);
      if (link) {
        setSetupLink(link);
      } else {
        toast({ title: lang === "es" ? "Guardado" : "Saved" });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Locations
  const { data: locations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("locations").select("*").order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const uploadLogo = async (locationId: string): Promise<string | null> => {
    if (!logoFile) return editingLocation?.logo_url || null;
    setUploadingLogo(true);
    try {
      const ext = logoFile.name.split(".").pop() || "png";
      const path = `${profile!.company_id}/${locationId}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("location-logos").upload(path, logoFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("location-logos").getPublicUrl(path);
      return urlData.publicUrl;
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveLocation = useMutation({
    mutationFn: async () => {
      const breakAfter = locForm.break_after_hours ? parseFloat(locForm.break_after_hours) : null;
      const breakDuration = locForm.break_duration_minutes ? parseInt(locForm.break_duration_minutes) : null;
      const payload: any = {
        name: locForm.name,
        address: locForm.address || null,
        lat: parseFloat(locForm.lat),
        lng: parseFloat(locForm.lng),
        error_margin_meters: Math.round((parseInt(locForm.error_margin_meters) || 328) / 3.28084),
        company_id: profile!.company_id,
        break_after_hours: breakAfter,
        break_duration_minutes: breakDuration,
      };
      if (editingLocation) {
        const logoUrl = await uploadLogo(editingLocation.id);
        payload.logo_url = logoUrl;
        const { error } = await (supabase.from as any)("locations").update(payload).eq("id", editingLocation.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase.from as any)("locations").insert(payload).select("id").single();
        if (error) throw error;
        if (logoFile && inserted?.id) {
          const logoUrl = await uploadLogo(inserted.id);
          await (supabase.from as any)("locations").update({ logo_url: logoUrl }).eq("id", inserted.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setShowLocationModal(false);
      setEditingLocation(null);
      setLogoFile(null);
      setLogoPreview(null);
      toast({ title: t("locationSaved") });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLocation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast({ title: t("locationDeleted") });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreateLocation = () => {
    setEditingLocation(null);
    setLocForm({ name: "", address: "", lat: "", lng: "", error_margin_meters: "328", break_after_hours: "", break_duration_minutes: "" });
    setLogoFile(null);
    setLogoPreview(null);
    setShowLocationModal(true);
  };

  const openEditLocation = (loc: any) => {
    setEditingLocation(loc);
    setLocForm({
      name: loc.name,
      address: loc.address || "",
      lat: String(loc.lat),
      lng: String(loc.lng),
      error_margin_meters: String(Math.round(loc.error_margin_meters * 3.28084)),
      break_after_hours: loc.break_after_hours != null ? String(loc.break_after_hours) : "",
      break_duration_minutes: loc.break_duration_minutes != null ? String(loc.break_duration_minutes) : "",
    });
    setLogoFile(null);
    setLogoPreview(loc.logo_url || null);
    setShowLocationModal(true);
  };

  // Load face enrollment statuses for all employees
  useEffect(() => {
    if (!adminData?.employees) return;
    const loadStatuses = async () => {
      const statuses: Record<string, boolean> = {};
      for (const emp of adminData.employees) {
        if (emp.role === "admin") continue;
        const res = await faceCheckStatus(emp.id);
        if (res) statuses[emp.id] = res.enrolled;
      }
      setFaceStatuses(statuses);
    };
    loadStatuses();
  }, [adminData?.employees]);

  const openFaceEnroll = (empId: string, empName: string) => {
    setFaceEnrollTargetId(empId);
    setFaceEnrollTargetName(empName);
    setShowFaceEnrollModal(true);
  };

  const getLocationName = (locId: string | null) => {
    if (!locId || !locations) return t("noLocation");
    return locations.find((l) => l.id === locId)?.name || t("noLocation");
  };

  // Edit punch
  const savePunch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin_edit_punch", {
        body: {
          punch_id: editingPunch.id,
          clock_in_at: punchForm.clock_in_at || undefined,
          clock_out_at: punchForm.clock_out_at || undefined,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setShowPunchModal(false);
      setEditingPunch(null);
      toast({ title: lang === "es" ? "Marcación actualizada" : "Punch updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCreateEmployee = () => {
    setEditingEmployee(null);
    setEmpForm({ full_name: "", email: "", role: "employee", location_id: "" });
    setShowEmployeeModal(true);
  };

  const openEditEmployee = (emp: any) => {
    setEditingEmployee(emp);
    setEmpForm({ full_name: emp.full_name || "", email: emp.email, role: emp.role, location_id: emp.location_id || "" });
    setShowEmployeeModal(true);
  };

  const openEditPunch = (punch: any) => {
    setEditingPunch(punch);
    const toLocalDatetime = (iso: string) => {
      const d = new Date(iso);
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setPunchForm({
      clock_in_at: punch.clock_in_at ? toLocalDatetime(punch.clock_in_at) : "",
      clock_out_at: punch.clock_out_at ? toLocalDatetime(punch.clock_out_at) : "",
    });
    setShowPunchModal(true);
  };

  // Group completed punches by employee
  const punchesByEmployee = (() => {
    const completed = adminData?.punches
      ?.filter((p: any) => p.status === "completed")
      .sort((a: any, b: any) => new Date(b.clock_in_at).getTime() - new Date(a.clock_in_at).getTime()) ?? [];
    const grouped: Record<string, any[]> = {};
    for (const p of completed) {
      if (!grouped[p.user_id]) grouped[p.user_id] = [];
      grouped[p.user_id].push(p);
    }
    return grouped;
  })();

  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});

  const toggleExpand = (uid: string) => {
    setExpandedEmployees((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const exportCsv = () => {
    if (!adminData?.punches || adminData.punches.length === 0) return;
    const headers = ["Employee,Date,Clock In,Clock Out,Duration (h),Status"];
    const rows = adminData.punches
      .filter((p: any) => p.status === "completed")
      .map((p: any) => {
        const name = getEmployeeName(p.user_id).replace(/,/g, " ");
        const date = p.clock_in_at ? format(new Date(p.clock_in_at), "yyyy-MM-dd") : "";
        const cin = p.clock_in_at ? format(new Date(p.clock_in_at), "hh:mm a") : "";
        const cout = p.clock_out_at ? format(new Date(p.clock_out_at), "hh:mm a") : "";
        const dur = p.total_seconds ? (p.total_seconds / 3600).toFixed(2) : "";
        return `${name},${date},${cin},${cout},${dur},${p.status}`;
      });
    const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout role="admin" activePage={activeTab} onNavClick={setActiveTab}>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {t("hello")}, {firstName} {settings?.use_emojis !== false ? "👋" : ""}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{profile?.company_id ? companyName : t("managerPanel")}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {activeTab === "panel" && (
              <button
                onClick={exportCsv}
                disabled={!adminData?.punches || adminData.punches.length === 0}
                className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}
            {companyData?.subscription_status === "trialing" && trialDaysLeft !== null && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning">
                <Clock className="w-3 h-3" />
                {trialDaysLeft} {t("trialDays")}
              </span>
            )}
            <LiveClock />
          </div>
        </div>

        {/* PANEL TAB: Overview */}
        {activeTab === "panel" && (<>
        {/* Metric Cards — 3 cards, no efficiency */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: t("activeEmployees"), value: totalEmployees, icon: Users, color: "text-primary", bg: "bg-primary/10" },
            { label: t("outEmployees"), value: outEmployees, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
            { label: t("punchesToday"), value: todayPunches, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          ].map((card, i) => (
            <div key={card.label} className={`glass-card rounded-[2rem] p-5 space-y-3 animate-fade-in-up stagger-${i + 1}`}>
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

        {/* Chart then Live Monitoring — stacked vertically */}
        <div className="grid grid-cols-1 gap-6">
          <div className="glass-card rounded-[2.5rem] p-6 animate-fade-in-up stagger-4">
            <h2 className="text-base font-semibold text-foreground mb-4">{t("weeklyAttendance")}</h2>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "1rem", fontSize: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }} labelStyle={{ fontWeight: 600 }} cursor={{ fill: "hsl(var(--muted))", radius: 8 } as any} />
                  <Bar dataKey="asistencias" name={t("attendances")} fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card rounded-[2.5rem] p-6 animate-fade-in-up stagger-5">
            <h2 className="text-base font-semibold text-foreground mb-4">{t("liveMonitoring")}</h2>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {(() => {
                const grouped: Record<string, typeof latestPunches> = {};
                const noLocKey = "__no_location__";
                for (const emp of latestPunches) {
                  const key = (emp as any).location_id || noLocKey;
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(emp);
                }
                for (const key of Object.keys(grouped)) {
                  grouped[key].sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
                }
                const locKeys = Object.keys(grouped).sort((a, b) => {
                  if (a === noLocKey) return 1;
                  if (b === noLocKey) return -1;
                  return getLocationName(a).localeCompare(getLocationName(b));
                });

                if (locKeys.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">{t("noEmployees")}</p>;

                return locKeys.map((locKey) => (
                  <div key={locKey}>
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                        {locKey === noLocKey ? t("noLocation") : getLocationName(locKey)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {grouped[locKey].map((emp) => {
                        const isActive = emp.lastPunch?.status === "active";
                        let status: { label: string; color: string; Icon: typeof CheckCircle2 };
                        if (!(emp as any).is_confirmed) status = { label: t("pending"), color: "text-muted-foreground", Icon: Clock };
                        else if (isActive) status = { label: t("active"), color: "text-success", Icon: CircleDot };
                        else if (!(emp as any).is_active) status = { label: t("inactive"), color: "text-muted-foreground", Icon: XCircle };
                        else status = { label: t("out"), color: "text-warning", Icon: Clock };

                        const empPunches = punchesByEmployee[emp.id] ?? [];
                        const isOpen = expandedEmployees[emp.id] ?? false;

                        return (
                          <div key={emp.id} className="rounded-xl border border-border/30 overflow-hidden">
                            <button
                              onClick={() => toggleExpand(emp.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
                            >
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-bold text-primary">{(emp.full_name || emp.email).charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <p className="text-sm font-medium text-foreground truncate">{emp.full_name || emp.email}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {emp.lastPunch?.clock_in_at ? format(new Date(emp.lastPunch.clock_in_at), "hh:mm a", { locale: dateFnsLocale }) : t("noRecord")}
                                  {empPunches.length > 0 && ` · ${empPunches.length} ${lang === "es" ? "registros" : "records"}`}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase ${status.color} shrink-0`}>
                                <status.Icon className={`w-3 h-3 ${isActive ? "animate-pulse" : ""}`} />
                                {status.label}
                              </span>
                              {empPunches.length > 0 && (
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`} />
                              )}
                            </button>
                            {isOpen && empPunches.length > 0 && (
                              <div className="bg-card border-t border-border/30 divide-y divide-border/20">
                                {empPunches.slice(0, 10).map((punch: any) => (
                                  <div key={punch.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[10px] text-muted-foreground">
                                        {punch.clock_in_at ? format(new Date(punch.clock_in_at), "EEE d MMM, hh:mm a", { locale: dateFnsLocale }) : "—"}
                                        {" → "}
                                        {punch.clock_out_at ? format(new Date(punch.clock_out_at), "hh:mm a", { locale: dateFnsLocale }) : "—"}
                                      </p>
                                    </div>
                                    <span className="text-xs font-semibold text-foreground">{punch.total_seconds ? formatHours(punch.total_seconds / 3600) : "—"}</span>
                                    <button onClick={() => openEditPunch(punch)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={t("editPunch")}>
                                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                                    </button>
                                  </div>
                                ))}
                                <div className="px-4 py-2 flex justify-end">
                                  <button
                                    onClick={() => {
                                      const name = (emp.full_name || emp.email).replace(/,/g, " ");
                                      const headers = ["Date,Clock In,Clock Out,Duration (h),Status"];
                                      const rows = empPunches.map((p: any) => {
                                        const date = p.clock_in_at ? format(new Date(p.clock_in_at), "yyyy-MM-dd") : "";
                                        const cin = p.clock_in_at ? format(new Date(p.clock_in_at), "hh:mm a") : "";
                                        const cout = p.clock_out_at ? format(new Date(p.clock_out_at), "hh:mm a") : "";
                                        const dur = p.total_seconds ? (p.total_seconds / 3600).toFixed(2) : "";
                                        return `${date},${cin},${cout},${dur},${p.status}`;
                                      });
                                      const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = `${name}-punches-${format(new Date(), "yyyy-MM-dd")}.csv`;
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold hover:bg-primary/20 transition-colors"
                                  >
                                    <Download className="w-3 h-3" />
                                    CSV
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
        </>)}

        {/* TEAM TAB: Employee Management */}
        {activeTab === "team" && (<>
        <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-6">
          <div className="px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{t("manageEmployees")}</h2>
            <button
              onClick={openCreateEmployee}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {t("createEmployee")}
            </button>
          </div>
          <div className="px-4 lg:px-6 pb-6 space-y-2">
            {adminData?.employees?.map((emp) => (
              <div key={emp.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{(emp.full_name || emp.email).charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{emp.full_name || emp.email}</p>
                  <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  !(emp as any).is_confirmed ? "bg-warning/10 text-warning" :
                  emp.is_active !== false ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}>
                  {!(emp as any).is_confirmed ? t("pending") : emp.is_active !== false ? t("activeStatus") : t("filed")}
                </span>
                <div className="flex items-center gap-1">
                  {emp.role !== "admin" && (
                    <button
                      onClick={() => openFaceEnroll(emp.id, emp.full_name || emp.email)}
                      className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${faceStatuses[emp.id] ? "text-success" : "text-muted-foreground"}`}
                      title={faceStatuses[emp.id] ? (lang === "es" ? "Rostro registrado — re-registrar" : "Face enrolled — re-enroll") : (lang === "es" ? "Registrar rostro" : "Enroll face")}
                    >
                      <ScanFace className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => openEditEmployee(emp)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={t("editEmployee")}>
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => toggleEmployeeActive.mutate({ id: emp.id, is_active: emp.is_active === false })}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                    title={emp.is_active !== false ? t("fileEmployee") : t("activateEmployee")}
                  >
                    {emp.is_active !== false ? <Archive className="w-3.5 h-3.5 text-warning" /> : <RotateCcw className="w-3.5 h-3.5 text-success" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hours per Employee */}
        {adminData?.total_hours_per_employee && adminData.total_hours_per_employee.length > 0 && (
          <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-6">
            <div className="px-6 lg:px-8 pt-6 pb-4">
              <h2 className="text-base font-semibold text-foreground">{t("hoursPerEmployee")}</h2>
            </div>
            <div className="px-4 lg:px-6 pb-6 space-y-2">
              {adminData.total_hours_per_employee.map((row) => {
                const maxHours = Math.max(...adminData.total_hours_per_employee.map((r) => r.total_hours), 1);
                const pct = (row.total_hours / maxHours) * 100;
                return (
                  <div key={row.user_id} className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors">
                    <span className="text-sm font-medium text-foreground min-w-[140px] truncate">{getEmployeeName(row.user_id)}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-bold text-foreground min-w-[60px] text-right">{formatHours(row.total_hours)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </>)}


        {/* LOCATIONS TAB */}
        {activeTab === "locations" && (<>
        <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-6">
          <div className="px-6 lg:px-8 pt-6 pb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {t("manageLocations")}
            </h2>
            <button
              onClick={openCreateLocation}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("createLocation")}
            </button>
          </div>
          <div className="px-4 lg:px-6 pb-6 space-y-2">
            {(!locations || locations.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-6">{t("noLocations")}</p>
            )}
            {locations?.map((loc) => (
              <div key={loc.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-muted/50 transition-colors">
                {loc.logo_url ? (
                  <img src={loc.logo_url} alt={loc.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{loc.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{loc.address || `${loc.lat}, ${loc.lng}`}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                    ±{Math.round(loc.error_margin_meters * 3.28084)} ft
                  </span>
                  {loc.break_after_hours != null && loc.break_duration_minutes != null && (
                    <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-warning/10 text-warning flex items-center gap-1">
                      <Coffee className="w-2.5 h-2.5" />
                      {loc.break_duration_minutes}min {lang === "es" ? "después de" : "after"} {loc.break_after_hours}h
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditLocation(loc)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => { if (confirm(t("confirmDeleteLocation"))) deleteLocation.mutate(loc.id); }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>)}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (<>
        <AdminSettings />
        </>)}
      </div>

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowEmployeeModal(false)}>
          <div className="bg-card rounded-[2rem] p-6 w-full max-w-md space-y-4 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{editingEmployee ? t("editEmployee") : t("createEmployee")}</h3>
              <button onClick={() => setShowEmployeeModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("name")}</label>
                <input
                  value={empForm.full_name}
                  onChange={(e) => setEmpForm({ ...empForm, full_name: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              {!editingEmployee && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("email")}</label>
                  <input
                    value={empForm.email}
                    onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                    type="email"
                    className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("role")}</label>
                <select
                  value={empForm.role}
                  onChange={(e) => setEmpForm({ ...empForm, role: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="employee">{t("employee")}</option>
                  <option value="admin">{t("administrator")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("assignLocation")}</label>
                <select
                  value={empForm.location_id}
                  onChange={(e) => setEmpForm({ ...empForm, location_id: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">{t("noLocation")}</option>
                  {locations?.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name} (±{Math.round(loc.error_margin_meters * 3.28084)} ft)</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowEmployeeModal(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">{t("cancel")}</button>
              <button
                onClick={() => saveEmployee.mutate()}
                disabled={saveEmployee.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Punch Edit Modal */}
      {showPunchModal && editingPunch && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowPunchModal(false)}>
          <div className="bg-card rounded-[2rem] p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{t("editPunch")}</h3>
              <button onClick={() => setShowPunchModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">{getEmployeeName(editingPunch.user_id)}</p>
            <div className="space-y-3">
              <div className="min-w-0">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("clockIn")}</label>
                <input
                  type="datetime-local"
                  value={punchForm.clock_in_at}
                  onChange={(e) => setPunchForm({ ...punchForm, clock_in_at: e.target.value })}
                  className="w-full min-w-0 max-w-full box-border mt-1 px-2 sm:px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-[11px] sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("clockOut")}</label>
                <input
                  type="datetime-local"
                  value={punchForm.clock_out_at}
                  onChange={(e) => setPunchForm({ ...punchForm, clock_out_at: e.target.value })}
                  className="w-full min-w-0 max-w-full box-border mt-1 px-2 sm:px-3 py-2.5 rounded-xl bg-muted/50 border border-border text-[11px] sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 [&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit-fields-wrapper]:min-w-0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowPunchModal(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">{t("cancel")}</button>
              <button
                onClick={() => savePunch.mutate()}
                disabled={savePunch.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowLocationModal(false)}>
          <div className="bg-card rounded-[2rem] p-6 w-full max-w-md space-y-4 shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">{editingLocation ? t("editLocation") : t("createLocation")}</h3>
              <button onClick={() => setShowLocationModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("locationName")}</label>
                <input
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  placeholder={lang === "es" ? "Ej: Oficina Principal" : "E.g. Main Office"}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("address")}</label>
                <div className="flex gap-2 mt-1">
                  <input
                    value={locForm.address}
                    onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
                    placeholder={lang === "es" ? "Dirección completa" : "Full address"}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); geocodeAddress(locForm.address); } }}
                  />
                  <button
                    type="button"
                    onClick={() => geocodeAddress(locForm.address)}
                    disabled={geocoding || !locForm.address.trim()}
                    className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {geocoding ? (lang === "es" ? "Buscando..." : "Searching...") : (lang === "es" ? "Buscar" : "Search")}
                  </button>
                </div>
                {locForm.lat && locForm.lng && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {lang === "es" ? "Coordenadas:" : "Coordinates:"} {parseFloat(locForm.lat).toFixed(5)}, {parseFloat(locForm.lng).toFixed(5)}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{lang === "es" ? "Margen de error (ft)" : "Error Margin (ft)"}</label>
                <input
                  value={locForm.error_margin_meters}
                  onChange={(e) => setLocForm({ ...locForm, error_margin_meters: e.target.value })}
                  type="number"
                  min="30"
                  max="16400"
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {lang === "es" ? "Radio en pies donde se permite marcar asistencia" : "Radius in feet where punching is allowed"}
                </p>
              </div>
              {/* Logo Upload */}
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{lang === "es" ? "Logo / Foto" : "Logo / Photo"}</label>
                <div className="mt-1 flex items-center gap-3">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" className="w-14 h-14 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-muted/50 border border-dashed border-border flex items-center justify-center">
                      <Image className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {lang === "es" ? "Subir imagen" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setLogoFile(file);
                          setLogoPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
              {/* Break/Lunch Deduction */}
              <div className="pt-2 border-t border-border/50">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Coffee className="w-3 h-3" />
                  {lang === "es" ? "Descuento de descanso / almuerzo" : "Break / Lunch Deduction"}
                </label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">{lang === "es" ? "Después de (horas)" : "After (hours)"}</label>
                    <input
                      value={locForm.break_after_hours}
                      onChange={(e) => setLocForm({ ...locForm, break_after_hours: e.target.value })}
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      placeholder="5"
                      className="w-full mt-0.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">{lang === "es" ? "Duración (minutos)" : "Duration (minutes)"}</label>
                    <input
                      value={locForm.break_duration_minutes}
                      onChange={(e) => setLocForm({ ...locForm, break_duration_minutes: e.target.value })}
                      type="number"
                      min="5"
                      max="120"
                      placeholder="30"
                      className="w-full mt-0.5 px-3 py-2 rounded-xl bg-muted/50 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {lang === "es" ? "Se descontará automáticamente del tiempo diario" : "Will be automatically deducted from daily time"}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowLocationModal(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">{t("cancel")}</button>
              <button
                onClick={() => saveLocation.mutate()}
                disabled={saveLocation.isPending || !locForm.name || !locForm.lat || !locForm.lng || !locForm.address.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Link Dialog */}
      {setupLink && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSetupLink(null)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {lang === "es" ? "Enlace de configuración" : "Setup Link"}
              </h3>
              <button onClick={() => setSetupLink(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? "El correo de invitación no se pudo enviar. Comparte este enlace con el empleado para que configure su contraseña:"
                : "The invitation email could not be sent. Share this link with the employee so they can set their password:"}
            </p>
            <div className="bg-muted rounded-lg p-3">
              <p className="text-xs break-all font-mono text-foreground select-all">{setupLink}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(setupLink);
                toast({ title: lang === "es" ? "Enlace copiado" : "Link copied!" });
              }}
              className="w-full py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition"
            >
              {lang === "es" ? "Copiar enlace" : "Copy Link"}
            </button>
          </div>
        </div>
      )}

      {/* Face Enrollment Modal */}
      {showFaceEnrollModal && faceEnrollTargetId && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowFaceEnrollModal(false)}>
          <div className="bg-card rounded-[2rem] p-6 w-full max-w-md shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {lang === "es" ? "Registrar rostro" : "Enroll face"}
                </h3>
                <p className="text-sm text-muted-foreground">{faceEnrollTargetName}</p>
              </div>
              <button onClick={() => setShowFaceEnrollModal(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <FaceCapture
              mode="enroll"
              autoStart
              onCapture={async (result) => {
                const res = await faceEnroll(result, faceEnrollTargetId);
                if (res) {
                  setFaceStatuses(prev => ({ ...prev, [faceEnrollTargetId!]: true }));
                  setShowFaceEnrollModal(false);
                }
              }}
              onCancel={() => setShowFaceEnrollModal(false)}
            />
            {faceEnrolling && (
              <p className="text-sm text-muted-foreground text-center mt-3 animate-pulse">
                {lang === "es" ? "Procesando..." : "Processing..."}
              </p>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
