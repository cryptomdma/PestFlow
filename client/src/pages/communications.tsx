import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  MessageSquare,
  Mail,
  Phone,
  Send,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import type { Customer, Communication } from "@shared/schema";

function CommunicationForm({
  onClose,
  initialValues,
}: {
  onClose: () => void;
  initialValues?: Partial<{
    customerId: string;
    locationId: string;
    type: string;
    direction: string;
    subject: string;
    body: string;
  }>;
}) {
  const { toast } = useToast();
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const [form, setForm] = useState({
    customerId: initialValues?.customerId || "",
    locationId: initialValues?.locationId || "",
    type: initialValues?.type || "email",
    direction: initialValues?.direction || "outbound",
    subject: initialValues?.subject || "",
    body: initialValues?.body || "",
    status: "sent",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      customerId: initialValues?.customerId || "",
      locationId: initialValues?.locationId || "",
      type: initialValues?.type || "email",
      direction: initialValues?.direction || "outbound",
      subject: initialValues?.subject || "",
      body: initialValues?.body || "",
    }));
  }, [initialValues]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/communications", {
        ...data,
        sentAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/all-communications"] });
      toast({ title: "Communication logged" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Customer *</Label>
        <Select value={form.customerId} onValueChange={(v) => setForm((p) => ({ ...p, customerId: v }))}>
          <SelectTrigger data-testid="select-comm-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
          <SelectContent>{customers?.map((c) => <SelectItem key={c.id} value={c.id}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
            <SelectTrigger data-testid="select-comm-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="note">Note</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Direction</Label>
          <Select value={form.direction} onValueChange={(v) => setForm((p) => ({ ...p, direction: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">Outbound</SelectItem>
              <SelectItem value="inbound">Inbound</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input data-testid="input-comm-subject" value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea data-testid="input-comm-body" rows={5} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} className="resize-none" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending || !form.customerId} data-testid="button-send-comm">
          <Send className="h-3 w-3 mr-1" /> {mutation.isPending ? "Sending..." : "Log Communication"}
        </Button>
      </div>
    </form>
  );
}

export default function Communications() {
  const routeSearch = useSearch();
  const searchParams = new URLSearchParams(routeSearch);
  const initialValues = {
    customerId: searchParams.get("customerId") || "",
    locationId: searchParams.get("locationId") || "",
    type: searchParams.get("type") || "email",
    direction: searchParams.get("direction") || "outbound",
    subject: searchParams.get("subject") || "",
    body: searchParams.get("recipient") ? `Recipient: ${searchParams.get("recipient")}` : "",
  };
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(!!initialValues.customerId);

  useEffect(() => {
    if (initialValues.customerId) {
      setDialogOpen(true);
    }
  }, [initialValues.customerId, initialValues.locationId, initialValues.type, initialValues.direction, initialValues.subject, initialValues.body]);

  const { data: comms, isLoading } = useQuery<Communication[]>({ queryKey: ["/api/all-communications"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const filtered = comms?.filter((c) => {
    const cust = customers?.find((cu) => cu.id === c.customerId);
    const text = `${cust?.firstName || ""} ${cust?.lastName || ""} ${c.subject || ""} ${c.body || ""}`.toLowerCase();
    const matchesSearch = text.includes(search.toLowerCase());
    const matchesType = filterType === "all" || c.type === filterType;
    return matchesSearch && matchesType;
  }) || [];

  const typeIcon = (type: string) => {
    switch (type) {
      case "email": return <Mail className="h-4 w-4" />;
      case "phone": return <Phone className="h-4 w-4" />;
      case "sms": return <MessageSquare className="h-4 w-4" />;
      case "OPPORTUNITY_CALL": return <Phone className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "email": return "bg-chart-2/10 text-chart-2";
      case "phone": return "bg-primary/10 text-primary";
      case "sms": return "bg-chart-5/10 text-chart-5";
      case "OPPORTUNITY_CALL": return "bg-primary/10 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Communications</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track all customer interactions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-communication"><Plus className="h-4 w-4 mr-2" /> Log Communication</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader>
            <CommunicationForm onClose={() => setDialogOpen(false)} initialValues={initialValues} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search communications..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-comms" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="OPPORTUNITY_CALL">Opportunity Call</SelectItem>
              <SelectItem value="note">Note</SelectItem>
            </SelectContent>
          </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No communications</h3>
            <p className="text-sm text-muted-foreground mb-4">Log your first customer interaction</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Log Communication</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered
            .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
            .map((comm) => {
              const cust = customers?.find((c) => c.id === comm.customerId);
              return (
                <Card key={comm.id} data-testid={`card-comm-${comm.id}`}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className={`h-9 w-9 rounded-md flex items-center justify-center shrink-0 ${typeColor(comm.type)}`}>
                      {typeIcon(comm.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}</span>
                        <Badge variant="outline" className="text-xs capitalize">{comm.type}</Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          {comm.direction === "outbound" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                          {comm.direction}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(comm.sentAt).toLocaleString()}</span>
                      </div>
                      {comm.subject && <p className="text-sm font-medium mt-1">{comm.subject}</p>}
                      {comm.body && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{comm.body}</p>}
                      {comm.nextActionDate ? <p className="text-xs text-muted-foreground mt-1">Next Action: {new Date(`${comm.nextActionDate}T00:00:00`).toLocaleDateString()}</p> : null}
                      {comm.actorLabel ? <p className="text-xs text-muted-foreground mt-1">By: {comm.actorLabel}</p> : null}
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
