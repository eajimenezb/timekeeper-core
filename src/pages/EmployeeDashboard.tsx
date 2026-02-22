import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
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
  Clock,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  XCircle,
  Play,
  Square,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export default function EmployeeDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  const [geoPosition, setGeoPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Usuario";

  // Watch GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoError(null);
      },
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
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:14px;height:14px;background:hsl(234,89%,64%);border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(99,102,241,0.5);"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }
      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]).setRadius(accuracy);
      } else {
        circleRef.current = L.circle([lat, lng], {
          radius: accuracy,
          color: "hsl(234, 89%, 64%)",
          fillColor: "hsl(234, 89%, 64%)",
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(map);
      }
      map.setView([lat, lng], map.getZoom());
    }
  }, [geoPosition]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; markerRef.current = null; circleRef.current = null; }
    };
  }, []);

  // Data
  const { data, isLoading } = useQuery({
    queryKey: ["employee-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("employee_dashboard");
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data as {
        current_status: string;
        daily_total_hours: number;
        weekly_total_hours: number;
        history: any[];
      };
    },
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      if (!geoPosition) throw new Error("No se pudo obtener tu ubicación. Activa el GPS.");
      const { data, error } = await supabase.functions.invoke("clock_in", {
        body: { lat: geoPosition.lat, lng: geoPosition.lng },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      toast({ title: "¡Jornada iniciada!" });
    },
    onError: (e: Error) => toast({ title: "Error al iniciar", description: e.message, variant: "destructive" }),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!geoPosition) throw new Error("No se pudo obtener tu ubicación. Activa el GPS.");
      const { data, error } = await supabase.functions.invoke("clock_out", {
        body: { lat: geoPosition.lat, lng: geoPosition.lng },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      toast({ title: "¡Jornada finalizada!" });
    },
    onError: (e: Error) => toast({ title: "Error al finalizar", description: e.message, variant: "destructive" }),
  });

  const isClockedIn = data?.current_status === "clocked_in";
  const activeEntry = data?.history?.find((e: any) => e.status === "active");
  const elapsed = useLiveTimer(activeEntry?.clock_in_at, isClockedIn);

  const gpsVerified = geoPosition && geoPosition.accuracy < 100;

  return (
    <DashboardLayout role="employee">
      <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in-up">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              Hola, {firstName} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Panel de control de asistencia</p>
          </div>
          <LiveClock />
        </div>

        {/* Clock Button + GPS */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Main Clock Card */}
          <div className="lg:col-span-3 glass-card-elevated rounded-[2.5rem] p-8 flex flex-col items-center justify-center space-y-6 animate-fade-in-up stagger-1">
            {/* Status */}
            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase
              ${isClockedIn
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
              }`}
            >
              <CircleDot className={`w-3 h-3 ${isClockedIn ? "animate-pulse" : ""}`} />
              {isClockedIn ? "En Jornada" : "Fuera de Jornada"}
            </div>

            {/* Timer */}
            {isClockedIn && (
              <p className="text-5xl lg:text-6xl font-mono font-bold text-foreground tracking-wider animate-scale-in">
                {elapsed}
              </p>
            )}

            {/* Big button */}
            <button
              onClick={() => isClockedIn ? clockOut.mutate() : clockIn.mutate()}
              disabled={clockIn.isPending || clockOut.isPending || !geoPosition}
              className={`
                group relative w-40 h-40 lg:w-48 lg:h-48 rounded-full flex flex-col items-center justify-center
                text-white font-bold text-lg transition-all duration-300
                disabled:opacity-50 disabled:cursor-not-allowed
                active:scale-95 hover:scale-105 hover:shadow-2xl
                ${isClockedIn
                  ? "bg-gradient-to-br from-destructive to-destructive/80 shadow-[0_8px_32px_hsl(347,77%,50%,0.3)]"
                  : "bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_32px_hsl(234,89%,64%,0.3)]"
                }
              `}
            >
              {isClockedIn ? (
                <>
                  <Square className="w-10 h-10 mb-2" />
                  <span className="text-sm font-semibold">Finalizar</span>
                  <span className="text-xs opacity-80">Jornada</span>
                </>
              ) : (
                <>
                  <Play className="w-10 h-10 mb-2 ml-1" />
                  <span className="text-sm font-semibold">Iniciar</span>
                  <span className="text-xs opacity-80">Jornada</span>
                </>
              )}
              {/* Pulse ring */}
              {isClockedIn && (
                <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20" />
              )}
            </button>

            {/* Stats row */}
            <div className="flex items-center gap-8 text-center">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Hoy</p>
                <p className="text-xl font-bold text-foreground">{data ? formatHours(data.daily_total_hours) : "—"}</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Semana</p>
                <p className="text-xl font-bold text-foreground">{data ? formatHours(data.weekly_total_hours) : "—"}</p>
              </div>
            </div>
          </div>

          {/* GPS / Geofence Card */}
          <div className="lg:col-span-2 space-y-4 animate-fade-in-up stagger-2">
            {/* GPS Status */}
            <div className="glass-card rounded-[2rem] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Geovalla
                </h3>
                {gpsVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 text-success">
                    <ShieldCheck className="w-3 h-3" />
                    GPS Verificado
                  </span>
                ) : geoPosition ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning">
                    <Shield className="w-3 h-3" />
                    Baja Precisión
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                    <Shield className="w-3 h-3" />
                    Adquiriendo...
                  </span>
                )}
              </div>

              {geoError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {geoError}
                </p>
              )}

              {geoPosition && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Ubicación detectada</span>
                    <span className="font-mono text-foreground/80">{geoPosition.lat.toFixed(4)}, {geoPosition.lng.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Margen de Error</span>
                    <span className={`font-semibold ${geoPosition.accuracy < 50 ? "text-success" : geoPosition.accuracy < 100 ? "text-warning" : "text-destructive"}`}>
                      ±{Math.round(geoPosition.accuracy)} metros
                    </span>
                  </div>
                  {/* Accuracy bar */}
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        geoPosition.accuracy < 50 ? "bg-success" : geoPosition.accuracy < 100 ? "bg-warning" : "bg-destructive"
                      }`}
                      style={{ width: `${Math.max(5, Math.min(100, 100 - geoPosition.accuracy))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Map */}
            <div className="glass-card rounded-[2rem] overflow-hidden">
              <div
                ref={mapRef}
                className="w-full h-[200px] lg:h-[220px]"
                style={{ zIndex: 0 }}
              />
            </div>
          </div>
        </div>

        {/* Weekly History */}
        <div className="glass-card rounded-[2.5rem] animate-fade-in-up stagger-3">
          <div className="px-6 lg:px-8 pt-6 pb-4">
            <h2 className="text-base font-semibold text-foreground">Actividad Semanal</h2>
          </div>
          <div className="px-4 lg:px-6 pb-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
            ) : data?.history && data.history.length > 0 ? (
              <div className="space-y-2">
                {data.history.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 lg:gap-4 px-4 py-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors duration-200"
                  >
                    {/* Date */}
                    <div className="min-w-[80px]">
                      <p className="text-xs font-semibold text-foreground">
                        {entry.clock_in_at
                          ? format(new Date(entry.clock_in_at), "EEE d MMM", { locale: es })
                          : "—"}
                      </p>
                    </div>

                    {/* Clock In */}
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className="w-2 h-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm font-mono font-medium text-foreground">
                        {entry.clock_in_at ? format(new Date(entry.clock_in_at), "hh:mm a") : "—"}
                      </span>
                    </div>

                    {/* Separator */}
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />

                    {/* Clock Out */}
                    <div className="flex items-center gap-1.5 min-w-[90px]">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.clock_out_at ? "bg-destructive" : "bg-muted-foreground/30"}`} />
                      <span className={`text-sm font-mono font-medium ${entry.clock_out_at ? "text-foreground" : "text-muted-foreground"}`}>
                        {entry.clock_out_at ? format(new Date(entry.clock_out_at), "hh:mm a") : "Pendiente"}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="ml-auto text-right">
                      <span className="text-sm font-semibold text-foreground">
                        {entry.total_seconds ? formatHours(entry.total_seconds / 3600) : "—"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="hidden sm:block">
                      {entry.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-success/10 text-success">
                          <CircleDot className="w-2.5 h-2.5 animate-pulse" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted text-muted-foreground">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Completado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin registros aún</p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
