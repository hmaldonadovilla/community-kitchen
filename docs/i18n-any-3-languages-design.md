## Design: Support any 3 languages (dynamic language codes)

### Summary
Today, the app’s localization is effectively **hard-wired to EN/FR/NL**:
- The config sheet uses fixed columns like `Question (EN)`, `Question (FR)`, `Question (NL)` and `Options (EN|FR|NL)`.
- `WebFormDefinition.languages` and `WebFormSubmission.language` are typed/validated as `EN|FR|NL`.
- Some utilities assume `en/fr/nl` (e.g., option localization, date formatting).

This document proposes a backwards-compatible design to support **any 3 language codes** per form (e.g. `ES`, `FR-CA`, `AR`) while still limiting the UI to a maximum of 3 concurrently.

---

## Goals
- **Allow any language codes**, up to **3 active at a time**, per form (dashboard setting).
- Keep the configuration **sheet-friendly** for non-developers:
  - They should be able to add/rename columns like `Question (ES)` / `Options (ES)` without code changes.
- Keep **existing EN/FR/NL sheets working unchanged**.
- Ensure **stored submission values remain stable** across UI language switches (avoid “value depends on UI language” bugs).
- Support a predictable fallback chain for region variants (e.g. `fr-be` → `fr` → `en`).

## Non-goals (for this iteration)
- Unlimited languages simultaneously (the UI cap remains 3).
- Automatic translation.
- A full “stable option IDs” migration (we’ll outline it as an optional later upgrade).

---

## Proposed approach (high-level)

### 1) Make languages fully dynamic in types + definition
Change shared types to treat language codes as **strings**:
- `WebFormDefinition.languages: string[]` (max 3)
- `WebFormSubmission.language: string`
- Keep `LocalizedString` as `Record<string, string>`-like (already supports arbitrary keys)

**Canonical representation**
- In the runtime, treat language codes as **upper-case for UI** (`ES`, `FR-CA`) and **lower-case for lookup keys** (`es`, `fr-ca`).

### 2) Make sheet columns dynamic: `Question (<lang>)` / `Options (<lang>)`
Update `ConfigSheet.getQuestions()` to detect language columns from headers.

**Header format**
- Labels: `Question (<LANG_CODE>)`
- Options: `Options (<LANG_CODE>)`
- Examples:
  - `Question (ES)`, `Options (ES)`
  - `Question (FR-CA)`, `Options (FR-CA)`
  - `Question (AR)`, `Options (AR)`

**Backwards compatibility**
- Existing headers `Question (EN|FR|NL)` and `Options (EN|FR|NL)` continue to work.

**Extraction logic**
- Parse header row and build:
  - `questionTextByLang: Record<langKey, string>`
  - `optionsByLang: Record<langKey, string[]>`
- Keep the existing “findHeader” behavior for non-language fields (Type, Required, Status, etc.).

### 3) Define a canonical “value language” for CHOICE/CHECKBOX storage
To avoid storing different values depending on the UI language:
- Choose a **canonical language** for option *values* (internal storage).
- Recommendation: `valueLanguage = defaultLanguage` (or explicitly configurable later).

**OptionSet shape**
The current `OptionSet` is already indexable by arbitrary keys, but the code assumes `en` is canonical.
Adopt this convention:
- `optionSet.__baseLang` (new): the lower-case language key used as canonical values
- `optionSet[__baseLang]`: the canonical values array
- `optionSet[langKey]`: label arrays for each language (same length as base)

**Rules**
- If `en` exists, keep `__baseLang = 'en'` (preserves current behavior).
- Else, `__baseLang = lower(defaultLanguage)` if present.
- Else, `__baseLang = first configured language`.

### 4) Update option localization helpers to be base-language aware

Key updates are needed so **stored values don’t change** when the user switches UI language.

**Web option rendering (`buildLocalizedOptions`)**
- Current behavior uses `options.en` as the “base values” and falls back to the current language list when `en` is missing. That can make `OptionItem.value` vary by UI language.
- New behavior:
  - Resolve `baseLangKey`:
    - `options.__baseLang` if present, else
    - `en` if present, else
    - `lower(definition.defaultLanguage)` if present, else
    - first configured language
  - `baseValues = options[baseLangKey]` (canonical values)
  - `labels = options[langKey] || baseValues`
  - Always emit `OptionItem.value = baseValues[idx]` (canonical)
  - Emit `OptionItem.label = labels[idx] || baseValues[idx]`
  - Emit `OptionItem.labels` as a **dynamic map** for configured languages (not hard-coded `en/fr/nl`)

**Value display (`localizeOptionValue`)**
- Today it assumes `optionSet.en` is canonical.
- New behavior should match the above:
  - Identify `baseLangKey` (same algorithm).
  - Find index in `optionSet[baseLangKey]`.
  - Return `optionSet[langKey][idx]` if present, else base value.

---

## Localization lookup behavior (fallback chain)
Today, `resolveLocalizedString` checks only:
1) exact key (lowercased)  
2) `en`  
3) fallback

To support region variants and be more forgiving, introduce a fallback chain:
- For a requested language code `FR-BE` → lookup keys in order:
  1) `fr-be`
  2) `fr`
  3) `en`
  4) fallback

Applies to:
- question labels (`resolveLocalizedString`)
- system strings (`tSystem` uses `resolveLocalizedString`)
- group/subgroup labels and any other `LocalizedString`

---

## Dates / numbers for arbitrary languages
The app currently formats dates with hard-coded arrays for EN/FR/NL.

Recommended upgrade:
- Prefer `Intl.DateTimeFormat` and `Intl.NumberFormat` in the React client for arbitrary language codes.
- Use the selected language code as the locale:
  - `EN` → `en`
  - `NL` → `nl-BE` (if you want Belgian Dutch) or `nl`
  - Keep any BCP-47 codes as-is (e.g. `fr-CA`, `es`, `ar`)
- Provide fallback to the existing EN/FR/NL arrays if `Intl` is unavailable (tests / unusual runtimes).

---

## Sheet and validation changes

### ConfigSheet (`src/config/ConfigSheet.ts`)
Update parsing to:
- detect language columns from headers
- read up to 3 languages (or more if present, but the form will only select up to 3)
- build `QuestionConfig` with:
  - `label: LocalizedString` (new field) OR keep `qEn/qFr/qNl` but also produce a `qByLang` map
  - `optionsByLang: Record<string, string[]>` (new field) OR unify into a dynamic `options` object

**Compatibility strategy**
- Continue populating the existing `qEn/qFr/qNl` and `options/optionsFr/optionsNl` for legacy paths.
- Add new fields that the new DefinitionBuilder will prefer when present.

### ConfigValidator (`src/config/ConfigValidator.ts`)
Replace EN/FR/NL-only validation with dynamic languages:
- Duplicate label check:
  - for each configured language column, ensure uniqueness of question names within that language
- Option count check:
  - enforce that all configured language option lists have the same length as the base language
- Keep existing behavior if only EN/FR/NL columns exist.

---

## Definition building (Apps Script runtime)

### DefinitionBuilder (`src/services/webform/definitionBuilder.ts`)
Generalize language resolution:
- Accept any `form.languages` codes (strings), uppercase.
- Detect available language codes from the sheet header columns.
- Compute `effectiveLanguages`:
  - If dashboard explicitly sets `languages`, intersect with detected sheet languages.
  - Else, take detected sheet languages.
  - Enforce max 3.
- Compute `defaultLanguage`:
  - If configured and present in effective list, use it.
  - Else, pick the first effective language.
- If language selector is disabled, return `[defaultLanguage]`.

Build question definition using dynamic keys:
- `label`: use detected label columns as a `LocalizedString` keyed by lower-case language codes.
- `options`: store a dynamic object keyed by lower-case language codes, plus `__baseLang`.

---

## System strings
`systemStrings.json` already supports arbitrary language keys because `resolveLocalizedString` looks up by lower-case language key.

For “any 3 languages” support, the operational expectation is:
- Developers (or a release process) add the extra language entries into `src/web/systemStrings.json` when a new language is introduced.

Optional future enhancement (not required for phase 1):
- Allow a dashboard/config override for system strings so non-devs can update them without code changes.

---

## Backwards compatibility & migration

### Existing EN/FR/NL forms
- No changes required.
- EN remains canonical for option values (`__baseLang = en`).

### Adding a new language (example: ES + FR-CA + AR)
1) Dashboard (form config) set:
   - `languages: ["ES", "FR-CA", "AR"]`
   - `defaultLanguage: "FR-CA"`
   - `languageSelectorEnabled: true` (or false to force default)
2) In the config sheet:
   - Add/rename columns to `Question (ES)`, `Question (FR-CA)`, `Question (AR)`
   - Add/rename columns to `Options (ES)`, `Options (FR-CA)`, `Options (AR)` for CHOICE/CHECKBOX
3) In repo:
   - Add `es`, `fr-ca`, `ar` translations in `systemStrings.json` (only needed for system UI text).

**Important**
- Keep the canonical option language stable after rollout. If the canonical changes later, old stored values may no longer match indices.
- Phase 1 recommendation: if EN exists historically, keep EN as canonical even if not shown (or keep EN columns present but hidden).

---

## Action plan (phased)

### Phase 0 — clarify requirements (1–2 hours)
- Decide acceptable language code formats:
  - `EN`, `FR`, `NL`, `ES`, `FR-CA`, `AR` (BCP-47 recommended)
- Decide canonical option value strategy:
  - Keep EN canonical when present (recommended)
  - Otherwise use `defaultLanguage`

### Phase 1 — types & definition contract (0.5–1 day)
- Update shared types in `src/types/index.ts`:
  - widen `WebFormDefinition.languages` and `WebFormSubmission.language` to `string`
  - widen `WebQuestionDefinition.options` to support dynamic keys + `__baseLang`
- Update any server/client code that relies on `EN|FR|NL` unions.
- Update schema/docs as needed (`config_schema.yaml`, `SetupInstructions.md`) once implementation starts.

### Phase 2 — sheet parsing + validation (1–2 days)
- Implement header parsing for `Question (<lang>)` / `Options (<lang>)` in `ConfigSheet.ts`.
- Update `ConfigValidator.ts` to validate dynamic languages.
- Add/adjust unit tests covering:
  - custom language headers (`Question (ES)`, `Options (ES)`)
  - option-count mismatch errors across dynamic languages

### Phase 3 — UI/runtime option/value localization (1–2 days)
- Update `buildLocalizedOptions` to use `__baseLang` and emit dynamic `labels`.
- Update `valueDisplay.localizeOptionValue` and any other value mappers that assume `en/fr/nl`.
- Update `normalizeLanguage` helpers to stop forcing EN/FR/NL.

### Phase 4 — i18n fallback chain + Intl formatting (0.5–1 day)
- Update `resolveLocalizedString` to support `fr-be → fr → en` fallback.
- Replace hard-coded weekday/month arrays with `Intl.DateTimeFormat` (keep fallback for test environments).

### Phase 5 — rollout hardening (0.5–1 day)
- Update docs with “how to add a new language” steps.
- Ensure build outputs (`dist/Code.js`) compile.
- Add smoke tests for a form configured with non-EN/FR/NL language codes.

---

## Acceptance criteria
- A form configured with `languages: ["ES", "FR-CA", "AR"]` renders:
  - all question labels in each language
  - system UI strings in each language when provided in `systemStrings.json`
- Switching language does **not** change stored values for CHOICE/CHECKBOX fields.
- Existing EN/FR/NL forms behave identically to today.

---

## Open questions / decisions
- Should we support `disabledLanguages` in the dynamic world the same way (yes; filter after resolving effective languages)?
- Do we want a separate explicit config for `valueLanguage` / `canonicalLanguage` instead of implicit rules?
- Do we want a future “stable option IDs” mode to make canonical values language-independent?

