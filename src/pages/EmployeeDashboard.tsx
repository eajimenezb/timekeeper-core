import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, LogIn, LogOut, Timer, CalendarDays, MapPin, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useLiveTimer } from "@/hooks/useLiveTimer";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function EmployeeDashboard() {
  const { profile, signOut } = useAuth();
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

  // Watch GPS position continuously
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGeoError(null);
      },
      (err) => {
        setGeoError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Initialize & update Leaflet map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [0, 0],
        zoom: 16,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapInstanceRef.current);
    }

    if (geoPosition) {
      const { lat, lng, accuracy } = geoPosition;
      const map = mapInstanceRef.current;

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        // Custom icon to avoid missing default marker issue
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;background:hsl(221,83%,53%);border:3px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.4);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
      }

      if (circleRef.current) {
        circleRef.current.setLatLng([lat, lng]);
        circleRef.current.setRadius(accuracy);
      } else {
        circleRef.current = L.circle([lat, lng], {
          radius: accuracy,
          color: "hsl(221, 83%, 53%)",
          fillColor: "hsl(221, 83%, 53%)",
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(map);
      }

      map.setView([lat, lng], map.getZoom());
    }
  }, [geoPosition]);

  // Cleanup map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

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
      if (!geoPosition) throw new Error("Unable to get your location. Please enable GPS.");
      const { data, error } = await supabase.functions.invoke("clock_in", {
        body: { lat: geoPosition.lat, lng: geoPosition.lng },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      toast({ title: "Clocked in!" });
    },
    onError: (e: Error) => toast({ title: "Clock in failed", description: e.message, variant: "destructive" }),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!geoPosition) throw new Error("Unable to get your location. Please enable GPS.");
      const { data, error } = await supabase.functions.invoke("clock_out", {
        body: { lat: geoPosition.lat, lng: geoPosition.lng },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard"] });
      toast({ title: "Clocked out!" });
    },
    onError: (e: Error) => toast({ title: "Clock out failed", description: e.message, variant: "destructive" }),
  });

  const isClockedIn = data?.current_status === "clocked_in";
  const activeEntry = data?.history?.find((e: any) => e.status === "active");
  const elapsed = useLiveTimer(activeEntry?.clock_in_at, isClockedIn);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Timekeeper</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{profile?.full_name || profile?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Clock In/Out + Map */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="flex flex-col items-center py-8 space-y-4">
              <Badge variant={isClockedIn ? "default" : "secondary"} className="text-sm px-4 py-1">
                {isClockedIn ? "Clocked In" : "Clocked Out"}
              </Badge>
              {isClockedIn && (
                <p className="text-4xl font-mono font-bold text-foreground tracking-wider">{elapsed}</p>
              )}
              {isClockedIn ? (
                <Button size="lg" variant="destructive" onClick={() => clockOut.mutate()} disabled={clockOut.isPending || !geoPosition}>
                  <LogOut className="w-5 h-5 mr-2" /> Clock Out
                </Button>
              ) : (
                <Button size="lg" onClick={() => clockIn.mutate()} disabled={clockIn.isPending || !geoPosition}>
                  <LogIn className="w-5 h-5 mr-2" /> Clock In
                </Button>
              )}
              {!geoPosition && !geoError && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Acquiring GPS...
                </p>
              )}
              {geoError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {geoError}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Map Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Your Location
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-4 px-4">
              <div
                ref={mapRef}
                className="w-full h-[250px] rounded-md border overflow-hidden"
                style={{ zIndex: 0 }}
              />
              {geoPosition && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Margen de Error: ±{Math.round(geoPosition.accuracy)} metros
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
              <Timer className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data ? formatHours(data.daily_total_hours) : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data ? formatHours(data.weekly_total_hours) : "—"}</p>
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Punches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.history?.map((entry: any) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.clock_in_at ? format(new Date(entry.clock_in_at), "MMM d, yyyy") : "—"}</TableCell>
                      <TableCell>{entry.clock_in_at ? format(new Date(entry.clock_in_at), "h:mm a") : "—"}</TableCell>
                      <TableCell>{entry.clock_out_at ? format(new Date(entry.clock_out_at), "h:mm a") : "—"}</TableCell>
                      <TableCell>{entry.total_seconds ? formatHours(entry.total_seconds / 3600) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "active" ? "default" : "secondary"}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data?.history || data.history.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">No punches yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
