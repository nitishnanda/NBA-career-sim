(function (g) {
  // The timeline: short posts in the voice of the feed after big games, trades, injuries, awards and press conferences. Hot takes, memes, breaking news, mourning, hype.
  // Slots: {name} {opp} {team} {city} {pts} {reb} {ast} {score} {n} {old} {slot} {award} {round} {coach}. Bank text is written, never scraped.
  const NBA = (g.NBA = g.NBA || {});
  const HANDLES = ['hoopsgremlin', 'courtside.cj', 'lakeshow_lenny', 'bucketsbyjess', 'nba.tok.daily', 'no_cap_hoops', 'rimrattler23', 'mvp_or_bust', 'sixthman.szn', 'ankle.breaker', 'fadeaway.fran', 'buzzerbeaterbae', 'dunkcity_dre', 'triple.dub', 'hardwood.heaven', 'swish.the.dish', 'film.room.fiona', 'glass.cleaner.gus', 'zone.defense.zo', 'lob.city.lou', 'bench.mob.mia', 'pickandpop.pete', 'fastbreak.finn', 'and1.annie', 'whistle.watcher'];
  const NEWS = ['hoops.insider ✓', 'nba.central ✓', 'the.hardwood.report ✓', 'courtside.wire ✓', 'trade.desk ✓'];
  const BANK = {
    big: ['{name} just dropped {pts} on the {opp} and i am still shaking 😭🔥', '{pts} POINTS?? {name} said "i am him" and meant it', 'box score check: {pts}/{reb}/{ast}. someone tell the {opp} to log off', 'this {name} game belongs in a museum 🖼️', 'nobody: ... {name} vs the {opp}: {pts} points. nobody was ready', 'hot take: {name} is a top 5 player in the league rn. do not @ me', 'the {opp} defender after that game: 🫠', 'i need {name}\'s trainer\'s number immediately', '{pts}!!! put it on the poster 🔥🔥', 'the way {name} just cooked the {opp} should be illegal'],
    td: ['triple-double szn!! {name} {pts}-{reb}-{ast} we are so back', 'he is just doing everything lol {pts}/{reb}/{ast}', '{name} got a triple-double and probably a nap 💤', 'the stat sheet looks like a typo: {pts}/{reb}/{ast} 😭', 'positionless basketball is beautiful and {name} is the proof', 'a triple-double against the {opp}?? casual.'],
    winner: ['GAME WINNER 🥶 {name} has ice in his veins', 'the way the arena EXPLODED omg', 'clutch gene is real and {name} has it', '{opp} fans: 😐😐😐', 'i screamed so loud my neighbors called me', 'buzzer beater szn!! {name} is different in the clutch', '{name} just did that. at the buzzer. against the {opp}. i am fine. i am not fine.'],
    miss: ['not {name} missing the last shot 😭 i cannot', 'the ball rimmed out and so did my soul', 'it is a make-or-miss league and he missed. we move 🙏', 'the {opp} got away with one tonight', 'hot take: that shot was a good shot. do not hate on {name}'],
    bad: ['{name} on {pts} points?? it is giving off night 😬', 'we all have those days king 🙏', 'hot take: he is fine. one bad game does not mean anything', 'the timeline is already cooked on this one 💀', 'that was not {name}. that was his cousin 😭', '{pts} points... we will not be speaking of this game'],
    win: ['W W W {team} is so back 🔥', '{score} against the {opp}!! lets goooo', 'the {team} are not playing around this year fr', 'beat the {opp} and did it with swagger', 'another day, another W. the vibes are immaculate ✨'],
    loss: ['that loss was painful to watch 😭', '{team} fans rn: 🪦', 'can we talk about the {opp} game or are we pretending?', 'front office... say something', '{score}. i need a minute', 'i told myself i would stay calm. i did not.'],
    streakW: ['{n} straight wins!! the {team} are not playing around', 'this team is clicking, nobody wants these smoke', '{n} in a row and the vibes are unmatched', 'ok the {team} are actually good?? when did this happen'],
    streakL: ['{n} losses in a row... is it time to panic?? asking for a friend', 'the vibes at the {city} arena rn: 🪦', '{n} straight L\'s. someone call the group chat', 'rebuild?? retool?? someone tell us anything'],
    blowoutWin: ['{score}. the {opp} never stood a chance 😭', 'we are playing with house money tonight', 'the {team} just did a bit and the bit was destroying the {opp}'],
    blowoutLoss: ['{score}?? i am going to bed', 'the {opp} game was a hostage situation', 'pretend that never happened pls 😭'],
    po: ['{team} moving on!!! 🏆', 'round {round}, here we come 🔥', 'the {team} are not done yet', 'playoff {name} is a different breed fr'],
    elim: ['season over. thank you for the memories {name} 🥹', 'we go again next year 🙏', 'i am not crying you are crying', 'the {opp} were better. it hurts to say. but they were.'],
    champ: ['CHAMPIONS 🏆🏆🏆 {name} you did it', 'i am crying at work rn', 'run it back!!', 'legacy secured, no debate', 'the {team} are champions. say it again. THE {team} ARE CHAMPIONS'],
    playin: ['play-in szn is a heart attack every time 😭', 'win or go home and i am so scared', 'the play-in is the best and worst thing in sports'],
    trade: ['BREAKING: {name} traded to the {team}!! wild', '{name} in a {team} jersey is going to look weird 😭', '{old} fans in mourning rn 🪦', 'hot take: this trade makes the {team} contenders', 'my fantasy team just got a lot more interesting', 'the trade machine did not predict this one'],
    tradeReq: ['{name} wants out?? the drama is back', 'the {old} front office right now: 😬', 'hot take: if you want out, you get out. loyalty is a two-way street', 'trade request szn and i am here for the chaos'],
    sign: ['{name} signs with the {team}!! free agency szn', 'the {team} just did something smart for once', '{name} to the {team} is a vibe', 'free agency has been wild and this one is wilder'],
    resign: ['{name} stays with the {team}!! loyalty 🥹', 'run it back {team} fans!!', 'the {team} locked him up. good business.'],
    waived: ['{name} waived?? what are the {team} doing', 'rough business. someone sign him immediately', 'the NBA is a cold place sometimes 🥶'],
    injury: ['praying for {name} 🙏 this is not good', 'please be okay please be okay please be okay', 'injuries ruin everything 😭', 'the league needs {name} healthy. that is it that is the tweet'],
    ret: ['HE IS BACK!! {name} returns tonight', 'the comeback arc is real 🥹', '{name} is back and the building is LOUD'],
    award: ['{name} wins {award}!! about time 🔥', '{award} to {name}!! lock in', 'the {award} could not have gone to a better person', 'congrats {name}!! the grind pays off 🙏'],
    allstar: ['{name} is an ALL-STAR!! 🌟', 'All-Star {name} has a nice ring to it', 'vote count did not lie for once'],
    draft: ['{name} goes #{slot} to the {team}!! a new era', '{team} fans are going to love this kid', 'draft night chaos 🎬', '{name} to the {team} at #{slot}. interesting. very interesting.'],
    retire: ['thank you {name} 🥹 end of an era', 'retirement posts hitting different today', 'first ballot, no debate', 'i grew up watching {name}. i cannot believe this is it'],
    endorse: ['{name} just signed with {brand} and the timeline is not ready for the commercial 😭', 'the {brand} deal?? he is officially a brand now', 'every billboard in {city} is about to be {name}', 'hot take: {name} is the most marketable player in the league. fight me'],
    jersey: ['{name} jersey going up in the rafters 🥹 the {team} are retiring #{num}', 'i am not crying, you are crying. #{num} forever', 'the {team} just made {name} immortal', 'raise it to the rafters. no debate.'],
    hof: ['{name} in the Hall of Fame!! the speech, i am emotional', 'first ballot energy 🏛️ {name} is immortal', 'the Hall of Fame class just got so much better'],
    path: ['{name} is back in basketball in a new role and i love it', 'legends never really leave 🥹', 'hot take: {name} is going to be great at this too'],
    three: ['{name} just won the Three-Point Contest!! the stroke is clean 🔥', 'the final round was a heart attack and {name} did not blink', 'three-point champion {name} has a nice ring to it', 'hot take: {name} should shoot a money ball every possession'],
    dunk: ['{name} just won the dunk contest!! that last one?? 😭', 'the perfect 50 was deserved. i have watched it eleven times', 'dunk contest is back and {name} saved it', 'the clip of the weekend belongs to {name}'],
    asmvp: ['{name} is the All-Star Game MVP!! 🏆', 'All-Star MVP {name}. the vibes this weekend were immaculate', 'the whole league wanted it and {name} took it'],
    snub: ['{name} left off the All-Star team?? the voters are not watching the games 😭', 'the All-Star snub list this year is criminal and {name} is at the top', 'hot take: {name} was snubbed and everybody knows it', 'coaches really said no to {name}. unbelievable.'],
    contract: ['{name} just got ${salary}M a year?? the {team} are not playing around 💰', '${salary}M. {years} years. {name} is set and so is the {team}', 'the {team} paid {name} ${salary}M a year and honestly he earned it', 'someone check the {team} bank account, {name} just signed for ${salary}M 😭'],
    rival: ['the {name} vs {rival} rivalry is the best thing in the league right now', '{name} and {rival} again?? i love this', 'the whole league is picking a side: {name} or {rival} 👀'],
    hot: ['hot take: the best player in the league is not even in the MVP conversation', 'ranking the top 5 rn and nobody is happy with their spot', 'unpopular opinion: defense wins more than offense in the playoffs. fight me', 'the league is so deep this year it is actually crazy', 'hot take: the {team} are a sleeper and nobody is talking about it', 'we need to talk about how good {name} actually is'],
    coach: ['the {team} fired the coach?? the timing is wild', 'new coach, new vibes. let us see if it works 🙏', 'hot take: it was never the coach, it was the roster'],
    friend: ['{name} and the squad are so tight it is giving best friends 🥹', 'locker room chemistry cannot be faked and this is real'],
    beef: ['is there beef in the {team} locker room?? asking for the timeline', 'the {team} drama is better than my favorite show'],
  };
  // breaking-news framing for events that deserve it
  const NEWSY = { trade: 'BREAKING: {name} has been traded to the {team}, sources say.', tradeReq: 'Sources: {name} has requested a trade from the {old}.', sign: 'Sources: {name} agrees to terms with the {team}.', resign: '{name} re-signs with the {team}.', waived: '{name} has been waived by the {team}.', injury: 'Update: {name} is out with an injury, the {team} confirm.', draft: 'With the #{slot} pick, the {team} select {name}.', retire: 'BREAKING: {name} announces his retirement.', coach: 'The {team} have made a coaching change.' };
  const BASE = { champ: 90000, award: 40000, trade: 32000, retire: 70000, big: 28000, td: 22000, winner: 36000, draft: 30000, tradeReq: 26000, injury: 30000, sign: 20000 };
  const fill = (s, c) => String(s).replace(/\{(\w+)\}/g, (m, k) => (c[k] != null && c[k] !== false ? String(c[k]) : ''));
  // `n` posts for an event: a breaking-news line first where the kind has one, then the timeline's reactions
  function posts(kind, c, rnd, n) {
    const bank = (BANK[kind] || BANK.hot).slice(), out = [], handles = HANDLES.slice(), base = BASE[kind] || 9000;
    const likes = (m) => Math.max(12, Math.round(Math.pow(rnd(), 2.2) * base * m));
    if (NEWSY[kind]) out.push({ who: '@' + NEWS[Math.floor(rnd() * NEWS.length)], text: fill(NEWSY[kind], c), likes: likes(1.3), news: true });
    while (out.length < (n || 3) && bank.length) { const t = bank.splice(Math.floor(rnd() * bank.length), 1)[0]; out.push({ who: '@' + handles.splice(Math.floor(rnd() * handles.length), 1)[0], text: fill(t, c), likes: likes(1) }); }
    return out;
  }
  NBA.Feed = { posts, BANK, HANDLES };
})(typeof window !== 'undefined' ? window : globalThis);
