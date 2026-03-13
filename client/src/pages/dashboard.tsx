import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar, ClipboardList, DollarSign, Users } from "lucide-react";
import type { Appointment, Customer, Invoice, ServiceRecord } from "@shared/schema";

export default function Dashboard() {
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: services, isLoading: servicesLoading } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });

  const loading = customersLoading || appointmentsLoading || servicesLoading || invoicesLoading;
  const activeCustomers = customers?.filter((customer) => customer.status === "active").length || 0;
  const upcomingAppointments =
    appointments?.filter((appointment) => new Date(appointment.scheduledDate) >= new Date() && appointment.status !== "canceled").length || 0;
  const completedServices = services?.filter((service) => service.confirmed).length || 0;
  const paidRevenue =
    invoices
      ?.filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + parseFloat(invoice.totalAmount), 0) || 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live operational summary</p>
        </div>
        <Link href="/mobile-dashboard">
          <Button variant="outline" size="sm">Mobile View</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Active Customers</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{activeCustomers}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="h-4 w-4" /> Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{upcomingAppointments}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Confirmed Services</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{completedServices}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="h-4 w-4" /> Paid Revenue</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">${paidRevenue.toFixed(2)}</p>}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Baseline Notice</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This dashboard only shows live data-backed metrics. Additional analytics and interactive controls are intentionally deferred until fully wired.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
