import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users,
  DollarSign,
  ClipboardList,
  Calendar,
  TrendingUp,
  BarChart3,
  PieChart,
  Hourglass,
} from "lucide-react";
import { formatCents } from "@shared/money";
import type { Customer, Appointment, Invoice, ServiceRecord } from "@shared/schema";
import { AGING_BASIS_LABEL, AGING_BUCKET_LABELS, AGING_BUCKET_RANGES, AGING_BUCKETS, type AgingFigures, type AgingReport } from "@shared/aging";
import { agingBucketToneClass } from "@/components/aging-strip";
import { getApiErrorMessage } from "@/lib/queryClient";

// Pass 14 (PLAN_ROADMAP_V2.md C2.4): the org-wide aging report, fed by
// GET /api/reports/aging - per customer and per location, Current (0-30) /
// 31-60 / 61-90 / Over 90 UTC calendar days since invoiced (B20), derived and
// never stored. Every row links to the customer screen. The Overdue count in
// the Invoice Summary card above keeps its due-date meaning; the two are not
// the same question and the copy says so.
function AgingCells({ figures, muted }: { figures: AgingFigures; muted?: boolean }) {
  return (
    <>
      {AGING_BUCKETS.map((bucket) => (
        <TableCell key={bucket} className={`py-2 text-right whitespace-nowrap tabular-nums ${figures.buckets[bucket] > 0 ? agingBucketToneClass(bucket) : "text-muted-foreground"}`}>
          {formatCents(figures.buckets[bucket])}
        </TableCell>
      ))}
      <TableCell className={`py-2 text-right whitespace-nowrap tabular-nums ${muted ? "" : "font-semibold"}`}>
        <div>{formatCents(figures.openBalanceCents)}</div>
        {figures.pendingAppliedCents > 0 ? <div className="text-xs font-normal text-muted-foreground">{formatCents(figures.pendingAppliedCents)} pending</div> : null}
      </TableCell>
      <TableCell className="py-2 text-right whitespace-nowrap tabular-nums pr-4">
        <div className={figures.onAccountCents > 0 ? "" : "text-muted-foreground"}>{formatCents(figures.onAccountCents)}</div>
        {figures.pendingUnappliedCents > 0 ? <div className="text-xs text-muted-foreground">+ {formatCents(figures.pendingUnappliedCents)} pending</div> : null}
      </TableCell>
    </>
  );
}

function AgingSection() {
  const { data, isLoading, isError, error } = useQuery<AgingReport>({ queryKey: ["/api/reports/aging"] });
  return (
    <Card data-testid="card-aging-report">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2"><Hourglass className="h-4 w-4" /> Aging</CardTitle>
        <p className="text-sm text-muted-foreground">
          Open balances by {AGING_BASIS_LABEL}{data ? `, as of ${data.asOf} (UTC)` : ""}: Current is 0-30 days since the invoice was issued, then 31-60, 61-90 and over 90.
          This is not days past due - the Overdue figures here and on the Invoices screen are by due date. Money on account is shown beside the balance, never subtracted from it; pending money shows, confirmed money counts.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : isError || !data ? (
          <p className="text-sm text-destructive" data-testid="text-aging-error">The aging report could not be loaded: {getApiErrorMessage(error)}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {AGING_BUCKETS.map((bucket) => (
                <div key={bucket} className="rounded-md border p-3" data-testid={`tile-aging-${bucket}`}>
                  <p className="text-xs text-muted-foreground">{AGING_BUCKET_LABELS[bucket]} <span className="text-muted-foreground/80">({AGING_BUCKET_RANGES[bucket]})</span></p>
                  <p className={`text-lg font-bold tabular-nums ${data.totals.buckets[bucket] > 0 ? agingBucketToneClass(bucket) : ""}`}>{formatCents(data.totals.buckets[bucket])}</p>
                </div>
              ))}
              <div className="rounded-md border p-3 bg-muted/30" data-testid="tile-aging-total">
                <p className="text-xs text-muted-foreground">Total open</p>
                <p className="text-lg font-bold tabular-nums">{formatCents(data.totals.openBalanceCents)}</p>
                <p className="text-xs text-muted-foreground">
                  {data.totals.invoiceCount === 1 ? "1 invoice" : `${data.totals.invoiceCount} invoices`}, {data.customers.length === 1 ? "1 customer" : `${data.customers.length} customers`}
                  {data.totals.onAccountCents > 0 ? ` · ${formatCents(data.totals.onAccountCents)} on account` : ""}
                </p>
              </div>
            </div>
            {data.customers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-aging-empty">No open balances and nothing on account.</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table data-testid="table-aging">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 pl-4">Customer / location</TableHead>
                      {AGING_BUCKETS.map((bucket) => (
                        <TableHead key={bucket} className="h-9 text-right whitespace-nowrap">{AGING_BUCKET_LABELS[bucket]}</TableHead>
                      ))}
                      <TableHead className="h-9 text-right">Open</TableHead>
                      <TableHead className="h-9 text-right pr-4">On account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.customers.map((customer) => (
                      <Fragment key={customer.customerId}>
                        <TableRow className="bg-muted/20" data-testid={`row-aging-customer-${customer.customerId}`}>
                          <TableCell className="py-2 pl-4">
                            <Link href={`/customers/${customer.customerId}`} className="font-medium hover:underline" data-testid={`link-aging-customer-${customer.customerId}`}>
                              {customer.firstName} {customer.lastName}
                            </Link>
                            {customer.companyName ? <span className="ml-1.5 text-xs text-muted-foreground">{customer.companyName}</span> : null}
                            {customer.locations.length > 1 ? <span className="ml-1.5 text-xs text-muted-foreground">{customer.locations.length} locations</span> : null}
                          </TableCell>
                          <AgingCells figures={customer} />
                        </TableRow>
                        {customer.locations.map((location) => (
                          <TableRow key={`${customer.customerId}:${location.locationId ?? "none"}`} data-testid={`row-aging-location-${location.locationId ?? "none"}`}>
                            <TableCell className="py-2 pl-8">
                              {location.locationId ? (
                                <Link href={`/customers/${customer.customerId}?locationId=${location.locationId}`} className="hover:underline" data-testid={`link-aging-location-${location.locationId}`}>
                                  {location.name}{location.isPrimary ? <span className="ml-1.5 text-xs text-muted-foreground">Primary</span> : null}
                                </Link>
                              ) : (
                                <Link href={`/customers/${customer.customerId}`} className="text-muted-foreground hover:underline" data-testid={`link-aging-location-none-${customer.customerId}`}>No location</Link>
                              )}
                              {location.address ? <div className="text-xs text-muted-foreground">{location.address}</div> : null}
                            </TableCell>
                            <AgingCells figures={location} muted />
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow data-testid="row-aging-totals">
                      <TableCell className="py-2 pl-4">Total</TableCell>
                      <AgingCells figures={data.totals} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { data: customers, isLoading: lc } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: appointments, isLoading: la } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: invoices, isLoading: li } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: services, isLoading: ls } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });

  const loading = lc || la || li || ls;

  const totalRevenueCents = invoices?.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalAmountCents, 0) || 0;
  const avgInvoiceCents = invoices && invoices.length > 0 ? totalRevenueCents / (invoices.filter((i) => i.status === "PAID").length || 1) : 0;
  const completedServices = services?.filter((s) => s.confirmed).length || 0;
  const completionRate = services && services.length > 0 ? ((completedServices / services.length) * 100).toFixed(0) : "0";
  const activeCustomers = customers?.filter((c) => c.status === "active").length || 0;
  const commercialCount = customers?.filter((c) => c.customerType === "commercial").length || 0;
  const residentialCount = customers?.filter((c) => c.customerType === "residential").length || 0;

  const monthlyRevenueCents: Record<string, number> = {};
  invoices?.filter((i) => i.status === "PAID").forEach((inv) => {
    const month = new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthlyRevenueCents[month] = (monthlyRevenueCents[month] || 0) + inv.totalAmountCents;
  });

  const monthlyServices: Record<string, number> = {};
  services?.forEach((svc) => {
    const month = new Date(svc.serviceDate).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthlyServices[month] = (monthlyServices[month] || 0) + 1;
  });

  const recentMonths = Object.entries(monthlyRevenueCents).slice(-6);
  const maxRevenueCents = Math.max(...recentMonths.map(([, v]) => v), 1);

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
                <div><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold">{formatCents(totalRevenueCents)}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            {loading ? <Skeleton className="h-16" /> : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-chart-2/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 text-chart-2" /></div>
                <div><p className="text-xs text-muted-foreground">Avg Invoice</p><p className="text-xl font-bold">{formatCents(avgInvoiceCents)}</p></div>
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
                {recentMonths.map(([month, amountCents]) => (
                  <div key={month} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{month}</span>
                      <span className="font-semibold">{formatCents(amountCents)}</span>
                    </div>
                    <div className="h-3 bg-muted rounded-md overflow-hidden">
                      <div className="h-full bg-primary rounded-md transition-all" style={{ width: `${(amountCents / maxRevenueCents) * 100}%` }} />
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
                  <span className="text-sm font-semibold text-primary">{invoices?.filter((i) => i.status === "PAID").length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Open</span>
                  <span className="text-sm font-semibold text-chart-3">{invoices?.filter((i) => i.status === "OPEN" || i.status === "PARTIALLY_PAID").length || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Overdue</span>
                  <span className="text-sm font-semibold text-destructive">{invoices?.filter((i) => i.status === "OPEN" && !!i.dueDate && new Date(i.dueDate).getTime() < Date.now()).length || 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AgingSection />
    </div>
  );
}
