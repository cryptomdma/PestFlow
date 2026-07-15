import { outboxEvents, type OutboxEvent } from "@shared/schema";
import { db } from "../../db";

export type OutboxPort = "payments" | "accounting" | "crm" | "inventory";

// Call inside the same db.transaction() as the domain change it's recording
// a side effect for, so the event can never be written without the change
// that caused it (or vice versa). A worker to drain PENDING rows isn't
// built yet - see PLAN_BILLING_V1.md §0.4 - so nothing enqueued here is
// processed until that worker exists.
export async function recordOutboxEvent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { orgId: string; port: OutboxPort; eventType: string; payload: unknown },
): Promise<OutboxEvent> {
  const [event] = await tx
    .insert(outboxEvents)
    .values({
      orgId: input.orgId,
      port: input.port,
      eventType: input.eventType,
      payload: input.payload,
    })
    .returning();

  return event;
}
