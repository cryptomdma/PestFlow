// Pass 26 (PLAN_ROADMAP_V2.md C4.1b; B7 "auto-assign from Settings by
// zones, zip codes, or other parameters"): the opportunity assignment rules.
//
// A rule is four nullable matchers - category key, work type, zone, source -
// and one user. A null matcher matches anything. Rules are evaluated in
// sort order at every opportunity's creation and the FIRST match assigns;
// no match leaves the row unassigned exactly as before this pass. A rule
// that names an inactive user or an inactive zone is SKIPPED, never applied
// and never silently re-pointed: the problem is reported on the Settings
// card (describeRuleProblems) by the same function the resolver reads.
//
// One pure function (resolveAssignmentRule) is read by the server's insert
// path (server/storage.ts insertOpportunityTx) and by the Settings card, so
// what the card says a rule would do is what the server does.
import { describeOpportunityCategory, describeOpportunitySource, describeOpportunityWorkType } from "./opportunities";
import { userDisplayName } from "./users";
import { zoneCoversZip, type ZoneLike } from "./zones";

export const ANY_MATCHER_LABEL = "Any";

export interface AssignmentRuleLike {
  id: string;
  sortOrder: number;
  categoryKey: string | null;
  workType: string | null;
  zoneId: string | null;
  source: string | null;
  assignedUserId: string;
  isActive: boolean;
  createdAt?: Date | string | null;
}

export interface AssignmentUserLike {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
}

export interface AssignmentCategoryLike {
  key: string;
  label: string;
}

/** What a new opportunity is matched on: its two axes, its source and its location's zip. */
export interface AssignmentSubject {
  categoryKey: string;
  workType: string;
  source: string;
  zip: string | null | undefined;
}

export type AssignmentRuleProblemCode = "ASSIGNEE_UNKNOWN" | "ASSIGNEE_INACTIVE" | "ZONE_UNKNOWN" | "ZONE_INACTIVE";

export interface AssignmentRuleProblem {
  code: AssignmentRuleProblemCode;
  message: string;
}

/** Sort order, then creation, then id - the order the resolver evaluates and the card lists. */
export function sortAssignmentRules<T extends AssignmentRuleLike>(rules: readonly T[]): T[] {
  return [...rules].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;
    return left.id.localeCompare(right.id);
  });
}

/**
 * Why a rule cannot apply as it stands. Empty means the rule is sound. The
 * resolver skips a rule with any problem; the Settings card prints them.
 */
export function describeRuleProblems(
  rule: Pick<AssignmentRuleLike, "zoneId" | "assignedUserId">,
  zones: ReadonlyArray<ZoneLike>,
  users: ReadonlyArray<AssignmentUserLike>,
): AssignmentRuleProblem[] {
  const problems: AssignmentRuleProblem[] = [];
  const user = users.find((candidate) => candidate.id === rule.assignedUserId);
  if (!user) {
    problems.push({ code: "ASSIGNEE_UNKNOWN", message: "Names a user who is not in this organization - the rule is skipped until it names an active user." });
  } else if (user.status !== "active") {
    problems.push({ code: "ASSIGNEE_INACTIVE", message: `Names ${userDisplayName(user)}, who is inactive - the rule is skipped until it names an active user.` });
  }
  if (rule.zoneId) {
    const zone = zones.find((candidate) => candidate.id === rule.zoneId);
    if (!zone) {
      problems.push({ code: "ZONE_UNKNOWN", message: "Names a zone that no longer exists - the rule is skipped." });
    } else if (!zone.isActive) {
      problems.push({ code: "ZONE_INACTIVE", message: `Zone "${zone.name}" is inactive - the rule matches nothing until the zone is active again.` });
    }
  }
  return problems;
}

/** The matchers alone: a null matcher matches anything; a zone matches on the location's five-digit ZIP. */
export function assignmentRuleMatches(
  rule: Pick<AssignmentRuleLike, "categoryKey" | "workType" | "zoneId" | "source">,
  zones: ReadonlyArray<ZoneLike>,
  subject: AssignmentSubject,
): boolean {
  if (rule.categoryKey && rule.categoryKey !== subject.categoryKey) return false;
  if (rule.workType && rule.workType !== subject.workType) return false;
  if (rule.source && rule.source !== subject.source) return false;
  if (rule.zoneId) {
    const zone = zones.find((candidate) => candidate.id === rule.zoneId);
    if (!zone || !zoneCoversZip(zone, subject.zip)) return false;
  }
  return true;
}

export interface AssignmentResolution<T extends AssignmentRuleLike> {
  /** The first active, sound rule whose matchers fit the subject, or null: the row stays unassigned. */
  rule: T | null;
  /** Active rules the walk passed over because of a problem, in order - what the card reports. */
  skipped: Array<{ rule: T; problems: AssignmentRuleProblem[] }>;
}

/**
 * First match wins. Inactive rules are not considered; a rule with a
 * problem (inactive or unknown user or zone) is skipped and reported, never
 * applied; the rest are tried in sort order against the subject.
 */
export function resolveAssignmentRule<T extends AssignmentRuleLike>(
  rules: readonly T[],
  zones: ReadonlyArray<ZoneLike>,
  users: ReadonlyArray<AssignmentUserLike>,
  subject: AssignmentSubject,
): AssignmentResolution<T> {
  const skipped: Array<{ rule: T; problems: AssignmentRuleProblem[] }> = [];
  for (const rule of sortAssignmentRules(rules.filter((candidate) => candidate.isActive))) {
    const problems = describeRuleProblems(rule, zones, users);
    if (problems.length) {
      skipped.push({ rule, problems });
      continue;
    }
    if (assignmentRuleMatches(rule, zones, subject)) {
      return { rule, skipped };
    }
  }
  return { rule: null, skipped };
}

export interface AssignmentRuleNames {
  categories?: ReadonlyArray<AssignmentCategoryLike> | null;
  zones?: ReadonlyArray<Pick<ZoneLike, "id" | "name">> | null;
  users?: ReadonlyArray<Pick<AssignmentUserLike, "id" | "firstName" | "lastName">> | null;
}

/** "Service due · Any work type · Zone North · Any source" - the four matchers, "Any" where null. */
export function describeRuleMatchers(
  rule: Pick<AssignmentRuleLike, "categoryKey" | "workType" | "zoneId" | "source">,
  names: AssignmentRuleNames = {},
): string {
  const category = rule.categoryKey ? describeOpportunityCategory(rule.categoryKey, names.categories ?? undefined) : `${ANY_MATCHER_LABEL} category`;
  const workType = rule.workType ? describeOpportunityWorkType(rule.workType) : `${ANY_MATCHER_LABEL} work type`;
  const zone = rule.zoneId ? `Zone ${names.zones?.find((candidate) => candidate.id === rule.zoneId)?.name ?? "(unknown)"}` : `${ANY_MATCHER_LABEL} zone`;
  const source = rule.source ? describeOpportunitySource(rule.source) : `${ANY_MATCHER_LABEL} source`;
  return [category, workType, zone, source].join(" · ");
}

/** The matchers and the user: "Service due · Any work type · Zone North · Any source -> Heritage Support". */
export function describeAssignmentRule(
  rule: Pick<AssignmentRuleLike, "categoryKey" | "workType" | "zoneId" | "source" | "assignedUserId">,
  names: AssignmentRuleNames = {},
): string {
  const user = names.users?.find((candidate) => candidate.id === rule.assignedUserId);
  return `${describeRuleMatchers(rule, names)} -> ${user ? userDisplayName(user) : "(unknown user)"}`;
}
