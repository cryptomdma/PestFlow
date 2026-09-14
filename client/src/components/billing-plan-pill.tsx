import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeBillingPlanPill } from "@shared/billing-plan";
import type { Agreement, BillingPlan } from "@shared/schema";

// PLAN_BILLING_V1_1.md D6 - the billing-plan pill: plan name + periodic
// amount ("Monthly - $50/mo") on the agreement card and the location screen.
// Plans attach to AGREEMENTS, so the pill takes an agreement; a customer or a
// location is never "monthly" or "COD" as a whole. The amount is
// resolveBillingPlanCharge's, the same arithmetic the nightly run bills by.

/** The org's billing plans by id, inactive included, so an agreement on a retired plan still names it. */
export function useBillingPlanById() {
  const { data: plans, isLoading } = useQuery<BillingPlan[]>({ queryKey: ["/api/billing-plans?includeInactive=true"] });
  const planById = useMemo(() => new Map((plans ?? []).map((plan) => [plan.id, plan])), [plans]);
  return { planById, isLoading };
}

export function BillingPlanPill({
  agreement,
  plan,
  className,
}: {
  agreement: Agreement;
  plan: BillingPlan | null | undefined;
  className?: string;
}) {
  const pill = describeBillingPlanPill(plan, agreement);
  return (
    <Badge
      variant={plan ? "secondary" : "outline"}
      className={cn("text-xs font-normal", !plan && "text-muted-foreground", className)}
      title={pill.title}
      data-testid={`pill-billing-plan-${agreement.id}`}
    >
      {pill.label}
    </Badge>
  );
}
