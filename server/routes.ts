import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertCustomerSchema, insertContactSchema, insertLocationSchema,
  insertServiceTypeSchema, insertAppointmentSchema, insertServiceRecordSchema,
  insertProductApplicationSchema, insertInvoiceSchema, insertCommunicationSchema,
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
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
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
