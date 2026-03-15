# PestFlow UI Standardization Brief

## Purpose

PestFlow should look and feel consistent across the real working app without turning back into a dashboard mockup or a demo shell.

The goal is to standardize the visual language of the app while preserving working behavior and keeping the UI honest.

## Core UI principles

1. **Function before flourish**
   A working screen with clean spacing is better than a visually rich mock screen with dead controls.

2. **Location-first clarity**
   The app should always make it clear which location the user is viewing or acting on.

3. **Consistency across pages**
   Customers, customer detail, schedule, services, invoices, communications, reports, and settings should share the same visual system.

4. **Low-bloat density**
   Keep screens clean, but not empty. Pest control office staff need speed, context, and scan-ability.

5. **Truthful states**
   Empty states, loading states, and disabled controls should be explicit and honest.

## Visual system guidance

### Page header pattern

Use a consistent page header on major screens:

* title
* short subtitle or context text
* actions on the right only if they are real and useful

### Card pattern

Use the same card shell across screens:

* consistent padding
* consistent border radius
* consistent shadow/border treatment
* consistent title + content spacing

### Tab pattern

For detail screens, tabs should:

* be visually consistent
* clearly reflect selected context
* avoid over-stylized mockup behavior

### Form pattern

Forms should:

* group related fields cleanly
* use the same label, helper text, and validation style everywhere
* surface required fields clearly
* avoid collecting fields that do not matter for the chosen type (residential vs commercial)

### List/table pattern

Use one main visual language for lists:

* customer/location lists
* service history entries
* invoice rows
* communication logs

Users should not feel like each page belongs to a different app.

## Dashboard / home screen rules

* The home screen should be an **Operations Home**, not a fake executive dashboard.
* Use live data only.
* No fake charts, fake KPI cards, or dead nav widgets.
* Quick links are okay if they are real.

## What to standardize first

Priority order for UI standardization:

1. Customers list
2. Customer detail
3. Schedule
4. Services
5. Invoices
6. Communications
7. Dashboard/home

## What not to do

* Do not redesign everything at once.
* Do not convert working pages into mockups.
* Do not add decorative components without operational value.
* Do not introduce buttons or tabs that are not wired.

## Implementation approach

When improving UI:

1. preserve working behavior
2. standardize layout and spacing first
3. standardize cards/forms/tables next
4. only then consider cosmetic enhancement

## Definition of a successful UI pass

A UI standardization pass is successful when:

* the page is still fully functional
* spacing and hierarchy match the rest of the app
* controls are real and understandable
* the screen looks like it belongs to the same product as the rest of PestFlow
