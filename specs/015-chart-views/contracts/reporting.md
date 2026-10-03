# Contract: output variables added to the sheet profile

**Owner**: `syncReporting` in `src/model.js`.
**Requirements**: FR-006, FR-007, FR-008, SC-002.

## 1. Additions

| Variable | Frequency | Key | Condition | Engine unit | Read as |
|----------|-----------|-----|-----------|-------------|---------|
| `Site Outdoor Air Humidity Ratio` | Hourly | `*` | every `'sheet'` run | kgWater/kgDryAir | `wOut`, g/kg |
| `Zone Mean Air Humidity Ratio` | Hourly | `*` | every `'sheet'` run | kgWater/kgDryAir | `wZone`, g/kg |
| `Zone Ideal Loads Supply Air Total Heating Energy` | Daily | `*` | the document holds `ZoneHVAC:IdealLoadsAirSystem` | J | `heat`, kWh |
| `Zone Ideal Loads Supply Air Total Cooling Energy` | Daily | `*` | as above | J | `cool`, kWh |

All four names were confirmed in an EnergyPlus 26.1.0 `.rdd`:

- the two humidity series in
  `.harness/out/baseline-014-shipped-wwrS-0.60-dd/`;
- the two energy series in
  `.harness/out/baseline-014-serviced-wwrS-0.05-dd/`.

The implementation re-confirms the names against a fresh `.rdd`, and greps
`eplusout.err` for "requested but not generated". Re-confirmed on
2026-09-29 (T004) in `.harness/out/015-rdd-default/` and
`.harness/out/015-rdd-system/`; no name differed.

## 2. Rules

1. **Where the humidity series go.** They join `VARIABLES_HOURLY`. The
   `base` set that deduplicates rail terms includes them automatically.
2. **How the demand gate is asked.** It is asked of the document with
   `holds(doc, 'ZoneHVAC:IdealLoadsAirSystem') && doc.all(...).size`,
   following the AFN gate beside it. A System channel that is bypassed or
   blocked by its own `requires` therefore requests nothing.
3. **Only the sheet profile changes.** `'extremes'`, `'energy'`, `'tm59'` and
   `RunContents` are unchanged, so studies and surveys pay nothing.
4. **Idempotence.** `applyModel` applied three times gives byte-identical
   IDF. "Lean then sheet" equals "always sheet".
5. **No per-surface key.** Every added series resolves to one site-level or
   one zone-level series (FR-008).

## 3. Reconciliation

Over a year run with System in the path, these must hold:

- the sum of `heat` equals the run total of `Heating:DistrictHeatingWater`;
- the sum of `cool` equals the run total of `Cooling:DistrictCooling`;

each to within 1e-6 relative. This is the harness form of FR-017 and of
User Story 7 scenario 1.

## 4. Cost budget

The median annual solve time, measured interleaved A/B with 10 pairs and one
engine per process, rises by no more than 5 % (SC-002). There are two
conditions:

1. the default desk, which has the humidity series only;
2. a desk with System in the path, which has all four series.
