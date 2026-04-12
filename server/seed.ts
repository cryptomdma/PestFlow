import { db } from "./db";
import { customers, contacts, locations, serviceTypes, appointments, serviceRecords, productApplications, invoices, communications, billingProfiles, customerNotes, agreementTemplates } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  const existingCustomers = await db.select().from(customers);
  if (existingCustomers.length > 0) return;

  console.log("Seeding database...");

  const [c1, c2, c3, c4, c5] = await db.insert(customers).values([
    { firstName: "James", lastName: "Peterson", companyName: null, email: "james.peterson@email.com", phone: "(555) 234-5678", customerType: "residential", status: "active", notes: "Monthly pest prevention plan. Has a dog - use pet-safe products." },
    { firstName: "Sarah", lastName: "Chen", companyName: "Golden Gate Restaurant Group", email: "sarah@goldengatefoods.com", phone: "(555) 345-6789", customerType: "commercial", status: "active", notes: "Multi-location restaurant group. Requires monthly inspections for health compliance." },
    { firstName: "Mike", lastName: "Rodriguez", companyName: null, email: "mike.r@email.com", phone: "(555) 456-7890", customerType: "residential", status: "active", notes: "Termite treatment plan. Annual inspection required." },
    { firstName: "Linda", lastName: "Washington", companyName: "Sunset Property Management", email: "linda@sunsetpm.com", phone: "(555) 567-8901", customerType: "commercial", status: "active", notes: "Manages 12 residential units. Quarterly service contract." },
    { firstName: "Tom", lastName: "Baker", companyName: null, email: "tom.baker@email.com", phone: "(555) 678-9012", customerType: "residential", status: "prospect", notes: "Interested in one-time rodent treatment." },
  ]).returning();

  // Contacts are inserted after locations so they can be scoped to specific locations
  // They are re-inserted below after locations are created

  const [bp1, bp2] = await db.insert(billingProfiles).values([
    { customerId: c2.id, label: "Corporate Card", methodType: "card", lastFour: "4242", isDefault: true },
    { customerId: c2.id, label: "Westside Invoice", methodType: "invoice", lastFour: null, isDefault: false },
  ]).returning();

  await db.update(customers).set({ defaultBillingProfileId: bp1.id }).where(eq(customers.id, c2.id));

  const [l1, l2, l3, l4, l5, l6] = await db.insert(locations).values([
    { customerId: c1.id, name: "Home", address: "1234 Oak Street", city: "Springfield", state: "IL", zip: "62701", isPrimary: true, propertyType: "residential", squareFootage: 2400, gateCode: "1234", notes: "Single story ranch with large backyard" },
    { customerId: c2.id, name: "Downtown Location", address: "456 Main Street", city: "Springfield", state: "IL", zip: "62702", isPrimary: true, propertyType: "commercial", squareFootage: 4500, notes: "Restaurant with commercial kitchen and outdoor patio" },
    { customerId: c2.id, name: "Westside Location", address: "789 West Ave", city: "Springfield", state: "IL", zip: "62704", isPrimary: false, propertyType: "commercial", squareFootage: 3200, notes: "Smaller location, primarily take-out", billingProfileId: bp2.id },
    { customerId: c3.id, name: "Home", address: "321 Pine Lane", city: "Springfield", state: "IL", zip: "62703", isPrimary: true, propertyType: "residential", squareFootage: 3100, gateCode: "5678", notes: "Two story colonial with basement. History of termite activity." },
    { customerId: c4.id, name: "Sunset Apartments A", address: "100 Sunset Blvd, Building A", city: "Springfield", state: "IL", zip: "62705", isPrimary: true, propertyType: "multi-family", squareFootage: 12000, notes: "6 units, 3 floors" },
    { customerId: c4.id, name: "Sunset Apartments B", address: "100 Sunset Blvd, Building B", city: "Springfield", state: "IL", zip: "62705", isPrimary: false, propertyType: "multi-family", squareFootage: 12000, notes: "6 units, 3 floors" },
  ]).returning();

  await db.insert(contacts).values([
    { customerId: c2.id, locationId: l2.id, firstName: "David", lastName: "Chen", email: "david@goldengatefoods.com", phone: "(555) 345-6780", phoneType: "work", role: "Operations Manager", isPrimary: true },
    { customerId: c2.id, locationId: l3.id, firstName: "Maria", lastName: "Lopez", email: "maria@goldengatefoods.com", phone: "(555) 345-6781", phoneType: "mobile", role: "Kitchen Manager", isPrimary: true },
    { customerId: c4.id, locationId: l5.id, firstName: "Robert", lastName: "Hayes", email: "robert@sunsetpm.com", phone: "(555) 567-8902", phoneType: "work", role: "Maintenance Coordinator", isPrimary: true },
  ]);

  await db.insert(customerNotes).values([
    { customerId: c2.id, locationId: null, scope: "CUSTOMER", pinned: true, body: "VIP account - always prioritize scheduling. Sarah prefers communication via email. Multi-year contract in place.", createdBy: "Admin" },
    { customerId: c2.id, locationId: null, scope: "CUSTOMER", pinned: false, body: "Annual contract renewal coming up in March. Discuss pricing adjustment.", createdBy: "Jake Miller" },
    { customerId: null, locationId: l2.id, scope: "LOCATION", pinned: false, body: "Downtown kitchen has a grease trap area that needs extra attention during service visits. Access through the back alley.", createdBy: "Jake Miller" },
    { customerId: null, locationId: l3.id, scope: "LOCATION", pinned: true, body: "Westside location manager is Maria Lopez. She has the keys. Call before arrival.", createdBy: "Admin" },
    { customerId: c1.id, locationId: null, scope: "CUSTOMER", pinned: false, body: "James has a golden retriever named Max. Always use pet-safe products and keep gate closed.", createdBy: "Jake Miller" },
    { customerId: null, locationId: l1.id, scope: "LOCATION", pinned: false, body: "Check garage eaves for wasp nests in summer months.", createdBy: "Sam Torres" },
  ]);

  const [st1, st2, st3, st4, st5] = await db.insert(serviceTypes).values([
    { name: "General Pest Control", description: "Standard interior/exterior pest prevention treatment", defaultPrice: "125.00", estimatedDuration: 45, category: "General" },
    { name: "Termite Inspection", description: "Comprehensive WDI/WDO inspection with report", defaultPrice: "200.00", estimatedDuration: 60, category: "Termite" },
    { name: "Termite Treatment", description: "Liquid or bait station termite treatment", defaultPrice: "1500.00", estimatedDuration: 240, category: "Termite" },
    { name: "Rodent Control", description: "Interior/exterior rodent baiting and exclusion", defaultPrice: "175.00", estimatedDuration: 60, category: "Rodent" },
    { name: "Commercial Kitchen Service", description: "Monthly commercial pest management service", defaultPrice: "250.00", estimatedDuration: 90, category: "Commercial" },
  ]).returning();

  await db.insert(agreementTemplates).values([
    {
      name: "Control Plus",
      description: "Standard recurring residential pest prevention agreement.",
      isActive: true,
      defaultAgreementType: "Residential Recurring",
      defaultBillingFrequency: "Quarterly",
      defaultTermUnit: "YEAR",
      defaultTermInterval: 1,
      defaultRecurrenceUnit: "QUARTER",
      defaultRecurrenceInterval: 1,
      defaultGenerationLeadDays: 14,
      defaultServiceWindowDays: 7,
      defaultServiceTypeId: st1.id,
      defaultServiceTemplateName: "General Pest Control Visit",
      defaultDurationMinutes: 45,
      defaultPrice: "125.00",
      defaultInstructions: "Exterior perimeter treatment, garage, and common interior touchpoints.",
      sortOrder: 1,
      internalCode: "CONTROL_PLUS",
    },
    {
      name: "Sentricon Renewal",
      description: "Annual termite monitoring and renewal agreement.",
      isActive: true,
      defaultAgreementType: "Termite Renewal",
      defaultBillingFrequency: "Annual",
      defaultTermUnit: "YEAR",
      defaultTermInterval: 1,
      defaultRecurrenceUnit: "YEAR",
      defaultRecurrenceInterval: 1,
      defaultGenerationLeadDays: 30,
      defaultServiceWindowDays: 14,
      defaultServiceTypeId: st2.id,
      defaultServiceTemplateName: "Annual Termite Inspection",
      defaultDurationMinutes: 60,
      defaultPrice: "200.00",
      defaultInstructions: "Inspect stations, note activity, and document renewal status.",
      sortOrder: 2,
      internalCode: "SENTRICON_RENEWAL",
    },
    {
      name: "Mosquito Seasonal",
      description: "Warm-season mosquito reduction service template.",
      isActive: true,
      defaultAgreementType: "Seasonal Mosquito",
      defaultBillingFrequency: "Monthly",
      defaultTermUnit: "YEAR",
      defaultTermInterval: 1,
      defaultRecurrenceUnit: "MONTH",
      defaultRecurrenceInterval: 1,
      defaultGenerationLeadDays: 7,
      defaultServiceWindowDays: 5,
      defaultServiceTypeId: st1.id,
      defaultServiceTemplateName: "Mosquito Yard Treatment",
      defaultDurationMinutes: 35,
      defaultPrice: "95.00",
      defaultInstructions: "Treat harborage, standing water edges, and fence-line foliage.",
      sortOrder: 3,
      internalCode: "MOSQUITO_SEASONAL",
    },
  ]);

  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
  const yesterday = new Date(now.getTime() - 86400000);
  const tomorrow = new Date(now.getTime() + 86400000);
  const threeDays = new Date(now.getTime() + 3 * 86400000);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const twoWeeks = new Date(now.getTime() + 14 * 86400000);

  const [a1, a2, a3, a4, a5] = await db.insert(appointments).values([
    { customerId: c1.id, locationId: l1.id, serviceTypeId: st1.id, scheduledDate: twoDaysAgo, status: "completed", assignedTo: "Jake Miller", notes: "Monthly prevention service" },
    { customerId: c2.id, locationId: l2.id, serviceTypeId: st5.id, scheduledDate: yesterday, status: "completed", assignedTo: "Jake Miller", notes: "Monthly kitchen service" },
    { customerId: c3.id, locationId: l4.id, serviceTypeId: st2.id, scheduledDate: tomorrow, status: "scheduled", assignedTo: "Jake Miller", notes: "Annual termite inspection" },
    { customerId: c4.id, locationId: l5.id, serviceTypeId: st1.id, scheduledDate: threeDays, status: "scheduled", assignedTo: "Sam Torres", notes: "Quarterly service - all common areas" },
    { customerId: c2.id, locationId: l3.id, serviceTypeId: st5.id, scheduledDate: nextWeek, status: "scheduled", assignedTo: "Jake Miller", notes: "Monthly kitchen service - Westside" },
  ]).returning();

  const [sr1, sr2] = await db.insert(serviceRecords).values([
    { appointmentId: a1.id, customerId: c1.id, locationId: l1.id, serviceTypeId: st1.id, serviceDate: twoDaysAgo, technicianName: "Jake Miller", targetPests: ["Ants", "Spiders", "Crickets"], areasServiced: "Exterior perimeter, garage, kitchen, bathrooms", conditionsFound: "Minor ant activity near kitchen window. Spider webs in garage corners.", recommendations: "Seal gap around kitchen window. Remove debris from foundation.", customerSignature: true, confirmed: true },
    { appointmentId: a2.id, customerId: c2.id, locationId: l2.id, serviceTypeId: st5.id, serviceDate: yesterday, technicianName: "Jake Miller", targetPests: ["Roaches", "Flies", "Stored Product Pests"], areasServiced: "Kitchen, storage areas, dumpster area, dining room", conditionsFound: "Clean conditions. Minor fly activity near back door. No roach activity detected.", recommendations: "Replace weather stripping on back door. Continue monthly service.", customerSignature: true, confirmed: false },
  ]).returning();

  await db.insert(productApplications).values([
    { serviceRecordId: sr1.id, productName: "Demand CS", epaRegNumber: "100-1066", dilutionRate: "0.4 oz/gal", amountApplied: "2 gallons", applicationMethod: "Spray", device: "B&G Sprayer", applicationLocation: "Exterior perimeter, 3ft up/3ft out" },
    { serviceRecordId: sr1.id, productName: "Advion Ant Gel", epaRegNumber: "352-746", dilutionRate: "Ready to use", amountApplied: "15 grams", applicationMethod: "Bait placement", device: "Gel gun", applicationLocation: "Kitchen window sill, behind appliances" },
    { serviceRecordId: sr2.id, productName: "Vendetta Plus", epaRegNumber: "1021-2593", dilutionRate: "Ready to use", amountApplied: "30 grams", applicationMethod: "Crack & crevice bait", device: "Bait gun", applicationLocation: "Kitchen equipment bases, wall voids behind prep areas" },
    { serviceRecordId: sr2.id, productName: "Gentrol Point Source", epaRegNumber: "2724-469", dilutionRate: "Ready to use", amountApplied: "6 units", applicationMethod: "IGR placement", device: "Point source device", applicationLocation: "Under sinks, behind equipment" },
  ]);

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  await db.insert(invoices).values([
    { customerId: c1.id, locationId: l1.id, serviceRecordId: sr1.id, invoiceNumber: "INV-001", amount: "125.00", tax: "10.00", totalAmount: "135.00", status: "paid", dueDate: twoDaysAgo, paidDate: yesterday, notes: "Monthly pest prevention" },
    { customerId: c2.id, locationId: l2.id, serviceRecordId: sr2.id, invoiceNumber: "INV-002", amount: "250.00", tax: "20.00", totalAmount: "270.00", status: "pending", dueDate: nextWeek, notes: "Commercial kitchen service - Downtown" },
    { customerId: c4.id, locationId: l5.id, invoiceNumber: "INV-003", amount: "375.00", tax: "30.00", totalAmount: "405.00", status: "paid", dueDate: lastMonth, paidDate: lastMonth, notes: "Quarterly service - both buildings" },
    { customerId: c3.id, locationId: l4.id, invoiceNumber: "INV-004", amount: "200.00", tax: "16.00", totalAmount: "216.00", status: "pending", dueDate: twoWeeks, notes: "Annual termite inspection" },
  ]);

  await db.insert(communications).values([
    { customerId: c1.id, locationId: l1.id, type: "email", direction: "outbound", subject: "Service Confirmation", body: "Hi James, this is to confirm your monthly pest prevention service has been completed. Your next service is scheduled for next month. Please don't hesitate to reach out if you notice any pest activity.", sentAt: twoDaysAgo, status: "sent" },
    { customerId: c2.id, locationId: l2.id, type: "phone", direction: "inbound", subject: "Scheduling Call", body: "Sarah called to confirm next month's service schedule for both locations. Requested Tuesday mornings for Downtown and Thursday afternoons for Westside.", sentAt: yesterday, status: "logged" },
    { customerId: c3.id, locationId: l4.id, type: "email", direction: "outbound", subject: "Upcoming Termite Inspection Reminder", body: "Hi Mike, just a reminder that your annual termite inspection is scheduled for tomorrow. Our technician Jake will arrive between 9-10 AM. Please ensure access to the crawl space and attic areas.", sentAt: now, status: "sent" },
    { customerId: c5.id, type: "email", direction: "outbound", subject: "Quote for Rodent Treatment", body: "Hi Tom, thank you for your interest in our services. Based on our initial assessment, we recommend a comprehensive rodent treatment plan at $175. This includes interior/exterior baiting and exclusion work. Please let us know if you'd like to proceed.", sentAt: lastMonth, status: "sent" },
    { customerId: c4.id, locationId: l5.id, type: "sms", direction: "outbound", subject: "Service Reminder", body: "Hi Linda, reminder: quarterly pest service for Sunset Apartments is scheduled in 3 days. Please ensure common areas are accessible.", sentAt: now, status: "sent" },
    { customerId: c2.id, locationId: l3.id, type: "email", direction: "outbound", subject: "Westside Monthly Service Update", body: "Monthly kitchen service for the Westside location is scheduled for next week. Please ensure access to storage areas.", sentAt: now, status: "sent" },
  ]);

  console.log("Database seeded successfully!");
}
