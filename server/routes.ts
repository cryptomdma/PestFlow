import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertCustomerSchema, insertContactSchema, insertLocationSchema,
  insertServiceTypeSchema, insertAppointmentSchema, insertServiceRecordSchema,
  insertProductApplicationSchema, insertInvoiceSchema, insertCommunicationSchema,
  insertBillingProfileSchema, insertCustomerNoteSchema,
} from "@shared/schema";
import { ZodError } from "zod";

function handleZodError(res: any, error: ZodError) {
  const messages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
  return res.status(400).json({ message: `Validation error: ${messages}` });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Transitional dev-only diagnostics for Phase 1 account/location hardening.
  // TODO(Phase2): gate behind auth/admin controls once user model exists.
  app.get("/api/dev/account-invariants", async (_req, res) => {
    const data = await storage.getAccountInvariantSummary();
    res.json(data);
  });

  // Transitional compatibility endpoint for Phase 1 account/location bootstrap.
  app.get("/api/customer-detail-compat/:legacyCustomerId", async (req, res) => {
    const data = await storage.getCustomerDetailCompat(
      req.params.legacyCustomerId,
      typeof req.query.locationId === "string" ? req.query.locationId : undefined,
    );
    if (!data) return res.status(404).json({ message: "Customer detail not found" });
    res.json(data);
  });

  // Customers
  app.get("/api/customers", async (_req, res) => {
    const data = await storage.getCustomers();
    res.json(data);
  });

  app.get("/api/customers/:id", async (req, res) => {
    const data = await storage.getCustomer(req.params.id);
    if (!data) return res.status(404).json({ message: "Customer not found" });
    res.json(data);
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const validated = insertCustomerSchema.parse(req.body);
      const data = await storage.createCustomer(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const validated = insertCustomerSchema.partial().parse(req.body);
      const data = await storage.updateCustomer(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Customer not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Contacts
  app.get("/api/contacts/:customerId", async (req, res) => {
    const data = await storage.getContacts(req.params.customerId);
    res.json(data);
  });

  app.get("/api/contacts/by-location/:locationId", async (req, res) => {
    const data = await storage.getContactsByLocation(req.params.locationId);
    res.json(data);
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const data = await storage.createContact(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Locations
  app.get("/api/locations/:customerId", async (req, res) => {
    const data = await storage.getLocations(req.params.customerId);
    res.json(data);
  });

  app.get("/api/all-locations", async (_req, res) => {
    const data = await storage.getAllLocations();
    res.json(data);
  });

  app.post("/api/locations", async (req, res) => {
    try {
      const validated = insertLocationSchema.parse(req.body);
      const data = await storage.createLocation(validated);
      if (validated.isPrimary) {
        await storage.setPrimaryLocation(data.customerId, data.id);
      }
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/locations/:id", async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const data = await storage.updateLocation(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Location not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/locations/:id/set-primary", async (req, res) => {
    try {
      const loc = await storage.getLocation(req.params.id);
      if (!loc) return res.status(404).json({ message: "Location not found" });
      await storage.setPrimaryLocation(loc.customerId, loc.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Billing Profiles
  app.get("/api/billing-profiles/:customerId", async (req, res) => {
    const data = await storage.getBillingProfiles(req.params.customerId);
    res.json(data);
  });

  app.post("/api/billing-profiles", async (req, res) => {
    try {
      const validated = insertBillingProfileSchema.parse(req.body);
      const data = await storage.createBillingProfile(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Customer Notes
  app.get("/api/notes/shared/:customerId", async (req, res) => {
    const data = await storage.getSharedNotes(req.params.customerId);
    res.json(data);
  });

  app.get("/api/notes/location/:locationId", async (req, res) => {
    const data = await storage.getNotesByLocation(req.params.locationId);
    res.json(data);
  });

  app.post("/api/notes", async (req, res) => {
    try {
      const validated = insertCustomerNoteSchema.parse(req.body);
      const data = await storage.createNote(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/notes/:id/convert-scope", async (req, res) => {
    try {
      const { scope, customerId, locationId } = req.body;
      if (!scope || (scope !== "CUSTOMER" && scope !== "LOCATION")) {
        return res.status(400).json({ message: "Invalid scope. Must be CUSTOMER or LOCATION." });
      }
      const data = await storage.updateNoteScope(req.params.id, scope, customerId || null, locationId || null);
      if (!data) return res.status(404).json({ message: "Note not found" });
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ message: e.message });
    }
  });

  // Location-scoped counts
  app.get("/api/location-counts/:locationId", async (req, res) => {
    const data = await storage.getLocationScopedCounts(req.params.locationId);
    res.json(data);
  });

  // Location-scoped data endpoints
  app.get("/api/appointments/by-location/:locationId", async (req, res) => {
    const data = await storage.getAppointmentsByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/service-records/by-location/:locationId", async (req, res) => {
    const data = await storage.getServiceRecordsByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/invoices/by-location/:locationId", async (req, res) => {
    const data = await storage.getInvoicesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/communications/by-location/:locationId", async (req, res) => {
    const data = await storage.getCommunicationsByLocation(req.params.locationId);
    res.json(data);
  });

  // Service Types
  app.get("/api/service-types", async (_req, res) => {
    const data = await storage.getServiceTypes();
    res.json(data);
  });

  app.post("/api/service-types", async (req, res) => {
    try {
      const validated = insertServiceTypeSchema.parse(req.body);
      const data = await storage.createServiceType(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Appointments
  app.get("/api/appointments", async (_req, res) => {
    const data = await storage.getAppointments();
    res.json(data);
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const validated = insertAppointmentSchema.parse(req.body);
      const data = await storage.createAppointment(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      const validated = insertAppointmentSchema.partial().parse(req.body);
      const data = await storage.updateAppointment(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Appointment not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Service Records
  app.get("/api/service-records", async (_req, res) => {
    const data = await storage.getServiceRecords();
    res.json(data);
  });

  app.get("/api/service-records/:id", async (req, res) => {
    const data = await storage.getServiceRecord(req.params.id);
    if (!data) return res.status(404).json({ message: "Service record not found" });
    res.json(data);
  });

  app.post("/api/service-records", async (req, res) => {
    try {
      const validated = insertServiceRecordSchema.parse(req.body);
      const data = await storage.createServiceRecord(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/service-records/:id", async (req, res) => {
    try {
      const validated = insertServiceRecordSchema.partial().parse(req.body);
      const data = await storage.updateServiceRecord(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Service record not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Product Applications
  app.get("/api/product-applications", async (_req, res) => {
    const data = await storage.getProductApplications();
    res.json(data);
  });

  app.post("/api/product-applications", async (req, res) => {
    try {
      const validated = insertProductApplicationSchema.parse(req.body);
      const data = await storage.createProductApplication(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Invoices
  app.get("/api/invoices", async (_req, res) => {
    const data = await storage.getInvoices();
    res.json(data);
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const validated = insertInvoiceSchema.parse(req.body);
      const data = await storage.createInvoice(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/invoices/:id", async (req, res) => {
    try {
      const validated = insertInvoiceSchema.partial().parse(req.body);
      const data = await storage.updateInvoice(req.params.id, validated);
      if (!data) return res.status(404).json({ message: "Invoice not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  // Communications
  app.get("/api/communications/:customerId", async (req, res) => {
    const data = await storage.getCommunications(req.params.customerId);
    res.json(data);
  });

  app.get("/api/all-communications", async (_req, res) => {
    const data = await storage.getAllCommunications();
    res.json(data);
  });

  app.post("/api/communications", async (req, res) => {
    try {
      const validated = insertCommunicationSchema.parse(req.body);
      const data = await storage.createCommunication(validated);
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  return httpServer;
}
