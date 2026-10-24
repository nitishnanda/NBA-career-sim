(function (g) {
  'use strict';
  const NBA = (g.NBA = g.NBA || {});

  const ATTRS = ['inside', 'mid', 'three', 'ft', 'handling', 'passing', 'iq', 'reb', 'perD', 'rimP', 'ath', 'dur'];
  const ATTR_LABELS = {
    inside: 'Inside Scoring', mid: 'Mid-Range', three: '3PT Shooting', ft: 'Free Throw',
    handling: 'Ball Handling', passing: 'Passing', iq: 'Basketball IQ', reb: 'Rebounding',
    perD: 'Perimeter D', rimP: 'Rim Protection', ath: 'Athleticism', dur: 'Durability',
  };

  // Offsets from a flat 50 baseline for each position.
  const POSITIONS = {
    PG: { inside: -8, mid: 2, three: 6, ft: 6, handling: 22, passing: 22, iq: 4, reb: -4, perD: 4, rimP: -35, ath: 2, dur: 0 },
    SG: { inside: -4, mid: 6, three: 8, ft: 5, handling: 10, passing: 4, iq: 0, reb: -6, perD: 4, rimP: -32, ath: 4, dur: 0 },
    SF: { inside: 2, mid: 2, three: 2, ft: 0, handling: -2, passing: -2, iq: 0, reb: 4, perD: 4, rimP: -22, ath: 6, dur: 0 },
    PF: { inside: 8, mid: -2, three: -6, ft: -4, handling: -14, passing: -8, iq: 0, reb: 16, perD: -2, rimP: 4, ath: 4, dur: 0 },
    C: { inside: 12, mid: -10, three: -18, ft: -10, handling: -24, passing: -10, iq: 0, reb: 26, perD: -8, rimP: 26, ath: -2, dur: 0 },
  };

  // Boosts layered on top of the position baseline.
  const ARCHETYPES = {
    generational: {
      name: 'Generational Talent', icon: '👑',
      blurb: 'Elite at everything from day one. Multiple MVP-level seasons, still great at 35+.',
      comps: 'LeBron · Jordan · Jokic · Wembanyama',
      boost: { inside: 14, mid: 12, three: 10, ft: 10, handling: 8, passing: 8, iq: 20, reb: 5, perD: 8, rimP: 8, ath: 12, dur: 6 },
      weights: { inside: .11, mid: .08, three: .08, ft: .04, handling: .09, passing: .1, iq: .14, reb: .08, perD: .07, rimP: .05, ath: .12, dur: .04 },
      usg: 0.01, ts: 0.028, declineMult: 0.6, ceilingBonus: 3,
    },
    scorer: {
      name: 'Consistent Scorer', icon: '🎯',
      blurb: '25-28 a night for 15+ seasons. All-NBA every year, 30k points through durability.',
      comps: 'Karl Malone · Durant · Kobe',
      boost: { inside: 14, mid: 22, three: 12, ft: 16, handling: 12, passing: -2, iq: 10, reb: -4, perD: 6, rimP: -4, ath: 8, dur: 12 },
      weights: { inside: .14, mid: .17, three: .13, ft: .09, handling: .1, passing: .03, iq: .1, reb: .03, perD: .03, rimP: .01, ath: .11, dur: .06 },
      usg: 0.012, ts: 0.016, declineMult: 1.5, ceilingBonus: 0, injury: 1.05,
    },
    twoway: {
      name: 'Two-Way Demon', icon: '🔒',
      blurb: 'Lockdown defence plus real scoring. Titles and Finals MVPs, but injury risk is higher.',
      comps: 'Kawhi · Giannis · Jordan · Pippen',
      boost: { inside: 14, mid: 10, three: 2, ft: 0, handling: 6, passing: 10, iq: 12, reb: 2, perD: 18, rimP: 8, ath: 24, dur: -8 },
      weights: { inside: .12, mid: .08, three: .05, ft: .03, handling: .06, passing: .05, iq: .1, reb: .07, perD: .17, rimP: .05, ath: .18, dur: .04 },
      usg: 0.0, ts: 0.024, declineMult: 1.15, ceilingBonus: 0, injury: 1.35,
    },
    defender: {
      name: 'Defensive Anchor', icon: '🧱',
      blurb: 'Rebounds, blocks, DPOYs. Little offence, cheaper contracts, huge impact.',
      comps: 'Russell · Mutombo · Ben Wallace · Gobert · Wembanyama',
      boost: { inside: 14, mid: -2, three: -12, ft: 0, handling: -8, passing: 14, iq: 8, reb: 34, perD: 10, rimP: 36, ath: 10, dur: 8 },
      weights: { inside: .1, mid: .02, three: .02, ft: .03, handling: .02, passing: .04, iq: .1, reb: .16, perD: .1, rimP: .2, ath: .11, dur: .06 },
      usg: 0.02, ts: 0.024, declineMult: 1.1, ceilingBonus: -1,
    },
    shooter: {
      name: 'Lethal Shooter', icon: '🎳',
      blurb: '40%+ from three on volume and 90% at the line. Ages best of all, defence is the weakness.',
      comps: 'Curry · Klay · Reggie Miller · Ray Allen',
      boost: { inside: -2, mid: 20, three: 38, ft: 32, handling: 14, passing: 6, iq: 14, reb: 0, perD: 2, rimP: -14, ath: 2, dur: 4 },
      weights: { inside: .04, mid: .14, three: .26, ft: .1, handling: .1, passing: .06, iq: .12, reb: .01, perD: .02, rimP: 0, ath: .08, dur: .07 },
      usg: -0.04, ts: 0.012, declineMult: 0.8, ceilingBonus: -1,
    },
    dominator: {
      name: 'Box-Score Dominator', icon: '📊',
      blurb: 'Near triple-double every night. Needs the ball and the usage; athletic types burn out faster.',
      comps: 'Oscar · Westbrook · Magic · Luka · Jokic',
      boost: { inside: 12, mid: 6, three: 4, ft: 2, handling: 24, passing: 38, iq: 18, reb: 8, perD: 0, rimP: -10, ath: 18, dur: 6 },
      weights: { inside: .09, mid: .06, three: .06, ft: .03, handling: .1, passing: .16, iq: .14, reb: .15, perD: .03, rimP: .01, ath: .12, dur: .05 },
      usg: 0.045, ts: 0.03, declineMult: 1.3, ceilingBonus: 0,
    },
  };

  const TEAMS = [
    ['Atlanta', 'Hawks', 'E'], ['Boston', 'Celtics', 'E'], ['Brooklyn', 'Nets', 'E'], ['Charlotte', 'Hornets', 'E'],
    ['Chicago', 'Bulls', 'E'], ['Cleveland', 'Cavaliers', 'E'], ['Detroit', 'Pistons', 'E'], ['Indiana', 'Pacers', 'E'],
    ['Miami', 'Heat', 'E'], ['Milwaukee', 'Bucks', 'E'], ['New York', 'Knicks', 'E'], ['Orlando', 'Magic', 'E'],
    ['Philadelphia', '76ers', 'E'], ['Toronto', 'Raptors', 'E'], ['Washington', 'Wizards', 'E'],
    ['Dallas', 'Mavericks', 'W'], ['Denver', 'Nuggets', 'W'], ['Golden State', 'Warriors', 'W'], ['Houston', 'Rockets', 'W'],
    ['Los Angeles', 'Clippers', 'W'], ['Los Angeles', 'Lakers', 'W'], ['Memphis', 'Grizzlies', 'W'], ['Minnesota', 'Timberwolves', 'W'],
    ['New Orleans', 'Pelicans', 'W'], ['Oklahoma City', 'Thunder', 'W'], ['Phoenix', 'Suns', 'W'], ['Portland', 'Trail Blazers', 'W'],
    ['Sacramento', 'Kings', 'W'], ['San Antonio', 'Spurs', 'W'], ['Utah', 'Jazz', 'W'],
  ].map((t, i) => ({ id: i, city: t[0], nick: t[1], conf: t[2], name: t[0] + ' ' + t[1] }));

  // tilt: small attribute nudge for where you grew up
  const REGIONS = {
    Northeast: { tilt: { handling: 3, passing: 2 }, states: ['New York', 'New Jersey', 'Pennsylvania', 'Massachusetts', 'Connecticut', 'Maryland', 'Washington D.C.', 'Rhode Island', 'Delaware', 'Maine', 'Vermont', 'New Hampshire'] },
    Midwest: { tilt: { iq: 3, ft: 2 }, states: ['Illinois', 'Ohio', 'Michigan', 'Indiana', 'Wisconsin', 'Minnesota', 'Missouri', 'Iowa', 'Kansas', 'Nebraska', 'Oklahoma', 'South Dakota', 'North Dakota'] },
    South: { tilt: { ath: 3, perD: 2 }, states: ['Georgia', 'Florida', 'North Carolina', 'South Carolina', 'Virginia', 'Tennessee', 'Alabama', 'Louisiana', 'Mississippi', 'Kentucky', 'Arkansas', 'West Virginia'] },
    Texas: { tilt: { reb: 3, inside: 2 }, states: ['Texas'] },
    West: { tilt: { three: 3, mid: 2 }, states: ['California', 'Washington', 'Oregon', 'Arizona', 'Nevada', 'Utah', 'Colorado', 'New Mexico', 'Idaho', 'Montana', 'Wyoming', 'Hawaii', 'Alaska'] },
  };
  const STATE_ABBR = {
    'New York': 'NY', 'New Jersey': 'NJ', 'Pennsylvania': 'PA', 'Massachusetts': 'MA', 'Connecticut': 'CT', 'Maryland': 'MD', 'Washington D.C.': 'DC', 'Rhode Island': 'RI', 'Delaware': 'DE', 'Maine': 'ME', 'Vermont': 'VT', 'New Hampshire': 'NH',
    'Illinois': 'IL', 'Ohio': 'OH', 'Michigan': 'MI', 'Indiana': 'IN', 'Wisconsin': 'WI', 'Minnesota': 'MN', 'Missouri': 'MO', 'Iowa': 'IA', 'Kansas': 'KS', 'Nebraska': 'NE', 'Oklahoma': 'OK', 'South Dakota': 'SD', 'North Dakota': 'ND',
    'Georgia': 'GA', 'Florida': 'FL', 'North Carolina': 'NC', 'South Carolina': 'SC', 'Virginia': 'VA', 'Tennessee': 'TN', 'Alabama': 'AL', 'Louisiana': 'LA', 'Mississippi': 'MS', 'Kentucky': 'KY', 'Arkansas': 'AR', 'West Virginia': 'WV',
    'Texas': 'TX', 'California': 'CA', 'Washington': 'WA', 'Oregon': 'OR', 'Arizona': 'AZ', 'Nevada': 'NV', 'Utah': 'UT', 'Colorado': 'CO', 'New Mexico': 'NM', 'Idaho': 'ID', 'Montana': 'MT', 'Wyoming': 'WY', 'Hawaii': 'HI', 'Alaska': 'AK',
  };

  // [name, state abbr, prestige 1-5]
  const COLLEGES = [
    ['Duke', 'NC', 5], ['Kentucky', 'KY', 5], ['Kansas', 'KS', 5], ['North Carolina', 'NC', 5], ['UConn', 'CT', 5], ['Gonzaga', 'WA', 5],
    ['UCLA', 'CA', 4], ['Michigan State', 'MI', 4], ['Villanova', 'PA', 4], ['Arizona', 'AZ', 4], ['Houston', 'TX', 4], ['Texas', 'TX', 4], ['Alabama', 'AL', 4], ['Tennessee', 'TN', 4], ['Purdue', 'IN', 4], ['Baylor', 'TX', 4],
    ['Florida', 'FL', 3], ['Arkansas', 'AR', 3], ['Illinois', 'IL', 3], ['Creighton', 'NE', 3], ['Marquette', 'WI', 3], ['Oregon', 'OR', 3], ['USC', 'CA', 3], ['Louisville', 'KY', 3], ['Syracuse', 'NY', 3], ['Georgetown', 'DC', 3], ['Memphis', 'TN', 3], ['Auburn', 'AL', 3], ['Indiana', 'IN', 3], ['Ohio State', 'OH', 3],
    ['Wake Forest', 'NC', 2], ['Utah', 'UT', 2], ['Colorado', 'CO', 2], ['Seton Hall', 'NJ', 2], ["St. John's", 'NY', 2], ['Dayton', 'OH', 2], ['San Diego State', 'CA', 2], ['Virginia Tech', 'VA', 2], ['TCU', 'TX', 2], ['Cincinnati', 'OH', 2], ['Xavier', 'OH', 2], ['Butler', 'IN', 2],
    ['Davidson', 'NC', 1], ["Saint Mary's", 'CA', 1], ['VCU', 'VA', 1], ['Loyola Chicago', 'IL', 1], ['Wichita State', 'KS', 1], ['Belmont', 'TN', 1], ['Santa Clara', 'CA', 1], ['Murray State', 'KY', 1], ['Northern Iowa', 'IA', 1], ['Drake', 'IA', 1], ['Weber State', 'UT', 1], ['South Dakota State', 'SD', 1], ['Furman', 'SC', 1], ['Oral Roberts', 'OK', 1],
  ].map((c, i) => ({ id: i, name: c[0], state: c[1], prestige: c[2] }));

  const FIRST = ['Marcus', 'Jalen', 'Devin', 'Tyrese', 'Darius', 'Cam', 'Trey', 'Isaiah', 'Malik', 'Jaylen', 'Zion', 'Ant', 'Josh', 'Kyle', 'Brandon', 'Terrence', 'Caleb', 'Donovan', 'Elijah', 'Xavier', 'Reggie', 'Andre', 'Nico', 'Luka', 'Tobias', 'Jamal', 'Rashad', 'Dominic', 'Mason', 'Ty', 'Corey', 'Jordan', 'Derrick', 'Jabari', 'Kelvin', 'Omar', 'Shai', 'Paolo', 'Victor', 'Chet', 'Cooper', 'Amari', 'Keegan', 'Bryce', 'Dyson', 'Kobe', 'Lonzo', 'Immanuel'];
  const LAST = ['Johnson', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Robinson', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Phillips', 'Evans', 'Turner', 'Parker', 'Collins', 'Edwards', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Reed', 'Bailey', 'Cooper', 'Howard', 'Ward', 'Brooks', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Hayes'];

  const ARENAS = { Hawks: 'State Farm Arena', Celtics: 'TD Garden', Nets: 'Barclays Center', Hornets: 'Spectrum Center', Bulls: 'United Center', Cavaliers: 'Rocket Arena', Mavericks: 'American Airlines Center', Nuggets: 'Ball Arena', Pistons: 'Little Caesars Arena', Warriors: 'Chase Center', Rockets: 'Toyota Center', Pacers: 'Gainbridge Fieldhouse', Clippers: 'Intuit Dome', Lakers: 'Crypto.com Arena', Grizzlies: 'FedExForum', Heat: 'Kaseya Center', Bucks: 'Fiserv Forum', Timberwolves: 'Target Center', Pelicans: 'Smoothie King Center', Knicks: 'Madison Square Garden', Thunder: 'Paycom Center', Magic: 'Kia Center', '76ers': 'Xfinity Mobile Arena', Suns: 'Footprint Center', 'Trail Blazers': 'Moda Center', Kings: 'Golden 1 Center', Spurs: 'Frost Bank Center', Raptors: 'Scotiabank Arena', Jazz: 'Delta Center', Wizards: 'Capital One Arena' };
  // brand-style colours for the generated team crests: [primary, secondary]
  const TEAM_COLORS = { Hawks: ['#e03a3e', '#c1d32f'], Celtics: ['#007a33', '#ba9653'], Nets: ['#111111', '#ffffff'], Hornets: ['#1d1160', '#00788c'], Bulls: ['#ce1141', '#111111'], Cavaliers: ['#860038', '#fdbb30'], Mavericks: ['#00538c', '#b8c4ca'], Nuggets: ['#0e2240', '#fec524'], Pistons: ['#c8102e', '#1d42ba'], Warriors: ['#1d428a', '#ffc72c'], Rockets: ['#ce1141', '#c4ced4'], Pacers: ['#002d62', '#fdbb30'], Clippers: ['#c8102e', '#1d428a'], Lakers: ['#552583', '#fdb927'], Grizzlies: ['#5d76a9', '#12173f'], Heat: ['#98002e', '#f9a01b'], Bucks: ['#00471b', '#eee1c6'], Timberwolves: ['#0c2340', '#78be20'], Pelicans: ['#0c2340', '#c8102e'], Knicks: ['#006bb6', '#f58426'], Thunder: ['#007ac1', '#ef3b24'], Magic: ['#0077c0', '#c4ced4'], '76ers': ['#006bb6', '#ed174c'], Suns: ['#1d1160', '#e56020'], 'Trail Blazers': ['#e03a3e', '#111111'], Kings: ['#5a2d81', '#63727a'], Spurs: ['#1a1a1a', '#c4ced4'], Raptors: ['#ce1141', '#111111'], Jazz: ['#002b5c', '#f9a01b'], Wizards: ['#002b5c', '#e31837'] };
  const ABBR = { Hawks: 'ATL', Celtics: 'BOS', Nets: 'BKN', Hornets: 'CHA', Bulls: 'CHI', Cavaliers: 'CLE', Mavericks: 'DAL', Nuggets: 'DEN', Pistons: 'DET', Warriors: 'GSW', Rockets: 'HOU', Pacers: 'IND', Clippers: 'LAC', Lakers: 'LAL', Grizzlies: 'MEM', Heat: 'MIA', Bucks: 'MIL', Timberwolves: 'MIN', Pelicans: 'NOP', Knicks: 'NYK', Thunder: 'OKC', Magic: 'ORL', '76ers': 'PHI', Suns: 'PHX', 'Trail Blazers': 'POR', Blazers: 'POR', Kings: 'SAC', Spurs: 'SAS', Raptors: 'TOR', Jazz: 'UTA', Wizards: 'WAS' };
  NBA.data = { TEAM_COLORS, ABBR, ARENAS, ATTRS, ATTR_LABELS, POSITIONS, ARCHETYPES, TEAMS, REGIONS, STATE_ABBR, COLLEGES, FIRST, LAST };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
