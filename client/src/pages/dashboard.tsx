import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Users,
  Calendar,
  DollarSign,
  ClipboardCheck,
  ArrowRight,
  Clock,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import type { Customer, Appointment, Invoice, ServiceRecord } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  loading,
}: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  trend?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold" data-testid={`text-stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary font-medium">{trend}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const statusColors: Record<string, string> = {
  scheduled: "bg-chart-2/10 text-chart-2",
  "in-progress": "bg-chart-4/10 text-chart-4",
  completed: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  pending: "bg-chart-3/10 text-chart-3",
  paid: "bg-primary/10 text-primary",
  overdue: "bg-destructive/10 text-destructive",
};

export default function Dashboard() {
  const { data: customers, isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: appointments, isLoading: loadingAppts } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: invoices, isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: services, isLoading: loadingServices } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/service-records"],
  });

  const activeCustomers = customers?.filter((c) => c.status === "active").length || 0;
  const todayAppts = appointments?.filter((a) => {
    const today = new Date();
    const apptDate = new Date(a.scheduledDate);
    return apptDate.toDateString() === today.toDateString() && a.status !== "cancelled";
  }) || [];
  const pendingInvoices = invoices?.filter((i) => i.status === "pending") || [];
  const totalRevenue = invoices
    ?.filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + parseFloat(i.totalAmount), 0) || 0;
  const upcomingAppts = appointments
    ?.filter((a) => new Date(a.scheduledDate) >= new Date() && a.status === "scheduled")
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
    .slice(0, 5) || [];

  const loading = loadingCustomers || loadingAppts || loadingInvoices || loadingServices;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Overview of your pest control operations</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/customers">
            <Button variant="outline" data-testid="button-new-customer">
              <Users className="h-4 w-4 mr-2" />
              New Customer
            </Button>
          </Link>
          <Link href="/schedule">
            <Button data-testid="button-new-appointment">
              <Calendar className="h-4 w-4 mr-2" />
              Schedule Service
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Customers"
          value={activeCustomers}
          icon={Users}
          description="Total active accounts"
          loading={loading}
        />
        <StatCard
          title="Today's Services"
          value={todayAppts.length}
          icon={Calendar}
          description="Scheduled for today"
          loading={loading}
        />
        <StatCard
          title="Pending Invoices"
          value={pendingInvoices.length}
          icon={DollarSign}
          description={`$${pendingInvoices.reduce((s, i) => s + parseFloat(i.totalAmount), 0).toFixed(2)} outstanding`}
          loading={loading}
        />
        <StatCard
          title="Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={TrendingUp}
          description="Total collected"
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-semibold">Upcoming Services</CardTitle>
            <Link href="/schedule">
              <Button variant="ghost" size="sm" data-testid="button-view-all-schedule">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : upcomingAppts.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No upcoming services</p>
                <Link href="/schedule">
                  <Button variant="outline" size="sm" className="mt-3">
                    Schedule a Service
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingAppts.map((appt) => {
                  const customer = customers?.find((c) => c.id === appt.customerId);
                  return (
                    <div
                      key={appt.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`card-appointment-${appt.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 shrink-0">
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(appt.scheduledDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 ${statusColors[appt.status] || ""}`}
                        data-testid={`badge-status-${appt.id}`}
                      >
                        {appt.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
            <Link href="/invoices">
              <Button variant="ghost" size="sm" data-testid="button-view-all-invoices">
                View All <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No invoices yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 5).map((inv) => {
                  const customer = customers?.find((c) => c.id === inv.customerId);
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                      data-testid={`card-invoice-${inv.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">${parseFloat(inv.totalAmount).toFixed(2)}</span>
                        <Badge
                          variant="secondary"
                          className={statusColors[inv.status] || ""}
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {pendingInvoices.length > 0 && (
        <Card className="border-chart-3/30 bg-chart-3/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-chart-3 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {pendingInvoices.length} invoice{pendingInvoices.length > 1 ? "s" : ""} pending payment
              </p>
              <p className="text-xs text-muted-foreground">
                Total outstanding: ${pendingInvoices.reduce((s, i) => s + parseFloat(i.totalAmount), 0).toFixed(2)}
              </p>
            </div>
            <Link href="/invoices">
              <Button variant="outline" size="sm">
                View Invoices
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
