(function (g) {
  // The international road to the NBA: grow up in the UK or continental Europe, play in a domestic league and the EuroLeague, then declare for the draft.
  // Data only (clubs, leagues, honors); the seasons are simulated in game.js next to the college path they stand in for.
  const NBA = (g.NBA = g.NBA || {});
  // tier: 'academy' (youth / junior or second-division side), 'domestic' (top of the home league), 'euroleague' (the continent's best). minStars: how much scouts must like you before the club calls.
  const COUNTRIES = {
    uk: { name: 'United Kingdom', flag: '🇬🇧', league: 'BBL', blurb: 'A thinner basketball culture: fewer eyes on you, fewer reps against top competition. A big talent has to leave to be seen, or head to the US.', clubs: [
      { n: 'Basketball England Academy', city: 'Loughborough', tier: 'academy', prestige: 2, minStars: 1 }, { n: 'London Lions', city: 'London', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Leicester Riders', city: 'Leicester', tier: 'domestic', prestige: 2, minStars: 1 }, { n: 'Newcastle Eagles', city: 'Newcastle', tier: 'domestic', prestige: 2, minStars: 1 }, { n: 'Manchester Giants', city: 'Manchester', tier: 'domestic', prestige: 2, minStars: 1 } ] },
    spain: { name: 'Spain', flag: '🇪🇸', league: 'Liga ACB', blurb: 'The best youth systems in Europe and the toughest domestic league. Real Madrid and Barcelona sit at the top of the EuroLeague.', clubs: [
      { n: 'Joventut Badalona Cantera', city: 'Badalona', tier: 'academy', prestige: 4, minStars: 1 }, { n: 'Real Madrid Cantera', city: 'Madrid', tier: 'academy', prestige: 5, minStars: 3 }, { n: 'Unicaja Málaga', city: 'Málaga', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Valencia Basket', city: 'Valencia', tier: 'domestic', prestige: 4, minStars: 3 }, { n: 'Baskonia', city: 'Vitoria', tier: 'euroleague', prestige: 4, minStars: 4 }, { n: 'FC Barcelona', city: 'Barcelona', tier: 'euroleague', prestige: 5, minStars: 5 }, { n: 'Real Madrid', city: 'Madrid', tier: 'euroleague', prestige: 5, minStars: 5 } ] },
    france: { name: 'France', flag: '🇫🇷', league: 'LNB Betclic Élite', blurb: 'A talent factory (INSEP) that has sent a long line of players to the NBA, with a fast-growing EuroLeague presence.', clubs: [
      { n: 'INSEP Paris', city: 'Paris', tier: 'academy', prestige: 4, minStars: 1 }, { n: 'Cholet Basket', city: 'Cholet', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Limoges CSP', city: 'Limoges', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Nanterre 92', city: 'Nanterre', tier: 'domestic', prestige: 2, minStars: 1 }, { n: 'ASVEL Villeurbanne', city: 'Lyon', tier: 'euroleague', prestige: 4, minStars: 4 }, { n: 'AS Monaco', city: 'Monaco', tier: 'euroleague', prestige: 4, minStars: 4 }, { n: 'Paris Basketball', city: 'Paris', tier: 'euroleague', prestige: 4, minStars: 4 } ] },
    germany: { name: 'Germany', flag: '🇩🇪', league: 'BBL (Germany)', blurb: 'A rising basketball country: Bayern and ALBA anchor the EuroLeague and the domestic league is deep.', clubs: [
      { n: 'ALBA Berlin Youth', city: 'Berlin', tier: 'academy', prestige: 4, minStars: 1 }, { n: 'Ratiopharm Ulm', city: 'Ulm', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Würzburg Baskets', city: 'Würzburg', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'ALBA Berlin', city: 'Berlin', tier: 'euroleague', prestige: 4, minStars: 4 }, { n: 'FC Bayern Munich', city: 'Munich', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
    italy: { name: 'Italy', flag: '🇮🇹', league: 'Lega Basket Serie A', blurb: 'Tactical, physical basketball with proud clubs and a long history.', clubs: [
      { n: 'Stella Azzurra Roma', city: 'Rome', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'Dolomiti Energia Trento', city: 'Trento', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Reggio Emilia', city: 'Reggio Emilia', tier: 'domestic', prestige: 2, minStars: 1 }, { n: 'Virtus Bologna', city: 'Bologna', tier: 'euroleague', prestige: 5, minStars: 4 }, { n: 'Olimpia Milano', city: 'Milan', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
    serbia: { name: 'Serbia', flag: '🇷🇸', league: 'ABA League', blurb: 'The land of skilled big men and guards. Mega Basket is a development factory and Partizan and Crvena Zvezda are EuroLeague institutions.', clubs: [
      { n: 'FMP Beograd', city: 'Belgrade', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'Mega Basket', city: 'Belgrade', tier: 'domestic', prestige: 4, minStars: 2 }, { n: 'KK Partizan', city: 'Belgrade', tier: 'euroleague', prestige: 5, minStars: 4 }, { n: 'Crvena Zvezda', city: 'Belgrade', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
    slovenia: { name: 'Slovenia', flag: '🇸🇮', league: 'Slovenian League / ABA League', blurb: 'A tiny country with huge basketball pedigree. Olimpija is the home club, and the best leave for Spain young.', clubs: [
      { n: 'Olimpija Ljubljana Youth', city: 'Ljubljana', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'Cedevita Olimpija', city: 'Ljubljana', tier: 'domestic', prestige: 4, minStars: 2 }, { n: 'Krka Novo Mesto', city: 'Novo Mesto', tier: 'domestic', prestige: 2, minStars: 1 } ] },
    croatia: { name: 'Croatia', flag: '🇭🇷', league: 'ABA League', blurb: 'A basketball-mad country with a proud youth system in Zadar and Split.', clubs: [
      { n: 'Cibona Zagreb Youth', city: 'Zagreb', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'KK Zadar', city: 'Zadar', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'KK Split', city: 'Split', tier: 'domestic', prestige: 3, minStars: 2 } ] },
    lithuania: { name: 'Lithuania', flag: '🇱🇹', league: 'LKL', blurb: 'Basketball is the national religion. Žalgiris is a EuroLeague club and the fans are fierce.', clubs: [
      { n: 'Žalgiris Youth', city: 'Kaunas', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'Rytas Vilnius', city: 'Vilnius', tier: 'domestic', prestige: 4, minStars: 2 }, { n: 'Žalgiris Kaunas', city: 'Kaunas', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
    greece: { name: 'Greece', flag: '🇬🇷', league: 'Greek Basketball League', blurb: 'Olympiacos and Panathinaikos pack arenas and every game is a derby.', clubs: [
      { n: 'Panathinaikos Youth', city: 'Athens', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'PAOK Thessaloniki', city: 'Thessaloniki', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Olympiacos', city: 'Piraeus', tier: 'euroleague', prestige: 5, minStars: 4 }, { n: 'Panathinaikos', city: 'Athens', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
    turkey: { name: 'Turkey', flag: '🇹🇷', league: 'BSL', blurb: 'Big money and big crowds. Fenerbahçe and Anadolu Efes are EuroLeague regulars.', clubs: [
      { n: 'Darüşşafaka Youth', city: 'Istanbul', tier: 'academy', prestige: 3, minStars: 1 }, { n: 'Bahçeşehir Koleji', city: 'Istanbul', tier: 'domestic', prestige: 3, minStars: 2 }, { n: 'Anadolu Efes', city: 'Istanbul', tier: 'euroleague', prestige: 5, minStars: 4 }, { n: 'Fenerbahçe Beko', city: 'Istanbul', tier: 'euroleague', prestige: 5, minStars: 4 } ] },
  };
  const ORDER = ['uk', 'spain', 'france', 'germany', 'italy', 'serbia', 'slovenia', 'croatia', 'lithuania', 'greece', 'turkey'];
  const TIERS = { academy: { label: 'Youth / junior side', mins: 27, usg: 1.26, ts: 0.012, pace: 72, rank: 0, stock: -1.2 }, domestic: { label: 'Top domestic league', mins: 22, usg: 1.1, ts: 0, pace: 74, rank: 1, stock: 0.2 }, euroleague: { label: 'EuroLeague', mins: 18, usg: 0.88, ts: -0.01, pace: 71, rank: 2, stock: 2.6 } };
  // when a club can offer: the better the stars and the season, the higher the tier
  function clubsFor(country, stars, tierMin) {
    const c = COUNTRIES[country]; if (!c) return [];
    return c.clubs.map((x, i) => Object.assign({ id: country + ':' + i, country, flag: c.flag, league: c.league }, x)).filter((x) => x.minStars <= stars && (tierMin == null || TIERS[x.tier].rank >= tierMin));
  }
  const clubById = (id) => { const p = String(id || '').split(':'), c = COUNTRIES[p[0]]; return c && c.clubs[+p[1]] ? Object.assign({ id, country: p[0], flag: c.flag, league: c.league }, c.clubs[+p[1]]) : null; };
  // the best clubs anywhere a player of this level could move to (including abroad), above the tier he is at
  function moveOptions(st, current) {
    const stars = st.stars, last = st.collegeYears[st.collegeYears.length - 1], pf = last ? last.pf : 20, cur = TIERS[current.tier].rank, out = [];
    const boost = pf >= 34 ? 1.5 : pf >= 26 ? 1 : pf >= 18 ? 0 : -1;   // a big year opens doors a notch above the scouts' read
    ORDER.forEach((k) => { clubsFor(k, Math.min(5, Math.max(1, Math.round(stars + boost))), null).forEach((x) => { if (x.id !== current.id && (TIERS[x.tier].rank > cur || (TIERS[x.tier].rank === cur && x.prestige > current.prestige && x.country !== current.country))) out.push(x); }); });
    return out.sort((a, b) => TIERS[b.tier].rank - TIERS[a.tier].rank || b.prestige - a.prestige).slice(0, 5);
  }
  NBA.Intl = { COUNTRIES, ORDER, TIERS, clubsFor, clubById, moveOptions };
  if (typeof module !== 'undefined') module.exports = NBA;
})(typeof window !== 'undefined' ? window : globalThis);
