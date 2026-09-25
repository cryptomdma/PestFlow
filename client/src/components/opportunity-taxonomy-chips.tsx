// Pass 25 (PLAN_ROADMAP_V2.md C4.1): the taxonomy on an opportunity card -
// category, work type, source and assignee - one component for the
// Opportunities queue and the location's Opportunities tab so the two read
// the same. The queue passes change handlers, which turn the category and
// work-type chips into pickers (a WINBACK has no automatic source until Pass
// 27's cancel flow: it is chosen by hand); the location tab shows them only.
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  OPPORTUNITY_WORK_TYPES,
  describeOpportunityCategory,
  describeOpportunitySource,
  describeOpportunityWorkType,
  type OpportunityWorkType,
} from "@shared/opportunities";
import { userDisplayName } from "@shared/users";
import type { Opportunity, OpportunityCategory, UserSummary } from "@shared/schema";
import { Check, ChevronDown } from "lucide-react";

export function describeOpportunityAssignee(
  opportunity: Pick<Opportunity, "assignedUserId">,
  users: ReadonlyArray<Pick<UserSummary, "id" | "firstName" | "lastName">> | undefined,
): string {
  if (!opportunity.assignedUserId) return "Unassigned";
  if (!users) return "Assigned";
  const user = users.find((candidate) => candidate.id === opportunity.assignedUserId);
  return user ? `Assigned to ${userDisplayName(user)}` : "Assigned to an unknown user";
}

export function OpportunityTaxonomyChips({
  opportunity,
  categories,
  users,
  className,
  onCategoryChange,
  onWorkTypeChange,
  changeDisabled,
}: {
  opportunity: Pick<Opportunity, "categoryKey" | "workType" | "source" | "assignedUserId">;
  /** Every category, inactive ones included: a row may still carry a key the office has since deactivated. */
  categories: ReadonlyArray<OpportunityCategory> | undefined;
  users: ReadonlyArray<Pick<UserSummary, "id" | "firstName" | "lastName">> | undefined;
  className?: string;
  /** When given, the category chip is a picker over the active categories. */
  onCategoryChange?: (categoryKey: string) => void;
  /** When given, the work-type chip is a picker over the two work types. */
  onWorkTypeChange?: (workType: OpportunityWorkType) => void;
  changeDisabled?: boolean;
}) {
  const categoryLabel = describeOpportunityCategory(opportunity.categoryKey, categories);
  const workTypeLabel = describeOpportunityWorkType(opportunity.workType);
  const activeCategories = (categories ?? []).filter((category) => category.isActive || category.key === opportunity.categoryKey);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {onCategoryChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={changeDisabled}>
            <button type="button" className="rounded-md disabled:opacity-60" title="Category - click to change" data-testid="chip-opportunity-category">
              <Badge variant="secondary">{categoryLabel} <ChevronDown className="ml-1 h-3 w-3" /></Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {activeCategories.map((category) => (
              <DropdownMenuItem key={category.key} onClick={() => onCategoryChange(category.key)} disabled={!category.isActive}>
                {category.key === opportunity.categoryKey ? <Check className="mr-2 h-3 w-3" /> : <span className="mr-2 inline-block h-3 w-3" />}
                {category.label}{category.isActive ? "" : " (inactive)"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Badge variant="secondary" title="Category" data-testid="chip-opportunity-category">{categoryLabel}</Badge>
      )}
      {onWorkTypeChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={changeDisabled}>
            <button type="button" className="rounded-md disabled:opacity-60" title="Work type - click to change" data-testid="chip-opportunity-work-type">
              <Badge variant="outline">{workTypeLabel} <ChevronDown className="ml-1 h-3 w-3" /></Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {OPPORTUNITY_WORK_TYPES.map((workType) => (
              <DropdownMenuItem key={workType} onClick={() => onWorkTypeChange(workType)}>
                {workType === opportunity.workType ? <Check className="mr-2 h-3 w-3" /> : <span className="mr-2 inline-block h-3 w-3" />}
                {describeOpportunityWorkType(workType)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Badge variant="outline" title="Work type" data-testid="chip-opportunity-work-type">{workTypeLabel}</Badge>
      )}
      <Badge variant="outline" title="Source" data-testid="chip-opportunity-source">{describeOpportunitySource(opportunity.source)}</Badge>
      <Badge variant="outline" title="Assignee" data-testid="chip-opportunity-assignee">{describeOpportunityAssignee(opportunity, users)}</Badge>
    </div>
  );
}
