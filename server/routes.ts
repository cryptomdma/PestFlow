import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertCustomerSchema, insertContactSchema, insertLocationSchema,
  insertServiceTypeSchema, insertAppointmentSchema, insertServiceRecordSchema,
  insertProductApplicationSchema, insertInvoiceSchema, insertCommunicationSchema,
  insertBillingProfileSchema,
} from "@shared/schema";
import { normalizePhone } from "@shared/phone";
import { ZodError, z } from "zod";
import type { Request } from "express";

function handleZodError(res: any, error: ZodError) {
  const messages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
  return res.status(400).json({ message: `Validation error: ${messages}` });
}

function getAuditActor(req: Request) {
  return {
    userId: req.header("x-pestflow-user-id") || null,
    actorLabel: req.header("x-pestflow-user-name") || null,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const createCustomerWithLocationSchema = z.object({
    customer: insertCustomerSchema,
    location: insertLocationSchema.omit({ customerId: true, accountId: true, isPrimary: true }),
    initialContact: insertContactSchema
      .omit({ customerId: true, locationId: true })
      .optional(),
  });
  const createLocationWithContactSchema = z.object({
    location: insertLocationSchema,
    initialContact: insertContactSchema
      .omit({ customerId: true, locationId: true })
      .optional(),
  });
  const updateLocationProfileSchema = z.object({
    location: insertLocationSchema
      .omit({ customerId: true, accountId: true, isPrimary: true })
      .partial(),
    customer: insertCustomerSchema
      .pick({
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
        phone: true,
        customerType: true,
      })
      .partial()
      .optional(),
  });
  const saveScopedNoteSchema = z.object({
    scope: z.enum(["ACCOUNT", "LOCATION"]),
    customerId: z.string().nullable().optional(),
    locationId: z.string().nullable().optional(),
    body: z.string(),
  }).superRefine((value, ctx) => {
    if (value.scope === "ACCOUNT" && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "customerId is required for account-scoped notes",
      });
    }

    if (value.scope === "LOCATION" && !value.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationId"],
        message: "locationId is required for location-scoped notes",
      });
    }
  });
  const updateContactSchema = insertContactSchema
    .pick({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phoneType: true,
      role: true,
      isPrimary: true,
    })
    .partial();

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
      const customerNotesBody = validated.notes?.trim() || "";
      const data = await storage.createCustomer({
        ...validated,
        notes: null,
      });
      if (customerNotesBody) {
        await storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: data.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/customers/create-with-primary-location", async (req, res) => {
    try {
      const validated = createCustomerWithLocationSchema.parse(req.body);
      const customerNotesBody = validated.customer.notes?.trim() || "";
      const locationNotesBody = validated.location.notes?.trim() || "";
      const isCommercial = validated.customer.customerType === "commercial";
      const isResidential = validated.customer.customerType === "residential";

      if (isCommercial && !validated.customer.companyName?.trim()) {
        return res.status(400).json({ message: "Commercial customers require companyName." });
      }

      if (isResidential && (!validated.customer.firstName?.trim() || !validated.customer.lastName?.trim())) {
        return res.status(400).json({ message: "Residential customers require firstName and lastName." });
      }

      const locationMissing =
        !validated.location.address?.trim() ||
        !validated.location.city?.trim() ||
        !validated.location.state?.trim() ||
        !validated.location.zip?.trim();

      const customerMissing =
        !validated.customer.firstName?.trim() ||
        !validated.customer.lastName?.trim() ||
        !validated.customer.email?.trim() ||
        !validated.customer.phone?.trim();

      if (locationMissing) {
        return res.status(400).json({ message: "Primary location address, city, state, and zip are required." });
      }

      if (customerMissing) {
        return res.status(400).json({ message: "First name, last name, email, and phone are required." });
      }

      if (!validated.location.source?.trim()) {
        return res.status(400).json({ message: "Primary location source is required." });
      }

      const contact = validated.initialContact;
      const hasAnyContactValue =
        !!contact?.firstName?.trim() &&
        !!contact?.lastName?.trim() &&
        !!contact?.email?.trim() &&
        !!contact?.phone?.trim();

      const initialContact = hasAnyContactValue
        ? {
            ...contact!,
            firstName: contact!.firstName.trim(),
            lastName: contact!.lastName.trim(),
            email: contact!.email!.trim(),
            phone: normalizePhone(contact!.phone) || null,
            isPrimary: true,
          }
        : undefined;

      const data = await storage.createCustomerWithPrimaryLocation({
        customer: {
          ...validated.customer,
          email: validated.customer.email?.trim() || null,
          phone: normalizePhone(validated.customer.phone) || null,
          notes: null,
        },
        location: {
          ...validated.location,
          notes: null,
        },
        initialContact,
      });

      if (customerNotesBody) {
        await storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: data.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }

      if (locationNotesBody) {
        const createdLocations = await storage.getLocations(data.id);
        const primaryLocation = createdLocations.find((location) => location.isPrimary) ?? createdLocations[0];
        if (primaryLocation) {
          await storage.saveScopedNote({
            scope: "LOCATION",
            locationId: primaryLocation.id,
            body: locationNotesBody,
            actor: getAuditActor(req),
          });
        }
      }

      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      const validated = insertCustomerSchema.partial().parse(req.body);
      const customerNotesBody = validated.notes !== undefined ? (validated.notes?.trim() || "") : undefined;
      const data = await storage.updateCustomer(req.params.id, {
        ...validated,
        notes: validated.notes !== undefined ? null : validated.notes,
      });
      if (!data) return res.status(404).json({ message: "Customer not found" });
      if (customerNotesBody !== undefined) {
        await storage.saveScopedNote({
          scope: "ACCOUNT",
          customerId: req.params.id,
          body: customerNotesBody,
          actor: getAuditActor(req),
        });
      }
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
      const phoneType = validated.phoneType?.trim().toLowerCase();
      if (phoneType && !["mobile", "home", "work", "fax"].includes(phoneType)) {
        return res.status(400).json({ message: "Phone type must be mobile, home, work, or fax." });
      }

      const data = await storage.createContact({
        ...validated,
        email: validated.email?.trim() || null,
        phone: normalizePhone(validated.phone) || null,
        phoneType: phoneType || null,
        role: validated.role?.trim() || null,
      });
      res.status(201).json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const validated = updateContactSchema.parse(req.body);
      const phoneType = validated.phoneType?.trim().toLowerCase();
      if (phoneType && !["mobile", "home", "work", "fax"].includes(phoneType)) {
        return res.status(400).json({ message: "Phone type must be mobile, home, work, or fax." });
      }

      const data = await storage.updateContact(req.params.id, {
        ...validated,
        email: validated.email === undefined ? undefined : validated.email?.trim() || null,
        phone: validated.phone === undefined ? undefined : normalizePhone(validated.phone) || null,
        phoneType: validated.phoneType === undefined ? undefined : phoneType || null,
        role: validated.role === undefined ? undefined : validated.role?.trim() || null,
      });
      if (!data) return res.status(404).json({ message: "Contact not found" });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
      res.status(400).json({ message: e.message });
    }
  });

  app.post("/api/contacts/:id/set-primary", async (req, res) => {
    try {
      const data = await storage.setPrimaryContact(req.params.id);
      if (!data) return res.status(404).json({ message: "Contact not found" });
      res.json(data);
    } catch (e: any) {
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
      const validated = createLocationWithContactSchema.safeParse(req.body);
      const locationPayload = validated.success ? validated.data.location : insertLocationSchema.parse(req.body);
      const rawInitialContact = validated.success ? validated.data.initialContact : undefined;
      const locationNotesBody = locationPayload.notes?.trim() || "";
      const initialContact =
        rawInitialContact && (
          rawInitialContact.firstName?.trim() ||
          rawInitialContact.lastName?.trim() ||
          rawInitialContact.email?.trim() ||
          rawInitialContact.phone?.trim()
        )
          ? {
              ...rawInitialContact,
              firstName: rawInitialContact.firstName.trim(),
              lastName: rawInitialContact.lastName.trim(),
              email: rawInitialContact.email?.trim() || null,
              phone: normalizePhone(rawInitialContact.phone) || null,
              role: rawInitialContact.role?.trim() || "primary",
              isPrimary: true,
            }
          : undefined;

      const data = initialContact
        ? await storage.createLocationWithPrimaryContact({
            location: {
              ...locationPayload,
              notes: null,
            },
            initialContact,
          })
        : await storage.createLocation({
            ...locationPayload,
            notes: null,
          });
      if (locationNotesBody) {
        await storage.saveScopedNote({
          scope: "LOCATION",
          locationId: data.id,
          body: locationNotesBody,
          actor: getAuditActor(req),
        });
      }
      if (locationPayload.isPrimary) {
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

  app.patch("/api/customers/:customerId/locations/:locationId/profile", async (req, res) => {
    try {
      const validated = updateLocationProfileSchema.parse(req.body);
      const existingLocation = await storage.getLocation(req.params.locationId);
      if (!existingLocation || existingLocation.customerId !== req.params.customerId) {
        return res.status(404).json({ message: "Location not found" });
      }

      if (validated.customer && !existingLocation.isPrimary) {
        return res.status(400).json({ message: "Customer identity fields can only be edited from the primary location." });
      }

      const nextCustomerType = validated.customer?.customerType;
      if (
        nextCustomerType &&
        nextCustomerType !== existingLocation.propertyType &&
        nextCustomerType !== "commercial" &&
        nextCustomerType !== "residential"
      ) {
        return res.status(400).json({ message: "Customer type must be residential or commercial." });
      }

      if (nextCustomerType === "commercial" && !validated.customer?.companyName?.trim()) {
        return res.status(400).json({ message: "Commercial customers require companyName." });
      }

      const nextLocationType = validated.location.propertyType;
      if (
        nextLocationType &&
        nextLocationType !== existingLocation.propertyType &&
        nextLocationType !== "commercial" &&
        nextLocationType !== "residential"
      ) {
        return res.status(400).json({ message: "Location type must be residential or commercial." });
      }

      if (existingLocation.isPrimary && validated.customer) {
        const customerMissing =
          !validated.customer.firstName?.trim() ||
          !validated.customer.lastName?.trim() ||
          !validated.customer.email?.trim() ||
          !validated.customer.phone?.trim();

        if (customerMissing) {
          return res.status(400).json({ message: "Primary location edits require first name, last name, email, and phone." });
        }
      }

      const result = await storage.updateLocationProfile({
        customerId: req.params.customerId,
        locationId: req.params.locationId,
        actor: getAuditActor(req),
        customer: validated.customer
          ? {
              ...validated.customer,
              firstName: validated.customer.firstName?.trim(),
              lastName: validated.customer.lastName?.trim(),
              companyName: validated.customer.companyName?.trim() || null,
              email: validated.customer.email?.trim() || null,
              phone: normalizePhone(validated.customer.phone) || null,
            }
          : undefined,
        location: {
          ...validated.location,
          name: validated.location.name?.trim(),
          address: validated.location.address?.trim(),
          city: validated.location.city?.trim(),
          state: validated.location.state?.trim(),
          zip: validated.location.zip?.trim(),
          propertyType: validated.location.propertyType,
          source: validated.location.source?.trim(),
          gateCode: validated.location.gateCode?.trim() || null,
          notes: null,
          lotSize: validated.location.lotSize?.trim() || null,
        },
      });

      if (!result) return res.status(404).json({ message: "Location not found" });
      if (validated.location.notes !== undefined) {
        await storage.saveScopedNote({
          scope: "LOCATION",
          locationId: req.params.locationId,
          body: validated.location.notes?.trim() || "",
          actor: getAuditActor(req),
        });
      }
      res.json(result);
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

  // Canonical Notes
  app.get("/api/notes/shared/:customerId", async (req, res) => {
    const data = await storage.getSharedNotes(req.params.customerId);
    res.json(data);
  });

  app.get("/api/notes/location/:locationId", async (req, res) => {
    const data = await storage.getNotesByLocation(req.params.locationId);
    res.json(data);
  });

  app.get("/api/notes/:noteId/revisions", async (req, res) => {
    const data = await storage.getNoteRevisions(req.params.noteId);
    res.json(data);
  });

  app.put("/api/notes/scoped", async (req, res) => {
    try {
      const validated = saveScopedNoteSchema.parse(req.body);
      const data = await storage.saveScopedNote({
        ...validated,
        actor: getAuditActor(req),
      });
      res.json(data);
    } catch (e: any) {
      if (e instanceof ZodError) return handleZodError(res, e);
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

  app.get("/api/location-balances/:customerId", async (req, res) => {
    const data = await storage.getLocationBalancesByCustomer(req.params.customerId);
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
