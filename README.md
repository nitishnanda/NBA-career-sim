# NBA Career Simulator

Create a player, get scouted, pick a college, declare for the draft, and play out an NBA career with contracts, awards, playoffs and a Hall of Fame verdict. No build step, no dependencies: open `index.html`.

```
open index.html          # or serve the folder with any static server
node scripts/career.js dominator C 21 93 5   # simulate one full career in the terminal
```

## The loop

1. **Create**: name, position, archetype (+ optional secondary tag), home state (small attribute tilt by region)
2. **Scouting**: random 1-5★ (38 / 28 / 20 / 10 / 4 %). Stars nudge your hidden ceiling; the ceiling is never shown (scouts only show a fuzzy potential grade)
3. **College**: schools offered depend on your stars. Bigger programs = more draft hype, fewer shots; smaller schools = more usage. Home-state schools give a small role bump
4. **After each college year**: see your line, record, tournament result, honors, and a mock-draft range. **Declare or stay** (forced after year 4)
5. **Draft night**: real lottery odds, a ticker of picks, your name called (or not)
6. **NBA seasons**: 82 per-game box scores, awards, playoffs round by round, random season events
7. **Every offseason**: spend upgrade points, then see natural development/aging
8. **Contract decisions**: re-sign / test free agency (switch teams) when expiring; otherwise stay, demand a trade, or retire at any point
9. **Retirement**: career totals, awards, legacy score, Hall of Fame tier

## How stats stay realistic

Nothing is "rating → random ppg". Every line is built from a basketball identity:

```
points = usage% × (minutes / 48) × team pace × (1.82 × TS%)
```

- **Usage is capped** (~36%) and shrinks when teammates are stars, so 35+ ppg is effectively impossible and 30+ needs elite usage *and* efficiency
- **Season averages are the mean of the games**: per-game box scores share a "game script" factor (minutes/blowouts) so rebounds, assists and points move together. Triple-double counts are real counts
- **A real league**: 30 teams, NPC stars who age, retire and get replaced by draft classes. Awards, scoring titles and MVP odds come from competing against them. MVPs need 65+ games and mostly come off 50+ win teams
- **Draft slot only loosely predicts ceiling** (hidden ceiling rolled independently; late picks can become stars)

### Calibration

Calibrated against real Basketball-Reference data through 2025-26. See [CALIBRATION.md](CALIBRATION.md) for the full real-vs-sim report, what changed and the known gaps. Highlights:

| Metric | Real (2016-26) | Sim |
|---|---|---|
| Players at 25+ / 28+ / 30+ ppg per season | 11.3 / 4.1 / 2.1 | 11.2 / 4.6 / 1.9 |
| Top scorer / mean of top 5 | 32.6 / 29.6 | 31.8 / 29.6 |
| Star minutes / usage / TS% | 34.8 / 30.7% / 61% | 35.1 / 30.5% / 61% |
| Team wins: sd, year-to-year change | 12.5, 8.5 | 12.4, 9.0 |
| Top-3 pick lifts team wins (yr 1 / yr 2) | +8.3 / +13.7 | +6.7 / +11.9 |
| MVP age, wins, ppg, usage | 26.5, 60, 27.3, 31.7% | 26.6, 57, 28.4, 33.0% |
| Players who ever hit 30 ppg: avg 30+ seasons, share reaching 32+ / 34+ | 2.35, 52% / 13% | 2.5, 58% / 18% (elite scorers) |
| P(All-Star) by draft slot (#1 / #4-5 / #11-14 / #21-30) | 73 / 35 / 9 / 5% | 80 / 42 / 11 / 4% |

Triple-double seasons (real: Westbrook 28-32, Jokic 29-30, Oscar 23) are planned per career in a contiguous late-20s window; the season CSVs have no game logs, so per-game TD rates still come from known career figures, not the files.

## Real league (as of 20 Oct 2026)

The league starts from the real 2026-27 preseason: rosters, the 2026 draft class (Dybantsa, Peterson, Boozer...) and approximate ratings (`src/real.js`, built from preseason reporting, so some depth-chart details may be off). Everyone around your player after that is simulated, with generated names for future draft classes.

## Career-shape rules

- **Consistent scorers** carry 1-3 real injury seasons, get a 32-33 ppg year (~90% of elites) and rarely a 34-36 ppg year (~15-20%). Everyday seasons are soft-capped near 30
- **Box-score dominators** follow the Westbrook/Jokic path: no triple-double hints early, then one contiguous run of 1-5 seasons starting around 26-30
- **Generational talents** (primary or secondary) are almost always 4-5★ and top-3 picks, except an ~8% "Jokic path"
- Finals MVP goes to the best Finals line on the winning team
- Young players never lose rating from noise, and aging is gentler (about -0.5 at 30, -1.6 at 33, -3 at 36+)
- A star helps a bad team gradually: a #1 pick adds ~4 wins in year one, ~8 in year two
- Salaries: cap grows 1.5%/yr; a journeyman earns ~$100M over a career, a Hall of Famer ~$650M

## Archetypes

Generational Talent · Consistent Scorer · Two-Way Demon · Defensive Anchor · Lethal Shooter · Box-Score Dominator (from the MVP spec). A secondary tag blends 40% of another archetype's attributes into yours.

## Layout

```
index.html, style.css
src/data.js     teams, colleges, archetypes, positions
src/engine.js   ratings, progression, stat model, per-game box scores
src/league.js   30-team league, wins, playoffs, awards, lottery, draft
src/game.js     your career: college, contracts, seasons, TD logic, HOF
src/ui.js       the interface
scripts/        calibration + test harnesses (Node) and a Playwright UI test
EXAMPLES.md     simulated careers produced by the engine
```

## Known simplifications

- All-NBA teams are positionless; no 6th Man award
- NPC rosters are modelled as each team's four core players; depth is a per-team random term
- Contracts: rookie scale, market value by OVR, max by service years (25/30/35% of the cap), 4.5%/yr cap growth. No luxury tax, trade-value logic or player options
- Numbers in the spec were written from memory; targets above were tuned to those, not recomputed from Basketball-Reference
