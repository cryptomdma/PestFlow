import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import type { Customer, Invoice } from "@shared/schema";

function InvoiceForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const [form, setForm] = useState({
    customerId: "",
    invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
    amount: "",
    tax: "0",
    status: "pending",
    dueDate: "",
    notes: "",
  });

  const totalAmount = (parseFloat(form.amount || "0") + parseFloat(form.tax || "0")).toFixed(2);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/invoices", {
        ...data,
        amount: data.amount,
        tax: data.tax,
        totalAmount,
        dueDate: data.dueDate ? new Date(data.dueDate).toISOString() : null,
        serviceRecordId: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Customer *</Label>
          <Select value={form.customerId} onValueChange={(v) => setForm((p) => ({ ...p, customerId: v }))}>
            <SelectTrigger data-testid="select-inv-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
            <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Invoice Number</Label>
          <Input data-testid="input-invoice-number" value={form.invoiceNumber} onChange={(e) => setForm((p) => ({ ...p, invoiceNumber: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Amount *</Label>
          <Input type="number" step="0.01" data-testid="input-amount" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Tax</Label>
          <Input type="number" step="0.01" value={form.tax} onChange={(e) => setForm((p) => ({ ...p, tax: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Total</Label>
          <Input value={`$${totalAmount}`} disabled />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Due Date</Label>
          <Input type="date" data-testid="input-due-date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className="resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.customerId || !form.amount} data-testid="button-save-invoice">
          {mutation.isPending ? "Creating..." : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}

export default function Invoices() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: invoices, isLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/invoices/${id}`, { status: "paid", paidDate: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice marked as paid" });
    },
  });

  const filtered = invoices?.filter((i) => {
    const cust = customers?.find((c) => c.id === i.customerId);
    const text = `${cust?.firstName || ""} ${cust?.lastName || ""} ${i.invoiceNumber}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesStatus = filterStatus === "all" || i.status === filterStatus;
    return matchesSearch && matchesStatus;
  }) || [];

  const totalPending = filtered.filter((i) => i.status === "pending").reduce((s, i) => s + parseFloat(i.totalAmount), 0);
  const totalPaid = filtered.filter((i) => i.status === "paid").reduce((s, i) => s + parseFloat(i.totalAmount), 0);
  const totalOverdue = filtered.filter((i) => i.status === "overdue").reduce((s, i) => s + parseFloat(i.totalAmount), 0);

  const statusIcon = (status: string) => {
    switch (status) {
      case "paid": return <CheckCircle className="h-4 w-4 text-primary" />;
      case "pending": return <Clock className="h-4 w-4 text-chart-3" />;
      case "overdue": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "paid": return "bg-primary/10 text-primary";
      case "pending": return "bg-chart-3/10 text-chart-3";
      case "overdue": return "bg-destructive/10 text-destructive";
      default: return "";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Invoices</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track payments and billing</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-invoice"><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
            <InvoiceForm onClose={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-chart-3/10 flex items-center justify-center shrink-0"><Clock className="h-4 w-4 text-chart-3" /></div>
            <div><p className="text-xs text-muted-foreground">Pending</p><p className="text-lg font-bold" data-testid="text-total-pending">${totalPending.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0"><CheckCircle className="h-4 w-4 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-bold" data-testid="text-total-paid">${totalPaid.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-destructive/10 flex items-center justify-center shrink-0"><AlertCircle className="h-4 w-4 text-destructive" /></div>
            <div><p className="text-xs text-muted-foreground">Overdue</p><p className="text-lg font-bold" data-testid="text-total-overdue">${totalOverdue.toFixed(2)}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-invoices" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No invoices found</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first invoice</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((inv) => {
              const cust = customers?.find((c) => c.id === inv.customerId);
              return (
                <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      {statusIcon(inv.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{inv.invoiceNumber}</span>
                        <Badge variant="secondary" className={`text-xs ${statusClass(inv.status)}`}>{inv.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}</span>
                        <span>{new Date(inv.createdAt).toLocaleDateString()}</span>
                        {inv.dueDate && <span>Due: {new Date(inv.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-bold">${parseFloat(inv.totalAmount).toFixed(2)}</span>
                      {inv.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markPaidMutation.mutate(inv.id)}
                          disabled={markPaidMutation.isPending}
                          data-testid={`button-mark-paid-${inv.id}`}
                        >
                          <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
