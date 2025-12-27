Storage & Cleaning Checks – Requirements & Mock-ups
1. Application Scope & Name
- Application name: Storage & Cleaning Checks
- Check frequency:
. Daily - AM shift
. Daily – PM shift
. Weekly
. Monthly

2. Global Requirements
- Mobile-first
- No training required
- Minimal clicks
- Checklist-based
- Checkbox MUST appear before the check description
- Auto-save of entered data (continuous)
- Submit finalises a check and generates a PDF report

3. Home Page – Requirements
- Single Home page for all check types
- Primary action buttons:
Create Daily AM shift checks
Create Daily PM shift checks
Create Weekly checks
Create Monthly checks
- Procedure buttons:
  • Cleaning Procedure (open document)
  • Storage Procedure (open document)
- Recent activity list:
  • Single chronological list (most recent first)
  • Each row shows: check type, date (EEE, dd-MMM-yyyy), responsible person, PDF link
- Click a row to view the record summary and/or open the PDF
- Edit allowed only if record is today and not yet submitted
- Older records accessible via calendar date search

4. Home Page – Mock-up (Textual)
--------------------------------------------------
🏠 KITCHEN SAFETY & CLEANING CHECKS
--------------------------------------------------
[ AM / PM ]   [ Weekly ]   [ Monthly ]
[ Cleaning Procedure ]   [ Storage Procedure ]

Recent activity
--------------------------------------------------
🟦 AM      Tue, 15-Apr-2025   Marie Dupont   [ PDF ]
🟧 Weekly  Mon, 14-Apr-2025   John Smith    [ PDF ]
🟥 Monthly Tue, 01-Apr-2025   Sara Lopez    [ PDF ]
--------------------------------------------------
🔍 Search by date [ 📅 ]
--------------------------------------------------

5. Action Page – Requirements (Weekly / Monthly)
- Check type clearly displayed (Weekly or Monthly)
- Date: mandatory, captured manually via calendar input
- Name of person cleaning: mandatory
- Checklist items:
  • Checkbox displayed BEFORE the text
  • One line per check
- For each cleaning task: Photo required (after cleaning)
- Optional Issues section: free text + photo URL(s)
- Bottom action bar (no Save button): Home + Submit

6. Weekly Checks – Checklist Items
- ☐ Deep clean fridges (shelves, seals)  — Photo required (after cleaning)
- ☐ Deep clean freezers (interior)       — Photo required (after cleaning)
- ☐ Clean & disinfect bins               — Photo required (after cleaning)
- ☐ Clean drains & sinks                 — Photo required (after cleaning)
- ☐ Clean small equipment & storage      — Photo required (after cleaning)
- ☐ Expired dry food discarded

7. Monthly Checks – Checklist Items
- ☐ Oven deep cleaning                   — Photo required (after cleaning)
- ☐ Dishwasher filter cleaned            — Photo required (after cleaning)
- ☐ Extractor hood / filters cleaned     — Photo required (after cleaning)
- ☐ Fridge door seals cleaned & checked  — Photo required (after cleaning)
- ☐ Freezer door seals cleaned & checked — Photo required (after cleaning)
- ☐ Dry storage inspected
- ☐ Expired dry food discarded
- ☐ Signs of pests checked

8. Action Page – Mock-up (Textual)
--------------------------------------------------
WEEKLY CHECK
--------------------------------------------------
Date: [ 📅 Select date ]
Cleaned by: [ Select name ]

CHECKS
☐ Deep clean fridges        📷 Photo required
☐ Deep clean freezers       📷 Photo required
☐ Clean & disinfect bins    📷 Photo required
☐ Clean drains & sinks      📷 Photo required
☐ Clean small equipment     📷 Photo required
☐ Expired dry food discarded

ISSUES (optional)
[ Free text ]
[ Add photo link(s) ]

[ 🏠 Home ]   [ Submit ]
--------------------------------------------------

9. Submit, Validation & Confirmation
- Submit validates:
  • Mandatory date
  • Mandatory cleaner name
  • Mandatory photo URL(s) for each cleaning task
- On successful submit:
  • PDF report generated
  • PDF sent to Operations Manager
  • Confirmation message displayed

10. Confirmation Message – Requirement
On submit, display:

“This report confirms that the checks were completed by <name>
on <EEE, dd-MMM-yyyy>, in accordance with the Kitchen Safety & Cleaning Checks procedure.”
11. Output Report – Requirements
- One PDF per submitted check
- PDF includes: application name, check type, date (EEE, dd-MMM-yyyy), responsible person, checklist results
- Photos are NOT embedded. The PDF displays clickable photo URL(s) instead.
- Issues section included if any (highlighted)

12. Output Report – Mock-up (Textual)
--------------------------------------------------
KITCHEN SAFETY & CLEANING CHECK
Monthly – Tue, 01-Apr-2025
Completed by: Sara Lopez
--------------------------------------------------

✔ Oven deep cleaning
   📷 Photo URL: https://drive.google.com/...

✔ Dishwasher filter cleaned
   📷 Photo URL: https://drive.google.com/...

✔ Extractor hood / filters cleaned
   📷 Photo URL: https://drive.google.com/...

✔ Fridge door seals cleaned & checked
   📷 Photo URL: https://drive.google.com/...

✔ Freezer door seals cleaned & checked
   📷 Photo URL: https://drive.google.com/...

✔ Dry storage inspected
✔ Expired dry food discarded
✔ Signs of pests checked

ISSUES
- None reported
--------------------------------------------------

