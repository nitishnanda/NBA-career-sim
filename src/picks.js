(function (g) {
  // Draft pick ownership. Every club owns its own first- and second-round picks for the next four drafts; trades move real picks, and the draft order is the picks' owners.
  // L.picks maps "year|round|originalTeam" to { y, r, orig, owner }; it lives in the league so a replayed season restores it with everything else.
  const NBA = (g.NBA = g.NBA || {});
  const key = (y, r, o) => y + '|' + r + '|' + o;
  function ensure(L) {
    const P = L.picks || (L.picks = {});
    for (let y = L.year; y <= L.year + 3; y++) for (let r = 1; r <= 2; r++) L.teams.forEach((t) => { const k = key(y, r, t.id); if (!P[k]) P[k] = { y, r, orig: t.id, owner: t.id }; });
    Object.keys(P).forEach((k) => { if (P[k].y < L.year) delete P[k]; });   // drafted already
    return P;
  }
  const ownerOf = (L, y, r, orig) => { const p = ensure(L)[key(y, r, orig)]; return p ? p.owner : orig; };
  const ofTeam = (L, id) => { const P = ensure(L); return Object.keys(P).map((k) => P[k]).filter((p) => p.owner === id).sort((a, b) => a.y - b.y || a.r - b.r || a.orig - b.orig); };
  const ordinal = (r) => (r === 1 ? 'first' : 'second');
  const label = (L, p) => p.y + ' ' + ordinal(p.r) + '-round pick' + (p.orig !== p.owner && L.teams[p.orig] ? ' (' + L.teams[p.orig].nick + ')' : '');
  const textOf = (L, list, giverId) => { if (!list.length) return ''; const x = list.map((p) => p.y + ' ' + ordinal(p.r) + '-round pick' + (p.orig === giverId ? '' : ' (from ' + (L.teams[p.orig] ? L.teams[p.orig].nick : '?') + ')')); return x.length > 1 ? x.slice(0, -1).join(', ') + ' and ' + x[x.length - 1] : x[0]; };
  // the picks a club would part with: nearest first-rounders are the most valuable; `firsts` says how many first-rounders (the rest are seconds)
  function take(L, fromId, firsts, seconds, rnd) {
    const mine = ofTeam(L, fromId), f = mine.filter((p) => p.r === 1), s = mine.filter((p) => p.r === 2), out = [];
    f.slice().sort(() => (rnd ? rnd() - 0.5 : 0)).slice(0, firsts).forEach((p) => out.push(p));
    s.slice().sort(() => (rnd ? rnd() - 0.5 : 0)).slice(0, seconds).forEach((p) => out.push(p));
    return out;
  }
  function give(L, list, toId) { const P = ensure(L); list.forEach((p) => { const q = P[key(p.y, p.r, p.orig)]; if (q) q.owner = toId; }); return list; }
  const keysOf = (list) => list.map((p) => key(p.y, p.r, p.orig));
  function giveKeys(L, keys, toId) { const P = ensure(L); (keys || []).forEach((k) => { if (P[k]) P[k].owner = toId; }); }
  const fromKeys = (L, keys) => { const P = ensure(L); return (keys || []).map((k) => P[k]).filter(Boolean); };
  NBA.Picks = { ensure, ownerOf, ofTeam, label, textOf, take, give, keysOf, giveKeys, fromKeys, key };
})(typeof window !== 'undefined' ? window : globalThis);
