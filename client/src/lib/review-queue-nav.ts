// Next / Back across a run of service tickets in the review modal
// (PLAN_BILLING_V1_1.md D9, Pass 7.6). Pure and dependency-free so the
// stepping rules can be exercised without rendering the modal.
//
// The run is a SNAPSHOT of the queue, taken when a ticket is opened from it,
// never the live filtered list. Finalizing a ticket under the "Pending
// Review" filter drops it out of that list, so navigating over the live one
// would put the open ticket at index -1 and hide the controls at exactly the
// moment the reviewer wants Next.

export interface ReviewNavStep {
  id: string;
  index: number;
}

export interface ReviewNavState {
  /** Position of the open ticket in the run; -1 when it was not opened from the queue. */
  index: number;
  /** Length of the run - the "of N" the reviewer is working through. */
  total: number;
  previous: ReviewNavStep | null;
  next: ReviewNavStep | null;
}

/**
 * @param runRecordIds  the queue as it stood when the run started
 * @param selectedRecordId  the ticket open right now
 * @param liveRecordIds  every service record that still EXISTS (not the filtered
 *   queue): a finalized ticket is still live and keeps its place in the run,
 *   while an id that no longer resolves is stepped over rather than opened,
 *   since selecting it would close the modal out from under the reviewer.
 */
export function resolveReviewNav(
  runRecordIds: readonly string[],
  selectedRecordId: string | null,
  liveRecordIds: ReadonlySet<string>,
): ReviewNavState {
  const index = selectedRecordId ? runRecordIds.indexOf(selectedRecordId) : -1;
  const step = (direction: 1 | -1): ReviewNavStep | null => {
    if (index < 0) return null;
    for (let i = index + direction; i >= 0 && i < runRecordIds.length; i += direction) {
      const id = runRecordIds[i];
      if (liveRecordIds.has(id)) return { id, index: i };
    }
    return null;
  };
  return { index, total: runRecordIds.length, previous: step(-1), next: step(1) };
}
