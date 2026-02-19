import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Clock, LogIn, LogOut, Timer, CalendarDays, Users, Filter } from "lucide-react";
import { format } from "date-fns";
import { useLiveTimer } from "@/hooks/useLiveTimer";

function formatHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Time clock data for the admin's own punches
  const { data: clockData } = useQuery({
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
        company: { plan_type: string; subscription_status: string; trial_ends_at: string } | null;
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
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast({ title: "Clocked out!" });
    },
    onError: (e: Error) => toast({ title: "Clock out failed", description: e.message, variant: "destructive" }),
  });

  // Admin dashboard data
  const { data: adminData, isLoading } = useQuery({
    queryKey: ["admin-dashboard", employeeFilter, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (employeeFilter && employeeFilter !== "all") params.employee_id = employeeFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const queryString = new URLSearchParams(params).toString();
      const functionName = queryString ? `admin_dashboard?${queryString}` : "admin_dashboard";

      const { data, error } = await supabase.functions.invoke(functionName);
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data.data as {
        employees: { id: string; full_name: string; email: string; role: string }[];
        punches: any[];
        total_hours_per_employee: { user_id: string; total_hours: number }[];
      };
    },
  });

  const isClockedIn = clockData?.current_status === "clocked_in";
  const activeEntry = clockData?.history?.find((e: any) => e.status === "active");
  const elapsed = useLiveTimer(activeEntry?.clock_in_at, isClockedIn);
  const getEmployeeName = (uid: string) => {
    const emp = adminData?.employees?.find((e) => e.id === uid);
    return emp?.full_name || emp?.email || uid.slice(0, 8);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Timekeeper Admin</h1>
        </div>
        <div className="flex items-center gap-4">
          {clockData?.company && (
            <Badge variant="outline" className="text-xs">
              {clockData.company.subscription_status === "trialing" ? "Trial" : clockData.company.plan_type}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">{profile?.full_name || profile?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>Sign Out</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <Tabs defaultValue="timeclock">
          <TabsList>
            <TabsTrigger value="timeclock">Time Clock</TabsTrigger>
            <TabsTrigger value="team">Team Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="timeclock" className="space-y-6 mt-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
                  <Timer className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{clockData ? formatHours(clockData.daily_total_hours) : "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{clockData ? formatHours(clockData.weekly_total_hours) : "—"}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-6 mt-4">
            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Employees</CardTitle>
                  <Users className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{adminData?.employees?.length ?? "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Punches</CardTitle>
                  <Timer className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{adminData?.punches?.length ?? "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Filters Active</CardTitle>
                  <Filter className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {[employeeFilter !== "all" && employeeFilter, startDate, endDate].filter(Boolean).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <div className="space-y-1 min-w-[200px]">
                  <Label>Employee</Label>
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All employees</SelectItem>
                      {adminData?.employees?.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name || emp.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => { setEmployeeFilter("all"); setStartDate(""); setEndDate(""); }}>
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Hours per employee */}
            {adminData?.total_hours_per_employee && adminData.total_hours_per_employee.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Hours by Employee</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Total Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminData.total_hours_per_employee.map((row) => (
                        <TableRow key={row.user_id}>
                          <TableCell>{getEmployeeName(row.user_id)}</TableCell>
                          <TableCell>{formatHours(row.total_hours)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Punches table */}
            <Card>
              <CardHeader><CardTitle className="text-base">Time Entries</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminData?.punches?.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell>{getEmployeeName(p.user_id)}</TableCell>
                          <TableCell>{p.clock_in_at ? format(new Date(p.clock_in_at), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell>{p.clock_in_at ? format(new Date(p.clock_in_at), "h:mm a") : "—"}</TableCell>
                          <TableCell>{p.clock_out_at ? format(new Date(p.clock_out_at), "h:mm a") : "—"}</TableCell>
                          <TableCell>{p.total_seconds ? formatHours(p.total_seconds / 3600) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!adminData?.punches || adminData.punches.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">No time entries</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
