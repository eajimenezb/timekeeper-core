import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLiveTimer } from "@/hooks/useLiveTimer";
import { useFaceEnrollment } from "@/hooks/useFaceEnrollment";
import DashboardLayout from "@/components/DashboardLayout";
import FaceCapture from "@/components/FaceCapture";
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
  ScanFace,
  X,
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

function metersToFt(m: number) {
  return Math.round(m * 3.28084);
}

function formatDistance(meters: number) {
  const ft = meters * 3.28084;
  if (ft < 1) return `${Math.round(meters * 39.3701)} in`;
  if (ft >= 5280) return `${(ft / 5280).toFixed(1)} mi`;
  return `${Math.round(ft)} ft`;
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
  const { settings } = useCompanySettings();
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
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);

  // Face recognition state
  const { enroll, verify, checkStatus, enrolling, verifying } = useFaceEnrollment();
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [faceMode, setFaceMode] = useState<"enroll" | "verify">("verify");
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState<boolean | null>(null);

  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Usuario";

  // Check face enrollment status
  useEffect(() => {
    if (profile?.id) {
      checkStatus().then((res) => {
        if (res) setFaceEnrolled(res.enrolled);
      });
    }
  }, [profile?.id]);

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

  // Reverse geocode position to address
  useEffect(() => {
    if (!geoPosition) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${geoPosition.lat}&lon=${geoPosition.lng}&zoom=18&addressdetails=1`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          if (data.display_name) {
            const parts = data.display_name.split(", ");
            const addr = parts.length >= 3
              ? `${parts[0]} ${parts[1]}, ${parts[2]}`
              : parts.slice(0, 3).join(", ");
            setDetectedAddress(addr);
          }
        })
        .catch(() => {});
    }, 1000);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [geoPosition?.lat?.toFixed(3), geoPosition?.lng?.toFixed(3)]);

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

  const { data: userLocation } = useQuery({
    queryKey: ["user-location", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      const { data: userData } = await supabase.from("users").select("location_id" as any).eq("id", profile.id).single();
      if (!(userData as any)?.location_id) return null;
      const { data: loc } = await (supabase.from as any)("locations").select("*").eq("id", (userData as any).location_id).single();
      return loc as { id: string; name: string; lat: number; lng: number; error_margin_meters: number; address: string | null; logo_url: string | null } | null;
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
    onSuccess: () => { punchInProgressRef.current = false; setFaceVerified(false); queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] }); toast({ title: t("shiftStarted") }); },
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
    onSuccess: () => { punchInProgressRef.current = false; setFaceVerified(false); queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] }); toast({ title: t("shiftEnded") }); },
    onError: (e: Error) => { punchInProgressRef.current = false; toast({ title: t("endError"), description: e.message, variant: "destructive" }); },
  });

  const isClockedIn = data?.current_status === "clocked_in";
  const activeEntry = data?.history?.find((e: any) => e.status === "active");
  const elapsed = useLiveTimer(activeEntry?.clock_in_at, isClockedIn);

  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const distanceToWork = geoPosition && userLocation
    ? getDistanceMeters(geoPosition.lat, geoPosition.lng, userLocation.lat, userLocation.lng)
    : null;

  const gpsVerified = geoPosition && distanceToWork !== null && distanceToWork < maxErrorMargin;

  // Both GPS + Face required to punch
  const canPunch = gpsVerified && faceVerified;

  // Handle face verification flow
  const handlePunchClick = () => {
    if (!faceEnrolled) {
      // Prompt enrollment
      setFaceMode("enroll");
      setShowFaceCapture(true);
      return;
    }
    if (!faceVerified) {
      // Require face verification
      setFaceMode("verify");
      setShowFaceCapture(true);
      return;
    }
    // Already verified, proceed with punch
    if (isClockedIn) clockOut.mutate();
    else clockIn.mutate();
  };

  const handleFaceCapture = async (result: any) => {
    if (faceMode === "enroll") {
      const res = await enroll(result);
      if (res) {
        setFaceEnrolled(true);
        setShowFaceCapture(false);
        // Now prompt verification
        toast({ title: lang === "es" ? "Ahora verifica tu rostro para marcar" : "Now verify your face to punch" });
      }
    } else {
      const res = await verify(result);
      if (res) {
        if (res.match) {
          setFaceVerified(true);
          setShowFaceCapture(false);
          toast({ title: lang === "es" ? `Rostro verificado (${res.confidence}% confianza)` : `Face verified (${res.confidence}% confidence)` });
          // Auto-trigger punch after successful verification
          if (gpsVerified) {
            if (isClockedIn) clockOut.mutate();
            else clockIn.mutate();
          }
        } else {
          setShowFaceCapture(false);
          toast({
            title: lang === "es" ? "Rostro no coincide" : "Face doesn't match",
            description: lang === "es" ? "Intenta de nuevo mirando directamente a la cámara" : "Try again looking directly at the camera",
            variant: "destructive",
          });
        }
      }
    }
  };

  // Reset face verification when status changes (after punch)
  useEffect(() => {
    setFaceVerified(false);
  }, [isClockedIn]);

  return (
    <DashboardLayout role="employee">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {settings?.welcome_message || t("hello")}, {firstName} {settings?.use_emojis !== false ? "👋" : ""}
            </h1>
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

            {/* Face verification status */}
            {gpsVerified && (
              <div className={`px-5 py-3 rounded-2xl text-center ${faceVerified ? "bg-success/10 border border-success/20" : faceEnrolled === false ? "bg-warning/10 border border-warning/20" : "bg-muted border border-border"}`}>
                <p className={`text-sm font-semibold flex items-center justify-center gap-2 ${faceVerified ? "text-success" : faceEnrolled === false ? "text-warning" : "text-muted-foreground"}`}>
                  <ScanFace className="w-4 h-4" />
                  {faceVerified
                    ? (lang === "es" ? "Rostro verificado ✓" : "Face verified ✓")
                    : faceEnrolled === false
                    ? (lang === "es" ? "Registro facial requerido" : "Face enrollment required")
                    : (lang === "es" ? "Verificación facial requerida" : "Face verification required")}
                </p>
              </div>
            )}

            <button
              onClick={handlePunchClick}
              disabled={clockIn.isPending || clockOut.isPending || !gpsVerified}
              className={`group relative w-40 h-40 lg:w-48 lg:h-48 rounded-full flex flex-col items-center justify-center text-white font-bold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:scale-105 hover:shadow-2xl ${
                isClockedIn
                  ? "bg-gradient-to-br from-destructive to-destructive/80 shadow-[0_8px_32px_hsl(347,77%,50%,0.3)]"
                  : "bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_32px_hsl(234,89%,64%,0.3)]"
              }`}
            >
              {faceVerified ? (
                isClockedIn ? (
                  <><Square className="w-10 h-10 mb-2" /><span className="text-sm font-semibold">{t("endShift")}</span><span className="text-xs opacity-80">{t("shift")}</span></>
                ) : (
                  <><Play className="w-10 h-10 mb-2 ml-1" /><span className="text-sm font-semibold">{t("startShift")}</span><span className="text-xs opacity-80">{t("shift")}</span></>
                )
              ) : (
                <><ScanFace className="w-10 h-10 mb-2" /><span className="text-sm font-semibold">{faceEnrolled === false ? (lang === "es" ? "Registrar" : "Enroll") : (lang === "es" ? "Verificar" : "Verify")}</span><span className="text-xs opacity-80">{lang === "es" ? "Rostro" : "Face"}</span></>
              )}
              {isClockedIn && faceVerified && <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20" />}
            </button>

            {/* Extra manual punch button when face is already verified */}
            {faceVerified && gpsVerified && (
              <button
                onClick={() => isClockedIn ? clockOut.mutate() : clockIn.mutate()}
                disabled={clockIn.isPending || clockOut.isPending}
                className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-95 hover:scale-105 ${
                  isClockedIn
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20"
                    : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                }`}
              >
                {isClockedIn ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isClockedIn
                  ? (lang === "es" ? "Marcar salida" : "Punch Out")
                  : (lang === "es" ? "Marcar entrada" : "Punch In")}
              </button>
            )}

            <div className="flex items-center gap-4 sm:gap-8 text-center">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("today")}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">{data ? formatHours(data.daily_total_hours) : "—"}</p>
              </div>
              <div className="w-px h-8 bg-border shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("week")}</p>
                <p className="text-lg sm:text-xl font-bold text-foreground whitespace-nowrap">{data ? formatHours(data.weekly_total_hours) : "—"}</p>
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
                      <span className="font-mono text-foreground/80 text-right max-w-[200px] truncate">{detectedAddress || `${geoPosition.lat.toFixed(4)}, ${geoPosition.lng.toFixed(4)}`}</span>
                    </div>
                    {userLocation && (
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-muted-foreground shrink-0">{lang === "es" ? <><span>Ubicación</span><br /><span>asignada</span></> : <><span>Assigned</span><br /><span>Location</span></>}</span>
                        <span className="font-mono text-foreground/80 text-right truncate">{userLocation.name}{userLocation.address ? ` — ${userLocation.address}` : ""}</span>
                      </div>
                    )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("errorMargin")}</span>
                    <span className={`font-semibold ${(distanceToWork ?? Infinity) < maxErrorMargin / 2 ? "text-success" : (distanceToWork ?? Infinity) < maxErrorMargin ? "text-warning" : "text-destructive"}`}>
                      {distanceToWork !== null ? formatDistance(distanceToWork) : "—"} / {formatDistance(maxErrorMargin)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${(distanceToWork ?? Infinity) < maxErrorMargin / 2 ? "bg-success" : (distanceToWork ?? Infinity) < maxErrorMargin ? "bg-warning" : "bg-destructive"}`} style={{ width: `${Math.max(5, Math.min(100, distanceToWork !== null ? ((maxErrorMargin - distanceToWork) / maxErrorMargin) * 100 : 0))}%` }} />
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
          <div className="px-2 sm:px-4 lg:px-6 pb-6 overflow-x-auto">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("loading")}</p>
            ) : data?.history && data.history.length > 0 ? (
              <div className="space-y-2 min-w-[480px]">
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
                    <div className="ml-auto text-right min-w-[60px]">
                      <span className="text-sm font-semibold text-foreground">{entry.total_seconds ? formatHours(entry.total_seconds / 3600) : "—"}</span>
                    </div>
                    <div>
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
            {data?.history && data.history.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 mt-2 rounded-2xl bg-primary/5 border border-primary/10">
                <span className="text-sm font-semibold text-foreground">{lang === "es" ? "Tiempo total" : "Total time"}</span>
                <span className="text-sm font-bold text-primary font-mono">
                  {formatHours(data.history.reduce((sum: number, e: any) => sum + (e.total_seconds ? e.total_seconds / 3600 : 0), 0))}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Face Capture Modal */}
      {showFaceCapture && (
        <div className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowFaceCapture(false)}>
          <div className="bg-card rounded-[2rem] p-6 w-full max-w-md shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {faceMode === "enroll"
                  ? (lang === "es" ? "Registrar tu rostro" : "Enroll your face")
                  : (lang === "es" ? "Verificar tu rostro" : "Verify your face")}
              </h3>
              <button onClick={() => setShowFaceCapture(false)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <FaceCapture
              mode={faceMode}
              autoStart
              onCapture={handleFaceCapture}
              onCancel={() => setShowFaceCapture(false)}
            />
            {(enrolling || verifying) && (
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
