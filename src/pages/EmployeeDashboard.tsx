import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLiveTimer } from "@/hooks/useLiveTimer";
import DashboardLayout from "@/components/DashboardLayout";
import {
  MapPin,
  Shield,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  Play,
  Square,
} from "lucide-react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const punchInProgressRef = useRef(false);
  const dateFnsLocale = lang === "es" ? es : enUS;

  const [geoPosition, setGeoPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Usuario";

  // Watch GPS
  useEffect(() => {
    if (!navigator.geolocation) { setGeoError(t("browserNoGeo")); return; }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGeoError(null); },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, { center: [4.711, -74.0721], zoom: 16, zoomControl: false, attributionControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mapInstanceRef.current);
    }
    if (geoPosition) {
      const { lat, lng, accuracy } = geoPosition;
      const map = mapInstanceRef.current;
      if (markerRef.current) { markerRef.current.setLatLng([lat, lng]); }
      else {
        const icon = L.divIcon({ className: "", html: `<div style="width:14px;height:14px;background:hsl(234,89%,64%);border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(99,102,241,0.5);"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }
      if (circleRef.current) { circleRef.current.setLatLng([lat, lng]).setRadius(accuracy); }
      else { circleRef.current = L.circle([lat, lng], { radius: accuracy, color: "hsl(234, 89%, 64%)", fillColor: "hsl(234, 89%, 64%)", fillOpacity: 0.1, weight: 1 }).addTo(map); }
      map.setView([lat, lng], map.getZoom());
    }
  }, [geoPosition]);

  useEffect(() => { return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; markerRef.current = null; circleRef.current = null; } }; }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["employee-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("employee_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data as { current_status: string; daily_total_hours: number; weekly_total_hours: number; history: any[] };
    },
  });

  // Fetch user's assigned location for error margin
  const { data: userLocation } = useQuery({
    queryKey: ["user-location", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data: userData } = await supabase.from("users").select("location_id" as any).eq("id", profile.id).single();
      if (!(userData as any)?.location_id) return null;
      const { data: loc } = await (supabase.from as any)("locations").select("*").eq("id", (userData as any).location_id).single();
      return loc as { id: string; name: string; lat: number; lng: number; error_margin_meters: number } | null;
    },
    enabled: !!profile?.id,
  });

  const maxErrorMargin = userLocation?.error_margin_meters ?? 100;

  const clockIn = useMutation({
    mutationFn: async () => {
      if (punchInProgressRef.current) throw new Error("Already processing");
      punchInProgressRef.current = true;
      if (!geoPosition) { punchInProgressRef.current = false; throw new Error(t("gpsError")); }
      const { data, error } = await supabase.functions.invoke("clock_in", { body: { lat: geoPosition.lat, lng: geoPosition.lng } });
      if (error) { punchInProgressRef.current = false; throw error; }
      if (!data.success) { punchInProgressRef.current = false; throw new Error(data.error); }
      return data;
    },
    onSuccess: () => { punchInProgressRef.current = false; queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] }); toast({ title: t("shiftStarted") }); },
    onError: (e: Error) => { punchInProgressRef.current = false; toast({ title: t("startError"), description: e.message, variant: "destructive" }); },
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (punchInProgressRef.current) throw new Error("Already processing");
      punchInProgressRef.current = true;
      if (!geoPosition) { punchInProgressRef.current = false; throw new Error(t("gpsError")); }
      const { data, error } = await supabase.functions.invoke("clock_out", { body: { lat: geoPosition.lat, lng: geoPosition.lng } });
      if (error) { punchInProgressRef.current = false; throw error; }
      if (!data.success) { punchInProgressRef.current = false; throw new Error(data.error); }
      return data;
    },
    onSuccess: () => { punchInProgressRef.current = false; queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] }); toast({ title: t("shiftEnded") }); },
    onError: (e: Error) => { punchInProgressRef.current = false; toast({ title: t("endError"), description: e.message, variant: "destructive" }); },
  });

  const isClockedIn = data?.current_status === "clocked_in";
  const activeEntry = data?.history?.find((e: any) => e.status === "active");
  const elapsed = useLiveTimer(activeEntry?.clock_in_at, isClockedIn);
  const gpsVerified = geoPosition && geoPosition.accuracy < maxErrorMargin;

  return (
    <DashboardLayout role="employee">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {t("hello")}, {firstName} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{t("employeePanel")}</p>
          </div>
          <LiveClock />
        </div>

        {/* Clock Button + GPS */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 glass-card-elevated rounded-[2.5rem] p-8 flex flex-col items-center justify-center space-y-6 animate-fade-in-up stagger-1">
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase ${isClockedIn ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
              <CircleDot className={`w-3 h-3 ${isClockedIn ? "animate-pulse" : ""}`} />
              {isClockedIn ? t("onShift") : t("offShift")}
            </div>

            {isClockedIn && (
              <p className="text-5xl lg:text-6xl font-mono font-bold text-foreground tracking-wider animate-scale-in">{elapsed}</p>
            )}

            {!gpsVerified && geoPosition && (
              <div className="px-5 py-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-center">
                <p className="text-sm font-semibold text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {lang === "es" ? "Estás fuera del rango de marcación, lo que significa que estás fuera de la propiedad" : "You are out of the punch range, which means you are out of the property"}
                </p>
              </div>
            )}

            <button
              onClick={() => isClockedIn ? clockOut.mutate() : clockIn.mutate()}
              disabled={clockIn.isPending || clockOut.isPending || !gpsVerified}
              className={`group relative w-40 h-40 lg:w-48 lg:h-48 rounded-full flex flex-col items-center justify-center text-white font-bold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:scale-105 hover:shadow-2xl ${isClockedIn ? "bg-gradient-to-br from-destructive to-destructive/80 shadow-[0_8px_32px_hsl(347,77%,50%,0.3)]" : "bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_32px_hsl(234,89%,64%,0.3)]"}`}
            >
              {isClockedIn ? (
                <><Square className="w-10 h-10 mb-2" /><span className="text-sm font-semibold">{t("endShift")}</span><span className="text-xs opacity-80">{t("shift")}</span></>
              ) : (
                <><Play className="w-10 h-10 mb-2 ml-1" /><span className="text-sm font-semibold">{t("startShift")}</span><span className="text-xs opacity-80">{t("shift")}</span></>
              )}
              {isClockedIn && <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20" />}
            </button>

            <div className="flex items-center gap-8 text-center">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("today")}</p>
                <p className="text-xl font-bold text-foreground">{data ? formatHours(data.daily_total_hours) : "—"}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("week")}</p>
                <p className="text-xl font-bold text-foreground">{data ? formatHours(data.weekly_total_hours) : "—"}</p>
              </div>
            </div>
          </div>

          {/* GPS */}
          <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
            <div className="glass-card rounded-[2rem] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  {t("geofence")}
                </h3>
                {gpsVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success"><ShieldCheck className="w-3 h-3" />{t("gpsVerified")}</span>
                ) : geoPosition ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning"><Shield className="w-3 h-3" />{t("lowAccuracy")}</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground"><Shield className="w-3 h-3" />{t("acquiring")}</span>
                )}
              </div>
              {geoError && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {geoError}</p>}
              {geoPosition && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("detectedLocation")}</span>
                    <span className="font-mono text-foreground/80">{geoPosition.lat.toFixed(4)}, {geoPosition.lng.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("errorMargin")}</span>
                    <span className={`font-semibold ${geoPosition.accuracy < maxErrorMargin / 2 ? "text-success" : geoPosition.accuracy < maxErrorMargin ? "text-warning" : "text-destructive"}`}>±{Math.round(geoPosition.accuracy)} / {maxErrorMargin} {t("meters")}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${geoPosition.accuracy < maxErrorMargin / 2 ? "bg-success" : geoPosition.accuracy < maxErrorMargin ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.max(5, Math.min(100, ((maxErrorMargin - geoPosition.accuracy) / maxErrorMargin) * 100))}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="glass-card rounded-[2rem] overflow-hidden">
              <div ref={mapRef} className="w-full h-[200px] lg:h-[220px]" style={{ zIndex: 0 }} />
            </div>
          </div>
        </div>

        {/* Weekly History */}
        <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-3">
          <div className="px-6 lg:px-8 pt-6 pb-4">
            <h2 className="text-base font-semibold text-foreground">{t("weeklyActivity")}</h2>
          </div>
          <div className="px-4 lg:px-6 pb-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("loading")}</p>
            ) : data?.history && data.history.length > 0 ? (
              <div className="space-y-2">
                {data.history.map((entry: any) => (
                  <div key={entry.id} className="flex items-center gap-3 lg:gap-4 px-4 py-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors duration-200">
                    <div className="min-w-[80px]">
                      <p className="text-xs font-semibold text-foreground">{entry.clock_in_at ? format(new Date(entry.clock_in_at), "EEE d MMM", { locale: dateFnsLocale }) : "—"}</p>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm font-mono font-medium text-foreground">{entry.clock_in_at ? format(new Date(entry.clock_in_at), "hh:mm a") : "—"}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.clock_out_at ? "bg-destructive" : "bg-muted-foreground/30"}`} />
                      <span className={`text-sm font-mono font-medium ${entry.clock_out_at ? "text-foreground" : "text-muted-foreground"}`}>{entry.clock_out_at ? format(new Date(entry.clock_out_at), "hh:mm a") : t("pending")}</span>
                    </div>
                    <div className="ml-auto text-right">
                      <span className="text-sm font-semibold text-foreground">{entry.total_seconds ? formatHours(entry.total_seconds / 3600) : "—"}</span>
                    </div>
                    <div className="hidden sm:block">
                      {entry.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-success/10 text-success"><CircleDot className="w-2.5 h-2.5 animate-pulse" /> {t("active")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground"><CheckCircle2 className="w-2.5 h-2.5" /> {t("completed")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">{t("noRecordsYet")}</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
