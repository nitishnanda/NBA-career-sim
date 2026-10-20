(function (g) {
  'use strict';
  // Real league snapshot for the start of the 2026-27 season (20 Oct 2026).
  // Built from preseason roster/lineup reporting; ratings are our own estimates on the game's 0-99 scale.
  // Row: [name, pos, age, overall, archetype, secondary]
  const TEAMS = {
    Hawks: [['Jalen Johnson', 'PF', 24, 86, 'dominator'], ['Nickeil Alexander-Walker', 'SG', 28, 78, 'shooter'], ['Dyson Daniels', 'SG', 23, 78, 'twoway'], ['CJ McCollum', 'SG', 35, 77, 'scorer']],
    Celtics: [['Jayson Tatum', 'SF', 28, 91, 'scorer', 'twoway'], ['Derrick White', 'SG', 32, 80, 'twoway'], ['Paul George', 'SF', 36, 80, 'scorer'], ['Payton Pritchard', 'PG', 28, 77, 'shooter']],
    Nets: [['Michael Porter Jr.', 'SF', 28, 81, 'scorer'], ['Julius Randle', 'PF', 31, 80, 'scorer'], ['Egor Demin', 'PG', 21, 72, 'shooter'], ['Nolan Traore', 'PG', 20, 70, 'dominator']],
    Hornets: [['Brandon Miller', 'SF', 24, 80, 'scorer'], ['Kon Knueppel', 'SG', 21, 79, 'shooter'], ['Coby White', 'PG', 26, 77, 'scorer'], ['Naz Reid', 'PF', 27, 77, 'shooter']],
    Bulls: [['Josh Giddey', 'PG', 24, 79, 'dominator'], ['Norman Powell', 'SG', 33, 78, 'scorer'], ['Matas Buzelis', 'SF', 22, 76, 'twoway'], ['Nic Claxton', 'C', 27, 74, 'defender']],
    Cavaliers: [['Donovan Mitchell', 'SG', 30, 88, 'scorer'], ['Evan Mobley', 'PF', 25, 87, 'twoway', 'defender'], ['James Harden', 'SG', 37, 83, 'dominator'], ['Jarrett Allen', 'C', 28, 80, 'defender']],
    Pistons: [['Cade Cunningham', 'PG', 25, 91, 'dominator'], ['Jalen Duren', 'C', 22, 80, 'defender'], ['Ausar Thompson', 'SF', 23, 79, 'twoway'], ['John Collins', 'PF', 29, 74, 'scorer']],
    Pacers: [['Tyrese Haliburton', 'PG', 26, 87, 'dominator'], ['Pascal Siakam', 'PF', 32, 81, 'scorer'], ['Ivica Zubac', 'C', 29, 78, 'defender'], ['Andrew Nembhard', 'PG', 27, 77, 'twoway']],
    Heat: [['Giannis Antetokounmpo', 'PF', 31, 94, 'twoway', 'generational'], ['Bam Adebayo', 'C', 29, 85, 'twoway'], ['Bobby Portis', 'PF', 31, 74, 'scorer'], ['Klay Thompson', 'SG', 36, 72, 'shooter']],
    Bucks: [['Tyler Herro', 'SG', 26, 80, 'scorer'], ['Myles Turner', 'C', 30, 76, 'shooter'], ['Kyle Kuzma', 'PF', 31, 72, 'scorer'], ['Jaime Jaquez Jr.', 'SF', 25, 73, 'scorer']],
    Knicks: [['Jalen Brunson', 'PG', 30, 90, 'scorer'], ['Karl-Anthony Towns', 'C', 31, 86, 'shooter'], ['OG Anunoby', 'SF', 29, 82, 'twoway'], ['Mikal Bridges', 'SF', 30, 80, 'twoway']],
    Magic: [['Paolo Banchero', 'PF', 24, 86, 'scorer'], ['Franz Wagner', 'SF', 25, 83, 'scorer'], ['Desmond Bane', 'SG', 28, 81, 'shooter'], ['Jalen Suggs', 'PG', 25, 77, 'twoway']],
    '76ers': [['Joel Embiid', 'C', 32, 90, 'scorer'], ['Jaylen Brown', 'SF', 30, 89, 'twoway', 'scorer'], ['Tyrese Maxey', 'PG', 26, 88, 'scorer'], ['LeBron James', 'PF', 41, 82, 'generational', 'dominator'], ['VJ Edgecombe', 'SG', 21, 80, 'twoway']],
    Raptors: [['Kawhi Leonard', 'SF', 35, 85, 'twoway'], ['Scottie Barnes', 'PF', 25, 85, 'dominator', 'twoway'], ['Immanuel Quickley', 'PG', 27, 80, 'shooter'], ['RJ Barrett', 'SF', 26, 77, 'scorer']],
    Wizards: [['Trae Young', 'PG', 28, 80, 'dominator'], ['Anthony Davis', 'PF', 33, 80, 'defender'], ['Alex Sarr', 'C', 21, 76, 'defender'], ['Kyshawn George', 'SF', 22, 72, 'shooter']],
    Mavericks: [['Kyrie Irving', 'PG', 34, 84, 'shooter'], ['Cooper Flagg', 'SF', 19, 82, 'twoway', 'generational'], ['P.J. Washington', 'PF', 28, 74, 'twoway'], ['Daniel Gafford', 'C', 28, 73, 'defender']],
    Nuggets: [['Nikola Jokic', 'C', 31, 96, 'dominator', 'generational'], ['Jamal Murray', 'PG', 29, 85, 'scorer'], ['Aaron Gordon', 'PF', 31, 79, 'twoway'], ['Cameron Johnson', 'SF', 30, 75, 'shooter']],
    Warriors: [['Stephen Curry', 'PG', 38, 88, 'shooter'], ['Jimmy Butler', 'SF', 37, 80, 'twoway'], ['Kristaps Porzingis', 'C', 31, 78, 'scorer'], ['Brandin Podziemski', 'SG', 23, 76, 'shooter']],
    Rockets: [['Kevin Durant', 'SF', 38, 87, 'scorer'], ['Alperen Sengun', 'C', 24, 85, 'dominator'], ['Amen Thompson', 'SF', 23, 84, 'twoway'], ['Jabari Smith Jr.', 'PF', 23, 78, 'shooter']],
    Clippers: [['Brandon Ingram', 'SF', 29, 82, 'scorer'], ['Darius Garland', 'PG', 26, 80, 'shooter'], ['Brook Lopez', 'C', 38, 73, 'defender'], ['Rui Hachimura', 'PF', 28, 74, 'scorer']],
    Lakers: [['Luka Doncic', 'PG', 27, 94, 'dominator', 'scorer'], ['Austin Reaves', 'SG', 28, 80, 'scorer'], ['Walker Kessler', 'C', 25, 78, 'defender'], ['Quentin Grimes', 'SG', 26, 74, 'shooter']],
    Grizzlies: [['Jerami Grant', 'PF', 32, 77, 'scorer'], ['Ty Jerome', 'PG', 29, 76, 'shooter'], ['Zach Edey', 'C', 24, 75, 'defender'], ['Cedric Coward', 'SF', 22, 74, 'twoway']],
    Timberwolves: [['Anthony Edwards', 'SG', 25, 91, 'scorer', 'twoway'], ['LaMelo Ball', 'PG', 25, 84, 'dominator'], ['Rudy Gobert', 'C', 34, 80, 'defender'], ['Jaden McDaniels', 'SF', 26, 78, 'twoway']],
    Pelicans: [['Zion Williamson', 'PF', 26, 83, 'scorer'], ['Trey Murphy III', 'SF', 26, 80, 'shooter'], ['Dejounte Murray', 'PG', 30, 76, 'twoway'], ['Derik Queen', 'C', 21, 75, 'dominator']],
    Thunder: [['Shai Gilgeous-Alexander', 'PG', 28, 95, 'scorer'], ['Jalen Williams', 'SF', 25, 84, 'twoway'], ['Chet Holmgren', 'C', 24, 84, 'defender'], ['Isaiah Hartenstein', 'C', 28, 77, 'defender']],
    Suns: [['Devin Booker', 'SG', 30, 88, 'scorer'], ['Jalen Green', 'SG', 24, 78, 'scorer'], ['Dillon Brooks', 'SF', 31, 76, 'twoway'], ['Miles Bridges', 'PF', 28, 76, 'scorer']],
    'Trail Blazers': [['Ja Morant', 'PG', 27, 84, 'dominator'], ['Deni Avdija', 'SF', 25, 82, 'scorer'], ['Shaedon Sharpe', 'SG', 23, 78, 'scorer'], ['Donovan Clingan', 'C', 22, 78, 'defender']],
    Kings: [['Domantas Sabonis', 'C', 30, 84, 'dominator'], ['Zach LaVine', 'SG', 31, 78, 'scorer'], ['Keegan Murray', 'PF', 26, 77, 'shooter'], ['Malik Monk', 'SG', 28, 76, 'scorer']],
    Spurs: [['Victor Wembanyama', 'C', 22, 97, 'generational', 'defender'], ["De'Aaron Fox", 'PG', 28, 85, 'scorer'], ['Stephon Castle', 'SG', 21, 80, 'twoway'], ['Dylan Harper', 'PG', 20, 76, 'scorer']],
    Jazz: [['Lauri Markkanen', 'PF', 29, 84, 'scorer'], ['Jaren Jackson Jr.', 'PF', 27, 82, 'defender'], ['Keyonte George', 'PG', 23, 76, 'shooter'], ['Ace Bailey', 'SF', 20, 74, 'scorer']],
  };

  // 2026 draft class: [name, team, pos, age, overall, ceiling, archetype, secondary, pick]
  const ROOKIES = [
    ['AJ Dybantsa', 'Wizards', 'SF', 19, 74, 95, 'scorer', 'generational', 1],
    ['Darryn Peterson', 'Jazz', 'SG', 19, 73, 92, 'scorer', '', 2],
    ['Cameron Boozer', 'Grizzlies', 'PF', 19, 74, 90, 'dominator', '', 3],
    ['Caleb Wilson', 'Bulls', 'PF', 19, 70, 88, 'twoway', '', 4],
    ['Keaton Wagler', 'Clippers', 'SG', 19, 69, 86, 'shooter', '', 5],
    ['Mikel Brown Jr.', 'Nets', 'PG', 19, 68, 85, 'scorer', '', 6],
    ['Darius Acuff Jr.', 'Kings', 'PG', 19, 68, 85, 'dominator', '', 7],
    ['Kingston Flemings', 'Hawks', 'PG', 19, 67, 84, 'scorer', '', 8],
    ['Morez Johnson Jr.', 'Mavericks', 'PF', 20, 66, 80, 'defender', '', 9],
    ['Brayden Burries', 'Bucks', 'SG', 19, 66, 82, 'scorer', '', 10],
    ['Yaxel Lendeborg', 'Warriors', 'PF', 23, 69, 76, 'twoway', '', 11],
    ['Aday Mara', 'Thunder', 'C', 21, 66, 78, 'defender', '', 12],
    ['Nate Ament', 'Bucks', 'SF', 19, 64, 82, 'scorer', '', 13],
    ['Hannes Steinbach', 'Hornets', 'C', 20, 64, 78, 'dominator', '', 14],
    ['Dailyn Swain', 'Bulls', 'SF', 21, 64, 76, 'twoway', '', 15],
    ['Ebuka Okorie', 'Pistons', 'PG', 20, 62, 76, 'scorer', '', 17],
    ['Jayden Quaintance', 'Spurs', 'PF', 19, 62, 80, 'defender', '', 20],
    ['Zuby Ejiofor', 'Hawks', 'PF', 23, 62, 70, 'defender', '', 23],
    ['Koa Peat', 'Suns', 'PF', 19, 60, 76, 'twoway', '', 30],
  ];

  // approximate 2025-26 records, used only so year-one win totals have some continuity
  const WINS = { Spurs: 62, Pistons: 60, Thunder: 60, Knicks: 53, Cavaliers: 52, Magic: 45, Clippers: 42, Warriors: 37, Bucks: 32, Pelicans: 26, Grizzlies: 25, Pacers: 19, Wizards: 17 };

  g.NBA.real = { TEAMS, ROOKIES, WINS, asOf: '2026-10-20' };
  if (typeof module !== 'undefined') module.exports = g.NBA;
})(typeof window !== 'undefined' ? window : globalThis);
