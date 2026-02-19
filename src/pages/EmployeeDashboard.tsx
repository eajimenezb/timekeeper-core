import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, LogIn, LogOut, Timer, CalendarDays, MapPin } from "lucide-react";
import { format } from "date-fns";
import { useLiveTimer } from "@/hooks/useLiveTimer";

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function EmployeeDashboard() {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      const { data, error } = await supabase.functions.invoke("clock_in", {
        body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
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
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      const { data, error } = await supabase.functions.invoke("clock_out", {
        body: { lat: pos.coords.latitude, lng: pos.coords.longitude },
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
        {/* Clock In/Out */}
        <Card>
          <CardContent className="flex flex-col items-center py-8 space-y-4">
            <Badge variant={isClockedIn ? "default" : "secondary"} className="text-sm px-4 py-1">
              {isClockedIn ? "Clocked In" : "Clocked Out"}
            </Badge>
            {isClockedIn && (
              <p className="text-4xl font-mono font-bold text-foreground tracking-wider">{elapsed}</p>
            )}
            {isClockedIn ? (
              <Button size="lg" variant="destructive" onClick={() => clockOut.mutate()} disabled={clockOut.isPending}>
                <LogOut className="w-5 h-5 mr-2" /> Clock Out
              </Button>
            ) : (
              <Button size="lg" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}>
                <LogIn className="w-5 h-5 mr-2" /> Clock In
              </Button>
            )}
          </CardContent>
        </Card>

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
