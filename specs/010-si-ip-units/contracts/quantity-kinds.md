# Contract: the quantity kinds

The roster `units.js` declares, and the only vocabulary any lettering site may use. A figure on the sheet belongs to exactly one kind. Adding a kind means adding a row here and to `KINDS`; a lettering site naming a kind that is not in the roster throws at module load.

## The four exact constants

Every factor is an expression of these, never a decimal literal, so a reader can check the arithmetic.

```text
FT  = 0.3048          metres in a foot, exact by definition
BTU = 1055.05585262   joules in an International Table Btu
LB  = 453.59237       grams in a pound, exact by definition
DEG = 9 / 5           degrees Fahrenheit in a kelvin, exact by definition
```

`DEG` is the fourth because the rule above had an exception in its own rows until
convergence closed it. The three temperature kinds, and the two that carry a
kelvin in a denominator, were written with a bare `1.8`; `lengthMm` was written
with a bare `1 / 25.4`. Both are true constants and neither is a declared one,
which is the whole of the objection: the rule is that a reader checks the
arithmetic rather than recognising a figure. They are now `DEG` and
`12 / (FT × 1000)`, the same doubles to the bit.

## Converting kinds

`factor` is IP per SI. `offset` is added after scaling and is zero unless shown. "Digits" is the kind's own precision, used for a reading; a control derives its own from its step through `precisionFor` (see [data-model.md](./data-model.md)).

| id | SI | IP | factor | digits | Where it is lettered |
| --- | --- | --- | --- | --- | --- |
| `length` | m | ft | `1 / FT` | 1 | Building dimensions, overhangs, fins, neighbours, curb, daylight reference height |
| `lengthSmall` | m | in | `12 / FT` | 1 | Glazing cavity and frame width, slat width, slab and mass thickness |
| `area` | m² | ft² | `1 / FT²` | 0 | Floor, envelope and glazing areas |
| `volume` | m³ | ft³ | `1 / FT³` | 0 | Zone volume in the quantities panel |
| `areaPerPerson` | m²/pp | ft²/person | `1 / FT²` | 0 | Occupant density |
| `inverseLength` | m⁻¹ | ft⁻¹ | `FT` | 3 | Compactness, envelope area over volume. Added to this table for the reason `distance` was: the quantities panel letters it, so under FR-007 it needs a row. Its factor is `FT` and not `1 / FT`, being a reciprocal |
| `temperature` | °C | °F | `DEG`, offset `32` | 0 | Setpoints, design day and climate temperatures, the pinned hour |
| `temperatureDifference` | K | Δ°F | `DEG` | 0 | Deadbands, setback, venting deltas, solver tolerance |
| `temperatureSwing` | °C | Δ°F | `DEG` | 1 | A swing or range, which the schedules letter `°C` and not `K`. A difference, so no offset: through `temperature` a 5 °C swing would read 41 °F instead of 9 |
| `lengthMm` | mm | in | `12 / (FT × 1000)` | 1 | The description's slab, where the sentence letters millimetres rather than metres |
| `transmittance` | W/m²K | Btu/h·ft²·°F | `(3600 × FT²) / (BTU × DEG)` | 2 | Glazing and frame U-factors |
| `resistance` | m²K/W | h·ft²·°F/Btu | `(BTU × DEG) / (3600 × FT²)` | 1 | Wall and roof resistance. Prefix `R-`, no trailing unit |
| `powerDensity` | W/m² | W/ft² | `FT²` | 2 | Lighting and equipment density |
| `fluxDensity` | W/m² | Btu/h·ft² | `(FT² × 3600) / BTU` | 1 | Solar and radiant flux |
| `power` | kW | kBtu/h | `3600 / BTU` | 1 | Peak heating and cooling loads |
| `heatPerPerson` | W/pp | Btu/h·pp | `3600 / BTU` | 0 | Metabolic rate |
| `airflow` | L/s | cfm | `60 / (FT³ × 1000)` | 0 | Computed ventilation rates |
| `airflowPerPerson` | L/s·pp | cfm/person | `60 / (FT³ × 1000)` | 0 | Outdoor air. Its own kind, because the SI string it must reproduce is `L/s·pp` and not `L/s` |
| `speed` | m/s | mph | `3600 / (FT × 5280)` | 0 | Wind bounds |
| `energy` | kWh | kBtu | `3600 / BTU` | 0 | Demands and loads. MWh letters as MBtu above a thousand |
| `energyIntensity` | kWh/m²·yr | kBtu/ft²·yr | `(3600 × FT²) / BTU` | 1 | The bill's per-area intensity, the scoreboard's targets, the shelf |
| `energyIntensityPeriod` | kWh/m² | kBtu/ft² | `(3600 × FT²) / BTU` | 1 | TEDI and CEDI over one environment's own months, which the schedules letter without the `·yr` |
| `illuminance` | lx | fc | `FT²` | 0 | The daylight setpoint |
| `distance` | km | mi | `1000 / (FT × 5280)` | 0 | How far the picker's station is. Added to this table because the spec's Units table names no geographic distance, and FR-007 forbids a kind appearing in IP without a row |
| `carbonIntensity` | gCO₂e/kWh | lb/MWh | `1000 / LB` | 0 | The grid factor |

## Identity kinds

Declared, not omitted, so that "does not convert" is a statement rather than a silence.

| id | Unit | Why it does not convert |
| --- | --- | --- |
| `ratio` | none | A fraction is a fraction. Window ratio, absorptance, emissivity, efficiency, effectiveness, tolerance |
| `airChanges` | ACH | Defined per hour in both systems, and quoted as ACH50 in US practice too |
| `pressure` | Pa | Airtightness is quoted at 50 Pa in US practice (ACH50, CFM50). Spec assumption |
| `angle` | ° | Degrees in both |
| `people` | pp | A person is a person |
| `days` | days | |
| `factorOf` | × | The zone multiplier, and the skylight count |
| `floorMultiple` | × floor | Internal mass as a multiple of floor area |
| `appliancePower` | W | An electrical rating, quoted in watts in both systems |
| `money` | /kWh | Rates are per kWh at the meter, in the tariff's own currency. Spec assumption |
| `degreeDays` | HDD18, CDD10 | The base temperature is part of the published statistic. Converting the count while the label keeps saying 18 would be unverifiable arithmetic, and relabelling would claim a statistic this page did not compute (research R11). The reading states that the base is Celsius. **The unit column here is for the reader, not for the kind**: `HDD18` and `CDD10` are two strings for one quantity and the reading letters both in one line, where a kind holds one SI string and one IP string. So this kind carries two empty strings and the wording is composed at the lettering site, in `weather.js`, which imports no kind at all. The row exists to state that the count does not convert, and holding the strings here would mean a kind per base temperature |
| `count` | none | A count of hours, nights or panes is the same count in both systems. The overheating criteria and the pane count. Where the declaration carries its own wording — TM59's hours against its nights — it passes that wording to `letter`, which is refused on a converting kind |
| `billedEnergy` | kWh | A US utility bills electricity in kWh and the rate tables are per kWh (spec assumption). Deliberately not `energy`, which converts: a demand read off the meters is a quantity of heat, a line on a bill is what somebody is charged for |
| `currency` | local currency | Money stays in the tariff's own currency (spec assumption). The declaration letters a placeholder the offer replaces with the actual code |
| `carbonMass` | kgCO₂e | The Units table names carbon *intensity* and not a mass of it, and the rate tables this sheet bills from publish neither in pounds. Converting would claim a figure they do not carry |
| `unconverted` | none | The quantity is settled by another control: the blind's setpoint is W/m² on the glass **or** °C depending on what it watches, so no one kind can convert it, and the note beside it already carries both units |

## Lettering rules

- **Unit strings carry no whitespace.** `copy.js` counts whitespace tokens and throws at load for the asserted budgets (research R6). `Δ°F`, not `°F difference`; `Btu/h·pp`, not `Btu/h per person`.
- **A prefix replaces the trailing unit.** `resistance` letters `R-20`, never `R-20 h·ft²·°F/Btu` and never `20 h·ft²·°F/Btu`.
- **A zero word beats both systems.** A control at a `zero` stop letters `None`, `Sealed`, `Dark`, `Empty`, `Solid`, `Flush`, `At head`, `At jamb` or `Shut` in SI and in IP alike.
- **Missing stays an em dash**, in both systems, and out of every total.
- **A converted figure never claims more resolution than it has.** A control's precision comes from its own step; a reading's comes from its kind.
- **Nothing in a note or a citation converts.** A published figure is quoted as published (FR-010).

## Typed entry

For a box of kind `k` lettering in system `s`, these are accepted and mean the same value:

| Typed | Read as |
| --- | --- |
| `60` | 60 in the system showing |
| `60 ft`, `60ft` | 60 feet, in either system |
| `18.29 m`, `18.29m` | 18.29 metres, in either system |
| `R-20`, `r-20`, `20` in an IP resistance box | R-20 |
| `None` (the box's own zero word) | The zero stop |
| `60 kg`, `abc`, `12abc` | Refused whole; the box puts the model's value back |

Whatever a box letters, a reader can select it, retype it unchanged, and get the same value back. That is the rule the `R-` prefix has to satisfy, and it is why both systems' suffixes are accepted whichever one is showing.
