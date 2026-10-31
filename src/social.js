(function (g) {
  // Your following: how many people follow you, what moves it (rating, awards, brand, the press, going viral) and what it is worth (sponsors pay for reach).
  // The number lives in the decision flags (thousands), so it survives a season replay. Human careers only.
  const NBA = (g.NBA = g.NBA || {});
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const flags = (st) => NBA.Decisions.state(st).flags;
  const slug = (n) => String(n || 'hooper').toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
  function state(st) {
    const f = flags(st);
    if (!f.social) { const slot = st.draft && st.draft.slot ? st.draft.slot : 61; f.social = { f: Math.round(15 + 70 * Math.max(0, (st.stars || 3) - 2) + (slot <= 3 ? 400 : slot <= 10 ? 220 : slot <= 30 ? 90 : 10)), handle: '@' + slug(st.player.name), verified: false, hist: [], gain: 0, year: null }; }
    return f.social;
  }
  const fmt = (k) => (k >= 1000 ? (k / 1000 >= 10 ? Math.round(k / 1000) : Math.round(k / 100) / 10) + 'M' : k >= 10 ? Math.round(k) + 'K' : Math.round(k * 10) / 10 + 'K');
  // a post goes big, or a decision lands: change the following by a share of itself
  function change(st, pct, why) {
    if (st.autoPlay) return 0; const s = state(st), d = Math.round(s.f * pct * 10) / 10; s.f = Math.max(5, s.f + d); s.gain = (s.gain || 0) + d; s.verified = s.verified || s.f >= 500; if (why) s.last = why; return d;
  }
  // events on the feed bring followers in proportion to how far their best post travelled
  const KIND_W = { champ: 0.12, award: 0.1, retire: 0.1, big: 0.06, td: 0.05, winner: 0.08, trade: 0.05, draft: 0.12, sign: 0.04, resign: 0.03, allstar: 0.08, three: 0.1, dunk: 0.12, asmvp: 0.1, contract: 0.04 };
  function bump(st, kind, posts) {
    if (st.autoPlay || !KIND_W[kind]) return; const top = Math.max.apply(null, (posts || []).map((p) => p.likes || 0).concat([0])); const s = state(st);
    const d = clamp(top / 1000 * KIND_W[kind], 0.05, s.f * 0.04); s.f += d; s.gain = (s.gain || 0) + d;
  }
  // once a year, at the offseason: the following drifts toward what you were this year
  function year(st) {
    const L = st.league, s = state(st); if (s.year === L.year) return s; s.year = L.year; const p = st.player, rec = st.proSeasons[st.proSeasons.length - 1], a = (rec && rec.awards) || [], b = st.brand ? st.brand.score : 0;
    let pop = 0.5 * (NBA.ovr(p) - 55) + 0.45 * b + 1.2 * clamp(flags(st).media || 0, -8, 8);
    if (a.includes('All-Star')) pop += 4; if (a.some((x) => /^All-NBA/.test(x))) pop += 6; if (a.includes('MVP')) pop += 14; if (a.includes('NBA Champion')) pop += 10; if (a.includes('Finals MVP')) pop += 6;
    const target = clamp(25 * Math.exp(0.1 * pop), 20, 100000), before = s.f;
    s.f = Math.round(s.f + (target - s.f) * (target > s.f ? 0.5 : 0.12));
    s.hist.push({ y: L.year, f: s.f, d: Math.round(s.f - before + (s.gain || 0) * 0), g: Math.round(s.f - (s.hist.length ? s.hist[s.hist.length - 1].f : s.f)) }); s.hist = s.hist.slice(-20); s.gain = 0; s.verified = s.verified || s.f >= 500;
    return s;
  }
  // sponsors pay for reach: about -15% under 100K, up to +35% over 20M
  const mult = (st) => { const s = flags(st).social; return s ? clamp(0.9 + 0.12 * Math.log10(Math.max(1, s.f) / 200), 0.85, 1.35) : 1; };
  NBA.Social = { state, change, bump, year, mult, fmt, slug };
})(typeof window !== 'undefined' ? window : globalThis);
