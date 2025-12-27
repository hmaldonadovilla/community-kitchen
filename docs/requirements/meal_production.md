Meal Production – Business Requirements (Progressive Disclosure UX)
1. Purpose
This document defines the business and functional requirements for the Meal Production mobile application. The solution is designed for zero end-user training, minimal cognitive load, and strict compliance with food safety and reporting rules.
2. UX Principles (Authoritative)
•	Mobile-first, single-screen experience
•	Progressive disclosure: show only what is needed at each step
•	System-driven defaults to prevent user error
•	No free-text where a controlled value is possible
•	Visual clarity over density (avoid clutter)
•	Prevent errors instead of correcting them later
3. Screen Structure Overview
The Meal Production screen is composed of:
1. A fixed header (context)
2. A collapsible list of system-generated meal types
3. A totals section
4. Action buttons (ingredients and reports)
4. Header (Context)
- Customer (single value)
- Service (single value)
- Cook(s) (one or more values)
- Production date (format: EEE, dd-MMM-yyyy)

The Expiry date is not displayed on the screen. It is calculated automatically as:
Production date + 2 calendar days, and shown only in the Draft and Final reports.
5. Meal Types (System Generated)
Meal types are generated automatically by the system based on the selected Customer and Service. The user must not select meal types manually.

Example meal types: Diabetic, Normal, No-Salt, Vegan, Vegetarian.
6. Collapsed View (Default)
By default, each meal type is displayed as a single collapsed row showing:
- Meal type name
- Requested number of portions

If Requested portions = 0, the row is greyed out and cannot be expanded.
7. Expanded View (Per Meal Type)
When the user taps a meal type row, it expands inline to show the following fields in the exact order of the kitchen workflow:
•	Requested portions (0 or greater)
•	Leftover used? (default NO; user may change to YES)
•	Recipe used (one per line)
•	Core temperature (mandatory, numeric value + photo)
•	Actual portions (auto-filled from Requested, editable, must be ≥ Requested)
8. Requested Portions (Box 7)
- Requested portions must be 0 or greater.
- If Requested portions = 0:
  • The entire line is greyed out
  • All other fields are disabled

- The system calculates Total Requested Portions by summing all Requested portions for non-greyed lines.
9. Leftover Used? (Box 8 – Cascading)
- Default value is NO for every line.
- If the user changes the value to YES:
  • The system automatically creates an additional line with the same meal type
  • Requested portions = 0 (default)
  • Leftover used? = NO (default, editable)
  • All fields are present and editable
  • A reminder message is shown: “Update Requested portions if required”

- Additional lines behave exactly like any other line and can themselves generate further additional lines (no limit).
10. Core Temperature (Box 10)
- Core temperature is mandatory for every non-greyed line.
- The user must enter a numeric value > 0 and upload a photo.
- Core temperature must be entered before Actual portions.
11. Actual Portions (Box 11)
- Actual portions are automatically populated with the same value as Requested portions.
- The user may update the value.
- Actual portions must be greater than or equal to Requested portions.

- If Actual portions < Requested portions:
  • Draft report viewing is blocked
  • Final report generation is blocked
  • Error message displayed on the line:
    “You did not fulfil the requested number of portions for this meal type.”

- The system calculates Total Actual Portions by summing all Actual portions for non-greyed lines.
- Total Actual Portions must be ≥ Total Requested Portions.
12. Totals Section
- Total Requested Portions (read-only)
- Total Actual Portions (read-only)

Totals are updated in real time and displayed after the meal type list.
13. Ingredients Needed (Box 12)
- User clicks Ingredients Needed to view the aggregated ingredient list.
- Calculation is based on Requested portions only.
- Ingredients related to leftover portions must be excluded.
14. Reports (Boxes 13 & 14)
- Draft report can be viewed only if all validation rules are satisfied.
- Final report generates a PDF and locks the production run after confirmation.
- Confirmation message:
  “No change will be allowed once the report is produced. Do you want to proceed? YES / NO.”
15. Success Criteria
A production run can be successfully completed when:
- All active meal type lines are complete
- All food safety requirements are fulfilled
- Actual portions and totals meet or exceed requested values
- Draft and Final reports can be generated without validation errors
