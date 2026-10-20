# Calibration report: sim vs real NBA data

The engine is calibrated against real Basketball-Reference data (through the 2025-26 season), not memory.

- **Data:** `sumitrodatta/bball-reference-datasets` (public GitHub repo, a Basketball-Reference scrape). Clone it next to this project.
- **Targets:** `python3 scripts/real-targets.py [path/to/Data]` computes everything below and writes `data/real-targets.json`.
- **Comparison:** `node scripts/real-compare.js 80 3` simulates 3 leagues x 80 seasons and prints real vs sim. `node scripts/ovr-equalize.js` checks that equal overall ratings give equal production across archetypes.
- **"perf"** is one production number used for both: `pts*(1+2.2*(TS%-0.57)) + 1.15*reb + 1.5*ast + 2*(stl+blk) - 1.1*tov`.

## What the real data changed

| Finding in the real data | What I had before | Change |
|---|---|---|
| Players aged 30+ lose scoring volume earlier than ratings suggest (25-ppg scorers: 25.0 at 28, 22.6 at 30, 20.1 at 34, 16.4 at 36) but ratings/production decline *flattens* after 33 | Scorers held 26+ ppg to 34; rating decline too steep at 34-36 | Age-based usage taper from 29; gentler rating decline from 31 |
| Only 5 seasons of 34+ ppg since 1980 (Jordan x2, Harden x2, Kobe); players who ever hit 30 average 2.35 such seasons, 52% reach 32+, 13% reach 34+ | Elite scorers had 4-6 thirty-point seasons | Planned 32-33 year (62% of elite scorers), rare 34-36 year (~12%), softer everyday cap |
| 7 triple-double seasons in history: Westbrook ages 28-32 (x4), Jokic 29-30 (x2), Oscar 23 | Window from 26; early assists capped too hard | Window starts 26-30 and rolls forward until the first one; early cap relaxed |
| Team wins: sd 12.5, year-to-year change 8.5, 5% of teams win 60+, 13% win <25; top-3 picks add +8 wins in year 1, +14 in year 2 | sd 8.7, change 4.8, almost no 60+ or sub-25 teams | Wider team spread and noise, tail shaping, weaker roster continuity, young-player impact |
| Production changes year to year with sd 4.8 perf | sd 2-3 | Shared season-level form shock |
| Stars play 80% of games (35 mpg, 30.7% usage, 61% TS) | 88% games, 36 mpg, 59% TS | More injuries and rest, minutes cap, TS tuned |
| P(All-Star) by draft slot: #1 73%, #2-3 48%, #4-5 35%, #6-10 20%, #11-14 9%, #15-20 9%, #21-30 5%, #31-45 3%, #46-60 2% | #1 95%, later picks ~0% | Noisier scouting with occasional big misses (sleepers) |
| Rookie lines by pick (#1: 16.7 ppg / 30.9 mpg ... #15-30: 6.7 / 18.0) | Lottery rookies 15% too good | Rookie minutes floors by slot |
| MVPs: age 26.5, 60 wins, 27.3 ppg, 31.7% usage; 27 distinct winners in 46 seasons; most is 5 (Jordan) | MVP ppg 30, usage 35%, 22 distinct winners | Voting balances production, wins and scoring; more noise and voter fatigue |
| The generational archetype produced 33% of the sim's top-24 players | Far too many all-rounders | Generational is rare (~1 per 4-5 classes); small per-archetype rating offsets |

## Final real vs sim (3 leagues x 80 seasons)

```
REAL (Basketball-Reference through 2026) vs SIM (3 seeds x 80 seasons)
                                                   real      sim

-- scoring and production (2016-26, gp>=58)
players >= 30 ppg / season                         2.09     1.91 
players >= 28 ppg                                  4.09     4.60 
players >= 25 ppg                                 11.27    11.23 
players >= 20 ppg (sim has less depth)            30.82    27.23 
top scorer ppg                                    32.57    31.77 
mean of top-5 scorers                             29.57    29.61 
perf rank 1                                       59.24    58.32 
perf mean top 5                                   53.59    53.23 
perf mean top 10                                  49.50    50.06 
perf mean top 24 (All-Star tier)                  43.88    45.05 
perf mean top 50                                  38.41    39.01 
perf of 24th best (All-Star cutoff)               37.05    38.48 
star (perf>=40) minutes                           34.80    35.12 
star usage %                                      30.70    30.54 
star TS%                                           0.61     0.61 
star games played share (g/82)                     0.80     0.82 

-- aging: mean year-over-year change in perf (qualified players)
age     real_all   sim_all    real_star  sim_star    mean perf real / sim
19           5.2       6.5         n/a       5.8     20.3 / 18.4  n=37/431
20           3.8       4.0         1.9       1.1     22.3 / 23.6  n=91/764
21           3.1       3.4        -1.1       1.1     24.0 / 26.7  n=118/1125
22           2.2       2.2         2.0       0.3     24.5 / 29.0  n=168/1443
23           1.8       1.0         1.4      -0.2     24.4 / 32.3  n=193/1409
24           1.1       1.1         0.1      -0.1     24.8 / 33.1  n=187/1363
25           0.5       0.6         0.3      -0.2     25.7 / 33.8  n=208/1385
26           0.3       0.4         0.1      -0.6     25.5 / 34.3  n=199/1381
27          -0.0      -0.3        -1.5      -1.1     25.7 / 34.8  n=184/1359
28          -0.4      -0.6         0.0      -1.4     25.5 / 34.7  n=156/1332
29          -1.1      -1.3        -1.8      -2.4     25.4 / 34.0  n=131/1298
30          -1.0      -1.0        -2.3      -1.5     24.6 / 32.8  n=120/1292
31          -0.9      -1.1         0.1      -1.9     23.3 / 32.0  n=91/1215
32          -1.6      -1.9        -4.3      -3.0     24.4 / 31.0  n=64/1063
33          -2.6      -2.4        -1.1      -3.1     25.3 / 29.6  n=52/811
34          -2.3      -3.2        -5.2      -4.2     24.6 / 28.4  n=41/617
35          -1.9      -3.6        -0.7      -4.4     24.3 / 26.9  n=28/355
36          -3.2      -3.0        -2.9      -5.0     24.4 / 26.0  n=21/165
37          -3.9      -3.7        -4.3      -1.8     23.2 / 25.9  n=7/48
year-to-year sd of perf change (all)               4.78     4.59 
  ... ages 24-30                                   4.48     4.13 
  ... stars (perf>=38)                             4.65     5.09 
star mean change, ages 26-31                      -0.83    -1.43   <-- off
P(star stays star | qualifies next yr, 26-31)      0.79     0.81 

-- scorer cohort: mean ppg by age for players who ever scored 25+ (real vs sim)
20: 16.0/19.8   22: 20.5/23.9   24: 24.2/25.6   26: 25.3/26.3   28: 25.0/26.3   30: 22.6/24.1   32: 21.4/23.2   34: 20.1/21.4   36: 16.4/17.6   38: 14.4/13.5

-- awards (since 2000 / first 46 sim seasons)
MVP age                                           26.50    26.61 
MVP team wins (median real, mean sim)             60.00    57.39 
MVP ppg                                           27.30    28.41 
MVP share scoring 25+                              0.77     0.83 
MVP perf                                          50.90    52.68 
MVP usage %                                       31.70    32.96 
distinct MVP winners in 46 seasons                27.00    30.67 
most MVPs by one player in 46 seasons              5.00     4.33 
All-NBA 1st: ppg                                  26.20    27.85 
All-NBA 1st: perf                                 47.40    51.70   <-- off
top-5 scorers who make All-NBA                     0.94     0.84   <-- off

-- team wins
sd of wins                                        12.54    12.36 
share of teams 60+ wins                            0.05     0.06 
share 55+                                          0.13     0.14 
share under 25                                     0.13     0.11 
share under 20                                     0.05     0.06 
year-to-year win correlation                       0.60     0.57 
mean abs change in wins                            8.49     9.02 
bad team (<=28) next-year change                   9.30     9.19 
bad team gains 20+                                 0.20     0.17 
top-3 pick team wins, year 1                       8.30     6.71 
top-3 pick team wins, year 2                      13.70    11.89 

-- rookies by draft slot: ppg / mpg   (real | sim)
1           16.7 / 30.9  |     16.4 / 30.2  n=233
2-3         12.7 / 27.3  |     13.5 / 27.1  n=456
4-5         10.1 / 24.8  |     11.7 / 24.6  n=452
6-10         8.7 / 23.0  |      9.6 / 21.9  n=1154
11-14        8.6 / 21.1  |      8.0 / 20.2  n=918
15-30        6.7 / 18.0  |      6.8 / 17.8  n=2450
31-60        5.6 / 16.4  |      9.5 / 21.1  n=300

-- draft slot -> career (real 1990-2015 vs sim classes): P(>=1 All-Star season)  |  P(3+)  |  mean seasons
1-1        73%    80%   |   50%   78%   |  13.2  16.7
2-3        48%    61%   |   31%   48%   |  12.2  16.0
4-5        35%    42%   |   19%   32%   |  13.0  15.3
6-10       20%    27%   |   12%   19%   |  10.6  15.0
11-14       9%    11%   |    3%    9%   |   8.9  13.9
15-20       9%     9%   |    3%    7%   |   8.2  13.4
21-30       5%     4%   |    2%    3%   |   7.2  11.2
31-45       3%     1%   |    1%    1%   |   4.5   8.9
46-60       2%     0%   |    1%    0%   |   2.4   6.4
per class: All-Stars (real/sim) 5.3 / 5.8   3+ All-Star 2.7 / 4.5   5+ seasons 1.27 / 3.53
league-sim classes with real competition for 24 All-Star slots: any 3.8  3+ 2.8  5+ 2.12    (real 5.35 / 2.73 / 1.27)
```

## Known gaps (honest list)

- **Sustained stars:** the league sim gives 2.1 players per draft class with 5+ All-Star seasons (real 1.27) and 3.8 with any All-Star selection (real 5.35). Three-time All-Stars match (2.8 vs 2.73). Real careers have more one-time All-Stars and fewer very long peaks.
- **Depth:** the sim models each team's top 4-5 players, not full rosters, so it has ~125 qualified players per season vs 246 real. Anything below the top ~50 players is not calibrated.
- **Top-24 production** is 2-4% high and the 30+ ppg count (1.9 vs 2.1) and top scorer (31.8 vs 32.6) a bit low. All-NBA first-team perf (51.7 vs 47.4) is high because voting has no positional balance.
- **Star year-to-year change** at ages 26-31 is -1.4 vs -0.8 real.
- **Triple-double rates** cannot be checked: season CSVs have no game logs. Rates (17-27% target) come from known career figures (Westbrook ~17%, Jokic ~24%), not from the files.
- **Salaries** were not calibrated (no salary file); career earnings come from the cap rules plus market curve.
- **Real vs sim draft classes:** the sim's mean career length for draftees (13-17 seasons) is longer than real (2-13) because the sim drops out only ~ovr<58 players.
