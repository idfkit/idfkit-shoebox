# Phase 0: research

**Feature**: Choose what a sweep plots | **Branch**: `004-choose-sweep-metric`

Every decision below is grounded in the working tree rather than in recollection,
and the two that turn on cost were measured rather than argued. The spec left no
`NEEDS CLARIFICATION` markers. The 2026-09-03 clarification superseded the
earlier per-study quantity design with one desk-wide choice. What follows resolves
the technical unknowns created by the complete clarification record.

## Measurements

Both were taken on this repository, EnergyPlus 26.1.0 installed locally, Chicago
TMY3, an annual run with System, Gains and Air engaged and sizing periods off.
Harnesses were throwaway, per the constitution's workflow section.

### M1: what a wide reporting profile costs

Three interleaved passes, median wall clock, and the ESO each profile produced.

| profile | median ms | ESO bytes |
|---|---|---|
| `extremes` (1 series) | 428 | 465 KB |
| `energy` (1 series, 4 monthly meters) | 417 | 469 KB |
| `tm59` (3 series) | 446 | 733 KB |
| union of all three | 432 | 737 KB |
| union plus AllSummary tabular | 470 | 737 KB |
| `sheet` (the full apparatus) | 495 | 2.69 MB |

The union of today's three lean profiles is free: 432 ms sits inside the 417 to
446 ms spread of the profiles it contains. The engine does not notice three
hourly series and four monthly meters. `sheet` costs about 70 ms more, and the
tabular apparatus alone about 38 ms.

### M2: what reading costs, and where the real bill is

Median of five, on the ESOs M1 produced.

| ESO | size | `parseESO` | every reader together |
|---|---|---|---|
| lean (`extremes`) | 454 KB | 7.6 ms | 1.8 ms |
| full (`sheet`) | 2.62 MB | 45.8 ms | 2.6 ms |

Individual readers: `readExtremes` 1.2 ms, `readPeaks` 0.8 ms,
`readOverheat` 0.4 ms, `readDemand` 0.2 ms.

### M3: what overlay geometry costs

`geometryFacts()` was measured while a real `width` sweep overlay was applied
to the shared document. After five warm-up passes, 440 calls had a median of
0.012 ms and a 95th percentile of 0.030 ms. The result is two orders of
magnitude below the 2.6 ms upper land-time reader budget, so measuring gross
floor area unconditionally while the overlay is present does not change the
architecture chosen from M2.

### M4: all declared reporting profiles

The final declarations were run once each as isolated Chicago annual processes,
with five warm extraction passes over each parsed ESO. Engine wall time ranged
from 440 to 656 ms, median 485 ms; the isolated-process measurement includes
startup and was noisier than M1's interleaved passes. The output itself remained
lean: 476 to 745 KB rather than the full sheet's 2.69 MB. Parse time had an
8.44 ms median and ranged from 5.89 to 11.44 ms.

Land-time extraction had a 1.34 ms median. The largest warm median was 3.64 ms
for TM59-a because its carried contents answer all three TM59 quantities, so
land time runs criteria a, b, and c together. That result agrees with the
existing measurement in `src/tm59.js`, which records 4.8 ms for the five
criterion/category readings. M2's 2.6 ms ceiling did not include that complete
answerable set. The accepted ceiling is therefore 5.0 ms for TM59 contents and
2.6 ms for the other profiles; the work remains about one per cent of a 442 ms
sample and avoids retaining or reparsing the 745 KB ESO.

### M5: matched interleaved profile cost

Every final profile was alternated five times with the same one-series annual
baseline on one fully engaged Chicago desk. Native process startup was measured
separately at 83.7 ms and removed from both sides; ESO parsing was timed after
the run. Byte-identical reporting inputs were retained as variance controls and
treated as structural zero-addition evidence rather than as timing differences.
Among genuinely different profiles, TM59-c was the worst median at 6.3 % above
its paired baseline, inside the 417 to 446 ms spread measured for the original
lean profiles. No reporting profile crossed the 10 % paired noise ceiling.

**M2 is the measurement that decides the architecture, and it points the opposite
way from where the argument started.** The cost of a wide run is not the engine,
it is the parse, and the parse is on the main thread. Six times the ESO is six
times the parse: 45.8 ms against 7.6 ms per sample, which over a 21-sample sweep
is 0.96 s against 0.16 s of main-thread work competing with the live desk's own
50 ms budget. Reading every quantity instead of one, by contrast, costs 1 to 2 ms
per sample, under half a per cent.

## Decisions

### D1: reuse is decided by what a run carries, never by who asked for it

**Decision.** A finished sample answers a quantity when the run's contents are a
superset of what that quantity declared it needs. Changing the desk quantity
re-runs only the samples that fall short across all open studies.

**Rationale.** It is what FR-003 already promised, and M2 makes it nearly free.
The alternative that would have made every switch instant, running every sample
under a union profile, is exactly what M2 rules out.

**Alternatives considered.** Reuse only on an exact profile match (simpler, but
fails at the first pair of quantities that share a run written under different
names, which `tm59a` and `tm59b` already are). A union profile for every sweep
(rejected on M2: it converges on `sheet` as the roster grows, and the roster is
defined by a rule rather than a list). Keeping today's behaviour, in which the
metric is part of the sample's identity (rejected by the reader, and the origin
of the request).

**Consequence.** Sample identity is the desk shape, run kind and canonical
`RunContents` carried by the finished run. That exact key distinguishes samples
with different contents, but an ordinary exact `Map` lookup cannot discover a
compatible superset. The cache therefore also indexes samples by desk shape and
run kind. A quantity lookup filters that bucket with
`carried.answers(quantity.needs)`, prefers the candidate with the fewest carried
items beyond the requested needs, and breaks ties by canonical `RunContents`
serialisation. This compatible lookup, not the exact key alone, provides the
subset reuse required by FR-003, FR-004a and FR-013.

### D2: a sample keeps numbers, not the run

**Decision.** When a sample lands, read every quantity the run can answer and
cache that bag alongside the record of what the run carried. Discard the run.

**Rationale.** M2: the readers cost 1.8 to 2.6 ms all together. Retaining parsed
runs instead would put megabytes per sample beside a pool of engine instances on
a 256 MB starting heap, and would force the 400-entry cache bound
(`src/scheduler.js:101`) to be rethought. Keeping numbers leaves that bound, and
the station-change clear that goes with it, exactly as they are.

**Alternatives considered.** Retain the parsed ESO and read lazily (flexible,
but the memory arithmetic is not close). Retain the raw ESO text and re-parse per
switch (7.6 to 45.8 ms per sample per switch, for no benefit over reading once).

**Consequence, and it is the one that bites.** Every reader must be callable at
the moment a sample lands. Two are not, today: `buildSample` measures
`floorArea` only when the metric is `energy` (`src/main.js:6596`) and
`contextFor` returns `null` unless the metric is `tm59a`
(`src/main.js:6665-6675`). Both become unconditional, and every context a reader
needs must be a fact about the station and the desk rather than about the study,
which is FR-018. Checked against the inventory: `floorArea` is off the overlay
document, `trm` is off the EPW, `floor` is `occupiedFloor(snapshot)`, the rate
card is off the station and `params`, and the overheat threshold is a constant of
the target. Reading all answerable quantities satisfies FR-017; resolving none
of their context from the asking study makes the land-time read satisfy FR-018.

The reader input is not ESO alone. Cost, carbon and EUI use the same normalized
building meter totals and run metadata as the existing bill. `readPoint` therefore
constructs one typed, short-lived landed-run view containing the parsed ESO,
meter totals, environments, hours, months and run kind. Every answerable quantity
reads from that view, after which both it and the raw engine result are discarded;
the cache still keeps only numbers.

### D3: the reporting profile becomes a declared contents set

**Decision.** `syncReporting` stops taking one of four profile names and starts
taking the set of run contents a sample needs. Each `Quantity` declares its
contents; a sample is written with the union of what its own quantity needs. The
`'sheet'` profile stays as the named case it is, because the sheet's own solve
wants everything and says so.

**Rationale.** D1 needs to compare what a run carries against what a quantity
needs, and it cannot do that against an opaque string. It is also what makes
SC-008 true: a quantity added later declares its contents and becomes offerable
with no change to the study machinery. `'tm59a'` reading off a profile named
`'tm59'` (`src/study.js:206`) is today's evidence that id and profile are already
two different things wearing one name.

**Alternatives considered.** Keeping the four names and adding a hand-written
table of which name answers which metric (a second place to teach, and the exact
failure `src/study.js:228-242` already throws about). Adding a fifth and sixth
named profile per quantity (multiplies the names without making the subset test
possible).

**Consequence.** `syncReporting` still clears `REPORTING_TYPES` and rewrites, so
the byte-identical restore that the sweep depends on is preserved, but the
contents must be written in a declared canonical order or the serialisation will
differ between two runs carrying the same set. That is a real hazard on this
codebase, where merely asking whether a type is present reorders the file
(`src/model.js`, "Reading an absent type registers it"), and it is asserted
rather than assumed.

### D4: a study remains identified by its control

**Decision.** Keep `studies`, `studyStops`, the scheduler's `byKey`, and the
console's `rows`, `cards` and `studyButtons` keyed only by the swept control.
Keep one study per control. Store the chosen quantity once for the desk, outside
every study identity.

**Rationale.** FR-001 and FR-004 make the quantity one desk-wide choice, while
FR-003 requires changing it without losing a study. The current control key is
already enforced at three points: `studies.set(key, study)` overwrites
(`src/main.js:7044`), the console's `setStudy` removes the prior node for that
key (`src/console.js:2230-2231`), and the scheduler supersedes an existing job
for a key (`src/scheduler.js:298-300`). Those structures already express the
required identity.

**Alternatives considered.** Keying a study by control and quantity, which would
allow several quantities for one control, was the superseded 2026-09-02 design.
It conflicts with a desk-wide choice and makes a quantity change replace studies
instead of mutating the one shared choice.

**Consequence.** The desk quantity initializes exactly once, when the first study
of the session starts, from the legacy inference. Later studies read that frozen
choice. Moving the desk, starting another study, and clearing every study do not
re-infer or reset it. Only the reader explicitly choosing another quantity may
mutate it (FR-005 and FR-011).

### D5: the link carries one desk quantity and its open controls

**Decision.** Add `sty=` to `RESERVED` with one single-value grammar:
`sty=<quantityId>[.<controlKey>[,<controlKey>]*]`. The quantity appears once;
each open study contributes only its control key.

**Rationale.** The bump rule is stated in the code (`src/permalink.js:25-34`) and
names three triggers: changing a default, renaming a key, narrowing a range. A
new reserved key does none of them. An old link omits it and keeps its unchanged
behaviour: no initialized desk quantity and no open studies. `LINK_VERSION` stays
`v1` and `MIGRATIONS` stays empty.

**Alternatives considered.** Repeating control and quantity pairs encodes the
same desk-wide choice several times and permits disagreement the model forbids.
A desk-wide quantity without study controls makes a shared desk arrive without
the curves the sender was reading. Deferring the link entirely was considered
and reversed during clarification.

**Consequence.** Omit `sty` only when the quantity has never initialized and no
studies exist. After initialization, clearing every study preserves the frozen
choice as `sty=<quantityId>`. Open controls follow the quantity after a full stop
and appear in control declaration order. Unknown quantities or controls,
unsweepable controls, duplicate controls, malformed separators and a duplicate
`sty` refuse the whole link (FR-022 through FR-024). A decoded quantity that the
current desk cannot answer remains an offer with its reason and fix (FR-009).

### D6: the roster exposes 13 outcomes through 11 choices

**Decision.** The initial roster contains the 13 aggregate whole-run outcomes
settled in clarification, with high/low temperature and TEDI/CEDI thermal demand
as the only paired views, for 11 chooser rows. Each is admitted by one `Quantity`
declaration, as FR-007 requires, and the vocabulary is the one the sheet already
uses.

Offerable and shipped: `extremes` (paired high and low), `demand` (paired TEDI and CEDI), `eui`, `cost`,
`carbon` (meters); `overheat`; `peakHeat`, `peakCool`; `tm59a`, `tm59b`, `tm59c`.
Criteria a and b use the existing `TM59_STUDY_CATEGORY`, Category II; criterion c
has one fixed threshold and no category.

**Rationale.** `Target.metric` in `src/schemes.js` already names `tedi`, `cedi`,
`eui`, `overheat`, `peakHeat`, `peakCool`, `tm59a`, `tm59b`, `tm59c`, and the
shelf's `Measure` adds `low`, `high`, `cost` and `carbon`. Taking that vocabulary
rather than minting a second one is the same argument
`schemes.js` already makes at module load about `TM59_SPACES` against
`PROFILE_IDS`: two lists for one vocabulary is a disagreement waiting to happen,
so the roster asserts the target vocabulary at load and declares the four
non-target outcomes beside it.

**Excluded, and why, so a later reader does not think they were missed.** Per
environment rather than per run: the schedule's zone and outdoor swing, damping,
thermal lag, hours simulated, and the per-environment TEDI and CEDI columns.
Channel-local diagnostics: the glazing readout's U-factor, SHGC and VT, and the
airflow network's air-change rate and hours open. Series or pin-dependent: every
`Output:Variable` the plate draws, `meterMonths`, and the balance rail's terms.
Intermediate rather than the normalized comparison the roster carries: the
bill's unnormalised `metered` total. Not a number: `Coverage`, `RunningMean`, the
qualification sentences, `Bill.byFuel`, `Bill.ranked`, `Bill.divergence`, the
per-end-use bill lines, and every stamp and pin. Unmet hours are excluded because
the sheet does not compute them at all, which the spec already records.

**Alternative considered.** Admitting every numeric readout would add the five
channel-local glazing and airflow readings and the bill's unnormalised total,
then force the roster to define whether pin-dependent balance terms are one
number per run. That wider scope was rejected in clarification. A later aggregate
outcome still needs only one declaration; the study machinery remains unchanged.

### D7: a partial roster is not a shortened list

**Decision.** Every quantity in the roster stands in the offer on every desk.
One the current run cannot answer is greyed, unselectable, and carries its reason
and its fix in place of a value.

**Rationale.** FR-009, settled in clarification. It is also the design system's
existing "a refusal that carries its next step" pattern, whose three parts are
what was refused, why specifically, and where to go instead as targets rather
than advice. The desk already keeps this rule for the hour picker, which refuses
an instant with its reason in place of its stamp rather than falling back to a
neighbour.

**Consequence.** The reasons are not free text written at the call site. Each
quantity declares what it needs of a run, and the sentence is composed from the
gap between that and what the desk can currently produce, so a quantity added
later gets a reason without anyone writing one.

### D8: no new module

**Decision.** The roster lives in `src/study.js` beside the sampling rules.

**Rationale.** `study.js` already holds "what one sample of one study is read
for" and is already DOM-free, which is why the Node harnesses can call the real
readers. Whether a control can be swept at all is decided a few lines away in
`samplePoints` (`src/study.js:98-107`), and separating the roster from that would
put two halves of one question in two files.

**Alternative considered.** A `src/quantities.js`. Rejected: it buys nothing but
an import, and this codebase's stated preference is that a thing is declared
once, in the module that owns the concern.

### D9: a waiting card never mislabels an old curve

**Decision.** A desk quantity change redraws every compatible cached curve
immediately. A study missing compatible samples enters an explicit waiting state
before the card presents the new quantity. The previous curve may remain only if
the card still names its previous quantity and visibly marks it as waiting for
the new one; otherwise the card shows no curve and an explicit waiting state.

**Rationale.** Relabelling an old curve with the new quantity is the silent
substitution this feature removes. Clearing the curve without explanation makes
the study look lost. FR-004b requires the waiting state to distinguish both.

**Consequence.** With auto-solve on, missing samples enter the existing
coarse-first refresh path. With auto-solve off, the quantity change starts no
run; the explicit waiting state remains until the reader enables solving or the
cache can answer the quantity.

### D10: price-only changes rederive three readings from meter totals

**Decision.** A sample retains the small physical meter basis used by the
existing bill, in addition to its quantity readings. Plant or Tariff changes
rederive EUI, cost and carbon from that basis and the current pricing context,
then redraw the open cards without scheduling a sample.

**Rationale.** `deskKey` deliberately removes `PRICED_KEYS` because those
controls reach no IDF object. If the cache kept only the EUI, cost and carbon
calculated when a sample landed, changing boiler efficiency, COP, tariff or grid
factor would leave those curves stale. Adding priced keys to sample identity
would be worse: it would run EnergyPlus again for a change the engine cannot see.

**Alternative considered.** Invalidate the three readings on every price change.
Rejected because the physical meter totals are still valid and the sheet already
reprices its bill from them without a run. Retaining those few numbers preserves
the existing 400-entry cache bound while extending the same rule to studies.

### D11: weather invalidates samples, not the reader's question

**Decision.** A successful station attachment clears study jobs and cached sample
facts, then keeps every control-keyed study as an explicit waiting card. The
console snapshots and restores the open strip, open quantity chooser, focus and
viewport anchor, and every partial or completed card rebuild preserves them.

**Rationale.** The unavailable offer itself sends the reader to the weather
picker. Deleting that study after they follow its instruction makes the fix erase
the question it fixes. The outgoing curve still cannot survive: it describes a
different climate. Retaining identity while clearing facts preserves both truths.

## Resolved: does the onboarding need updating?

FR-021 requires the general notes to be updated wherever this feature changes
what a step teaches or renames a control a step names. Checked against
`src/tour.js:64-158`: there are seven notes, covering the first solve, dragging a
dimension, attaching weather, opening the desk, patching a channel, the TM59
board and carrying the scheme away. **None mentions a study, a sweep, a curve or
a metric.** Nothing this feature does makes any of them stale, no control they
name is renamed, and no step's subject moves. So `NOTES` is unchanged and the
storage key `shoebox-general-notes-v3` does not move.

That is recorded here rather than left silent, because an unchanged onboarding is
indistinguishable from a forgotten one, and the constitution makes the notes part
of done.
