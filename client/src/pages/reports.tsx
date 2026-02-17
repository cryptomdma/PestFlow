import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  DollarSign,
  ClipboardList,
  Calendar,
  TrendingUp,
  BarChart3,
  PieChart,
} from "lucide-react";
import type { Customer, Appointment, Invoice, ServiceRecord } from "@shared/schema";

export default function Reports() {
  const { data: customers, isLoading: lc } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: appointments, isLoading: la } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: invoices, isLoading: li } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: services, isLoading: ls } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });

  const loading = lc || la || li || ls;

  const totalRevenue = invoices?.filter((i) => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount), 0) || 0;
  const avgInvoice = invoices && invoices.length > 0 ? totalRevenue / (invoices.filter((i) => i.status === "paid").length || 1) : 0;
  const completedServices = services?.filter((s) => s.confirmed).length || 0;
  const completionRate = services && services.length > 0 ? ((completedServices / services.length) * 100).toFixed(0) : "0";
  const activeCustomers = customers?.filter((c) => c.status === "active").length || 0;
  const commercialCount = customers?.filter((c) => c.customerType === "commercial").length || 0;
  const residentialCount = customers?.filter((c) => c.customerType === "residential").length || 0;

  const monthlyRevenue: Record<string, number> = {};
  invoices?.filter((i) => i.status === "paid").forEach((inv) => {
    const month = new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + parseFloat(inv.totalAmount);
  });

  const monthlyServices: Record<string, number> = {};
  services?.forEach((svc) => {
    const month = new Date(svc.serviceDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthlyServices[month] = (monthlyServices[month] || 0) + 1;
  });

  const recentMonths = Object.entries(monthlyRevenue).slice(-6);
  const maxRevenue = Math.max(...recentMonths.map(([, v]) => v), 1);

  const recentServiceMonths = Object.entries(monthlyServices).slice(-6);
  const maxServices = Math.max(...recentServiceMonths.map(([, v]) => v), 1);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Reports & Analytics</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Business performance overview</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-16" /> : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-primary" /></div>
                <div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold">${totalRevenue.toFixed(2)}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-16" /> : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-chart-2/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-chart-2" /></div>
                <div><p className="text-xs text-muted-foreground">Avg Invoice</p><p className="text-xl font-bold">${avgInvoice.toFixed(2)}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-16" /> : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-chart-3/10 flex items-center justify-center shrink-0"><ClipboardList className="h-5 w-5 text-chart-3" /></div>
                <div><p className="text-xs text-muted-foreground">Total Services</p><p className="text-xl font-bold">{services?.length || 0}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-16" /> : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-chart-4/10 flex items-center justify-center shrink-0"><Users className="h-5 w-5 text-chart-4" /></div>
                <div><p className="text-xs text-muted-foreground">Active Customers</p><p className="text-xl font-bold">{activeCustomers}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Revenue by Month</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48" /> : recentMonths.length === 0 ? (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">No revenue data yet</p></div>
            ) : (
              <div className="space-y-3">
                {recentMonths.map(([month, amount]) => (
                  <div key={month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{month}</span>
                      <span className="font-semibold">${amount.toFixed(2)}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-md overflow-hidden">
                      <div className="h-full bg-primary rounded-md transition-all" style={{ width: `${(amount / maxRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Services by Month</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48" /> : recentServiceMonths.length === 0 ? (
              <div className="text-center py-12"><p className="text-sm text-muted-foreground">No service data yet</p></div>
            ) : (
              <div className="space-y-3">
                {recentServiceMonths.map(([month, count]) => (
                  <div key={month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{month}</span>
                      <span className="font-semibold">{count} services</span>
                    </div>
                    <div className="h-3 bg-muted rounded-md overflow-hidden">
                      <div className="h-full bg-chart-2 rounded-md transition-all" style={{ width: `${(count / maxServices) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold flex items-center gap-2"><PieChart className="h-4 w-4" /> Customer Breakdown</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-primary" /><span className="text-sm">Residential</span></div>
                  <span className="text-sm font-semibold">{residentialCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-chart-2" /><span className="text-sm">Commercial</span></div>
                  <span className="text-sm font-semibold">{commercialCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-chart-4" /><span className="text-sm">Total Active</span></div>
                  <span className="text-sm font-semibold">{activeCustomers}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Service Completion</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : (
              <div className="text-center space-y-3">
                <div className="text-4xl font-bold text-primary">{completionRate}%</div>
                <p className="text-sm text-muted-foreground">Confirmation Rate</p>
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div><span className="font-semibold">{completedServices}</span> <span className="text-muted-foreground">confirmed</span></div>
                  <div><span className="font-semibold">{(services?.length || 0) - completedServices}</span> <span className="text-muted-foreground">pending</span></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Invoice Summary</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-32" /> : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Invoices</span>
                  <span className="text-sm font-semibold">{invoices?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Paid</span>
                  <span className="text-sm font-semibold text-primary">{invoices?.filter((i) => i.status === "paid").length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pending</span>
                  <span className="text-sm font-semibold text-chart-3">{invoices?.filter((i) => i.status === "pending").length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Overdue</span>
                  <span className="text-sm font-semibold text-destructive">{invoices?.filter((i) => i.status === "overdue").length || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
