# Email recipient validation

## Problem

Email recipient values can come from form fields, static configuration, placeholders, or data-source lookups. A malformed data-source value previously reached the Gmail provider unchanged. In a direct report milestone, that caused the PDF/email action to fail after report generation had already started.

## Solution design

1. Treat email syntax as a reusable domain rule rather than a Customer Management special case.
2. Add `format: "email" | "emailList"` to conditional validation rules.
3. Configure the Customer Management `DIST_EMAIL` field with `emailList` validation. Multiple addresses use commas; whitespace alone is never interpreted as a separator.
4. Parse and validate all resolved `to`, `cc`, and `bcc` recipients before any downstream PDF generation or email-provider call.
5. Add an optional `sourceLabel` to data-source recipient entries so downstream errors can identify the application where the invalid value must be corrected.
6. Keep Apps Script and Cloud Run behavior equivalent.

## Validation contract

- Empty values are handled separately by existing required-field validation.
- A single address is valid for both `email` and `emailList`.
- `emailList` accepts multiple comma-separated addresses and trims surrounding whitespace.
- `email` rejects more than one address.
- Whitespace-separated addresses, semicolon-separated addresses, empty list entries, display-name syntax, and malformed local/domain parts are rejected.
- Valid duplicate addresses are collapsed case-insensitively at the downstream recipient boundary.
- The validator checks syntax only; it does not attempt DNS, mailbox, or deliverability checks.

## Failure behavior

Customer Management blocks save/submit and shows:

> Enter valid email addresses. Separate multiple addresses with commas.

A downstream application using a data-source recipient shows a source-aware message such as:

> Email could not be sent because Customer Management contains an invalid recipient email for "Belliard". Update the email there and retry. Separate multiple addresses with commas.

The downstream action must not generate a PDF or call Gmail after recipient validation fails.

## Implementation slices

1. Domain parser and conditional validation rule.
2. Customer Management configuration.
3. Apps Script and Cloud Run recipient-boundary validation.
4. Schema, setup guidance, tests, staging deployment, and staging smoke validation.

## Acceptance criteria

- Customer Management accepts one address and comma-separated address lists.
- Customer Management rejects two addresses separated only by whitespace.
- Downstream actions identify Customer Management when its resolved value is invalid.
- Invalid recipients prevent both PDF generation and email dispatch.
- Apps Script and Cloud Run have regression tests for the failure path.
- Lint, unit tests, build, and staging browser smoke tests pass.
