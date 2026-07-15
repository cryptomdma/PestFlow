import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { bootstrapCanonicalAccounts } from "./account-bootstrap";
import { bootstrapCanonicalNotes, bootstrapCanonicalNoteTables } from "./note-bootstrap";
import { bootstrapAgreements } from "./agreement-bootstrap";
import { bootstrapServiceSchedulingFoundation } from "./service-scheduling-bootstrap";
import { bootstrapAuth } from "./auth-bootstrap";
import { setupAuth, registerAuthRoutes, requireAuth, attachOrgStorage } from "./auth";
import { bootstrapOrganizations } from "./org-bootstrap";
import { bootstrapTenancy } from "./tenancy-bootstrap";
import { bootstrapMoney } from "./money-bootstrap";
import { bootstrapOutbox } from "./outbox-bootstrap";
import { bootstrapBillingProfiles } from "./billing-profile-bootstrap";
import { backfillExpectedServiceCounts } from "./production-value-backfill";
import { bootstrapInvoices } from "./invoice-bootstrap";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await bootstrapOrganizations().catch((e) => console.error("Organization bootstrap error:", e));
  await bootstrapAuth().catch((e) => console.error("Auth bootstrap error:", e));
  setupAuth(app);
  registerAuthRoutes(app);
  app.use("/api", requireAuth, attachOrgStorage);

  // Table/column structure only (raw SQL, no query-builder use) must run
  // before bootstrapTenancy() adds org_id - everything below this point uses
  // the Drizzle query builder against these tables and needs org_id to
  // already exist in the DB, since it's already present in the schema types.
  await bootstrapAgreements().catch((e) => console.error("Agreement bootstrap error:", e));
  await bootstrapServiceSchedulingFoundation().catch((e) => console.error("Service scheduling bootstrap error:", e));
  await bootstrapCanonicalNoteTables().catch((e) => console.error("Note table bootstrap error:", e));
  await bootstrapOutbox().catch((e) => console.error("Outbox bootstrap error:", e));
  await bootstrapInvoices().catch((e) => console.error("Invoice bootstrap error:", e));
  await bootstrapTenancy().catch((e) => console.error("Tenancy bootstrap error:", e));
  await bootstrapMoney().catch((e) => console.error("Money bootstrap error:", e));
  await backfillExpectedServiceCounts().catch((e) => console.error("Production value backfill error:", e));

  await seedDatabase().catch((e) => console.error("Seed error:", e));
  await bootstrapCanonicalAccounts().catch((e) => console.error("Account bootstrap error:", e));
  // Needs accounts.legacy_customer_id populated for its account_id backfill,
  // so it must run after bootstrapCanonicalAccounts().
  await bootstrapBillingProfiles().catch((e) => console.error("Billing profile bootstrap error:", e));
  await bootstrapCanonicalNotes().catch((e) => console.error("Note bootstrap error:", e));
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);
    
    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
