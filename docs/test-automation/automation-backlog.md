# Automation Backlog

This backlog converts `docs/test-automation/test_scripts.csv` into implementation-oriented automation scope.

## Confirmed execution assumptions

- staging URL source comes from the deployment script output
- staging uses a dedicated data set
- automation may create and delete records freely
- release-gating coverage runs in `Chromium`
- mobile execution must use the same device and throttling profile as the performance runner

## Phase 1

Foundation and release gate:

- add shared Playwright mobile profile aligned to performance automation
- add Playwright config and E2E helper layer
- add post-deploy staging smoke job
- add first smoke checks for:
  - app frame loads
  - home becomes ready
  - Apps Script transport is available
  - staging can return the Meal Production form config

## Phase 2

Broader regression expansion target:

- `1` order calculations and destructive-change dialogs
- `5` duplicate record detection
- `9` ready-for-production lock behavior
- `13` negative portions validation
- `14` cannot continue without ordered portions
- `32` recipes and ingredient receipt gating
- `33` food safety confirmation and upload requirements
- `34` delivered portions default
- `35` delivered portions minimum constraint
- `36` summary view content
- `37` final report content
- `38` future-dated restrictions
- `39` change production date deletes subsequent data
- `41` change service deletes subsequent data
- `2`, `3`, `6`, `10`, `11`, `12`, `18`, `19`, `20`, `21`, `22`, `23`, `31`, `40`, `42`

## Deferred to Phase 3

These remain blocked on stale or outdated business scripts:

- `4`, `7`, `8`, `15`, `16`, `17`, `24`, `25`, `27`, `29`, `30`, `43`
