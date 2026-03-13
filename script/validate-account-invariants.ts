import "dotenv/config";
import { storage } from "../server/storage";

async function main() {
  const summary = await storage.getAccountInvariantSummary();
  console.log("Account/Location invariant summary:");
  console.log(JSON.stringify(summary, null, 2));

  if (
    summary.orphanedLocations > 0 ||
    summary.accountsWithMultiplePrimaries > 0 ||
    summary.accountsMissingPrimary > 0 ||
    summary.accountPrimaryLocationMismatch > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Invariant validation failed:", error);
  process.exit(1);
});
