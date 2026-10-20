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

### Calibration (run `npm run league`, `npm run scoring`, `npm run elite`, `npm run batch`)

| Target | Result |
|---|---|
| 30+ ppg scorers per season | ~1.5-2.5 (spec: 2-5) |
| 25+ ppg scorers | ~10-13 (spec: 8-12) |
| Top scorer | ~30-32 |
| 35+ ppg seasons | ~1 in 2,000 player-seasons (a "Harden once" event) |
| Elite scorer career | ~26-28 ppg, a few 30+ seasons, none at 35 |
| Box-score dominator TD rate | 19-27% of games (mean ~23%) |
| Dominator seasons averaging a triple-double | 1-5 (mean ~2.7), ~1.3 of them at 30+ ppg |
| 36+ ppg triple-double postseasons | 0-2 per elite dominator ("legend runs") |
| MVP age / team wins | mean ~27.5 / median ~58 |
| Rookies | top-5 picks ~14 ppg; elite scorers ~20 from year 1 |
| Aging | +5 at 19-20, ~0 at 28-29, about -1/yr at 30-32, -2 to -4 at 33-35 |

Dominators' triple-double seasons are guaranteed by a hidden per-career plan (`tdPlan`, `td30Plan`, `legendPlan`) that only fires for genuinely elite players in their prime; a rate guard pulls the career TD% back into the 17-27% band if it runs hot.

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
