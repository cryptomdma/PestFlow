import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar, ClipboardList, DollarSign, FileText, MessageSquare, Settings, Users, BarChart3 } from "lucide-react";
import type { Appointment, Customer, Invoice, ServiceRecord, Communication } from "@shared/schema";

export default function Dashboard() {
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: services, isLoading: servicesLoading } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: communications, isLoading: communicationsLoading } = useQuery<Communication[]>({ queryKey: ["/api/all-communications"] });

  const loading = customersLoading || appointmentsLoading || servicesLoading || invoicesLoading || communicationsLoading;
  const activeCustomers = customers?.filter((customer) => customer.status === "active").length || 0;
  const upcomingAppointments =
    appointments?.filter((appointment) => new Date(appointment.scheduledDate) >= new Date() && appointment.status !== "canceled").length || 0;
  const completedServices = services?.filter((service) => service.confirmed).length || 0;
  const communicationsCount = communications?.length || 0;
  const paidRevenue =
    invoices
      ?.filter((invoice) => invoice.status === "paid")
      .reduce((sum, invoice) => sum + parseFloat(invoice.totalAmount), 0) || 0;

  const quickLinks = [
    { title: "Customers", href: "/customers", icon: Users, stat: `${activeCustomers} active` },
    { title: "Schedule", href: "/schedule", icon: Calendar, stat: `${upcomingAppointments} upcoming` },
    { title: "Services", href: "/services", icon: ClipboardList, stat: `${completedServices} confirmed` },
    { title: "Invoices", href: "/invoices", icon: FileText, stat: `$${paidRevenue.toFixed(2)} paid` },
    { title: "Communications", href: "/communications", icon: MessageSquare, stat: `${communicationsCount} logged` },
    { title: "Reports", href: "/reports", icon: BarChart3 },
    { title: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operations Home</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Quick access to core workflows and live summary counts.</p>
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
            <CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="h-4 w-4" /> Paid Invoices</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">${paidRevenue.toFixed(2)}</p>}</CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.title}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  {item.stat && <p className="text-xs text-muted-foreground mt-0.5">{loading ? "Loading..." : item.stat}</p>}
                </div>
                <Link href={item.href}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Icon className="h-4 w-4" />
                    Open
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
