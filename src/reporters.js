(function (g) {
  // The press room as a cast: recurring reporters with habits, a media image built from what you say, callbacks to your own quotes, feuds, headlines and the fan feed.
  // Rows for callbacks and feuds: [condition, heat, question, humble, confident, joke, deflect, trash, fight]  (same layout as the other banks).
  const NBA = (g.NBA = g.NBA || {});
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // who is in the room: fictional names, real outlets (private build). `style` decides what they ask about; `edge` how hard.
  const REPORTERS = [
    { id: 'whit', name: 'Dana Whitfield', outlet: 'ESPN', style: 'news', edge: 0.4, topics: ['game', 'playoffs', 'stakes', 'team', 'farewell', 'leg', 'awards'] },
    { id: 'doyle', name: 'Mack Doyle', outlet: 'The Athletic', style: 'stats', edge: 0.3, topics: ['form', 'awards', 'mile', 'style', 'bubble', 'mem', 'game'] },
    { id: 'raman', name: 'Priya Raman', outlet: 'Bleacher Report', style: 'buzz', edge: 0.9, topics: ['rival', 'revenge', 'refs', 'biz', 'feud', 'callback', 'media'] },
    { id: 'kess', name: 'Tom Kessler', outlet: 'Sports Illustrated', style: 'story', edge: 0.5, topics: ['leg', 'mem', 'farewell', 'callback', 'young', 'vet', 'draftq'] },
    { id: 'ortiz', name: 'Lena Ortiz', outlet: 'Yahoo Sports', style: 'friendly', edge: 0.1, topics: ['fun', 'hometown', 'mate', 'young', 'vet', 'media', 'crowd'] },
  ];
  const BEAT_FIRST = ['Gus', 'Maya', 'Dev', 'Rosa', 'Hal', 'June', 'Omar', 'Tess'], BEAT_LAST = ['Pereira', 'Lindqvist', 'Banerjee', 'Okafor', 'Delaney', 'Moreau', 'Kowalski', 'Haddad'];
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  // the local beat writer of the player's club: friendly, asks about the team
  const beatFor = (team) => { const h = hashStr(team.name || team.nick || 'team'); return { id: 'beat', name: BEAT_FIRST[h % 8] + ' ' + BEAT_LAST[(h >>> 3) % 8], outlet: (team.city || team.nick) + ' Gazette', style: 'beat', edge: 0.2, topics: ['team', 'coach', 'mate', 'bubble', 'biz', 'health', 'game'] }; };

  // a reporter for a question: whose habits fit its topic and heat, nudged by how they feel about you (a reporter you have burned goes after you)
  function reporterFor(team, q, rep, rnd) {
    const cast = REPORTERS.concat([beatFor(team)]);
    const topic = String(q.topic || '').split(':')[0], sub = String(q.topic || '').split(':')[1] || '';
    const w = cast.map((r) => {
      let x = 0.6; if (r.topics.indexOf(topic) >= 0 || r.topics.indexOf(sub) >= 0) x += 2.2;
      x += (q.heat || 0) * (r.edge - 0.3) * 1.4;
      const mood = (rep && rep[r.id] && rep[r.id].m) || 0; if (mood <= -2) x += 0.8 * r.edge; if (mood >= 2 && r.style === 'friendly') x += 0.4;
      return Math.max(0.1, x);
    });
    let t = rnd() * w.reduce((a, b) => a + b, 0), pick = cast[cast.length - 1];
    for (let i = 0; i < cast.length; i++) { t -= w[i]; if (t <= 0) { pick = cast[i]; break; } }
    return { id: pick.id, name: pick.name, outlet: pick.outlet, style: pick.style };
  }
  // how a reporter takes your answer: humble and funny answers warm the friendly ones, trash talk is gold for the buzz writers and a problem for the others, a brush-off annoys everybody
  const MOOD = { humble: { news: 0.2, stats: 0.1, buzz: -0.2, story: 0.3, friendly: 0.4, beat: 0.4 }, confident: { news: 0.2, stats: 0.1, buzz: 0.2, story: 0.2, friendly: 0.1, beat: 0.1 }, joke: { news: 0, stats: -0.1, buzz: 0.1, story: 0, friendly: 0.4, beat: 0.2 },
    deflect: { news: -0.3, stats: -0.3, buzz: -0.5, story: -0.3, friendly: -0.2, beat: -0.2 }, trash: { news: -0.2, stats: -0.2, buzz: 0.5, story: 0, friendly: -0.3, beat: -0.2 }, fight: { news: -0.4, stats: -0.4, buzz: 0.4, story: -0.3, friendly: -0.5, beat: -0.4 } };
  const moodFor = (tone, style) => (MOOD[tone] && MOOD[tone][style]) || 0;

  // the media image: what you have mostly been in the last dozen answers
  const PERSONAS = {
    villain: { label: 'The Villain', blurb: 'You talk trash and the room loves a heel: more heat, more feuds.' },
    humble: { label: 'The Humble Leader', blurb: 'Team first, every time: reporters ask about your teammates and your locker room.' },
    entertainer: { label: 'The Entertainer', blurb: 'The press room is your stage: lighter questions, more laughs.' },
    guarded: { label: 'The Guarded One', blurb: 'You say very little and they keep digging for more.' },
    confident: { label: 'The Confident One', blurb: 'You back yourself: they ask about awards, titles and what you are chasing.' },
    open: { label: 'Unwritten', blurb: 'The media is still working out who you are.' },
  };
  function personaOf(tally) {
    const t = (tally || []).slice(-12); if (t.length < 4) return 'open';
    const c = (k) => t.filter((x) => x === k).length, n = t.length;
    if (c('trash') + c('fight') >= 3 && (c('trash') + c('fight')) / n >= 0.28) return 'villain';
    if (c('joke') / n >= 0.3) return 'entertainer';
    if (c('deflect') / n >= 0.4) return 'guarded';
    if (c('humble') / n >= 0.4) return 'humble';
    if (c('confident') / n >= 0.4) return 'confident';
    return 'open';
  }
  // what the image does to which questions get asked
  const PERSONA_TOPICS = { villain: ['rival', 'revenge', 'feud', 'refs', 'media'], humble: ['team', 'mate', 'coach', 'young', 'vet'], entertainer: ['fun', 'media', 'hometown'], guarded: ['callback', 'biz', 'stakes'], confident: ['awards', 'stakes', 'leg', 'playoffs'] };

  // callbacks to something you said: {quote} {opp} {score} {when}
  const CALLBACKS = [
    ['cbTrashLoss', 1, '{when} you said "{quote}" before facing the {opp}, and then you lost {score}. Do you regret the talk?', 'Looking back, I should have let the game talk. I own that.', 'No regrets. I said it, we lost, and I will answer it on the floor.', 'In hindsight I would have said something less quotable. A haiku, maybe.', '', '', ''],
    ['cbTrashWin', 1, '{when} you said "{quote}" about the {opp}, and then you backed it up: {score}. Do you feel vindicated?', 'It worked out. But it was the team that did it, not the talk.', 'Vindicated? I told you. I do not say things I cannot back up.', 'I would like to thank me for being right. Please clap.', '', 'I said it and I meant it. They did not like it. Too bad.', ''],
    ['cbConfLoss', 0, '{when} you told us "{quote}", and then you lost to the {opp}, {score}. Was that confidence misplaced?', 'Maybe I was too sure. I respect them, and we have to be better.', 'Confidence is not misplaced. We lost a game. We did not lose who we are.', 'I was extremely confident and extremely wrong. A classic combination.', '', '', ''],
    ['cbConfWin', 0, '{when} you said "{quote}" and the {opp} game went just as you said, {score}. Do you see yourself as someone who delivers?', 'I just try to do my part. The guys around me deliver too.', 'I do. That is the point of saying it out loud.', 'I deliver. I also deliver pizza on weekends. Very versatile.', '', '', ''],
    ['cbJoke', 0, '{when} you joked "{quote}" in this room. Is there ever a question you take seriously?', 'More than you would think. The jokes are how I stay loose.', 'Plenty. But I like laughing. It is how I play my best.', 'This question? No. Next.', '', '', ''],
    ['cbHumble', 0, 'You keep crediting your teammates ("{quote}"). Is that genuine, or is it the script?', 'It is genuine. I have been carried by good people my whole career.', 'It is genuine. And I also know what I bring. Both are true.', 'It is a script. The script is just also true.', '', '', ''],
    ['cbFight', 2, '{when} you got heated in this room: "{quote}". Does that version of you ever come back?', 'That was not my best moment. I am working on being better than that.', 'He is always there. He just has to be needed.', 'He comes back when someone parks in my spot.', '', 'If somebody gives him a reason, yes.', ''],
    ['cbDeflect', 0, 'You have been pretty guarded with us lately ("{quote}"). Is there something you are holding back?', 'Nothing dramatic. I just do not want to make things about me.', 'No. I just do my talking on the floor.', 'Holding back? I have never held back a snack in my life.', '', '', ''],
  ];
  // a feud with an opposing star that your own words started: {oppStar} {quote}
  const FEUDS = [
    ['feud', 2, '{oppStar} responded to what you said about him ("{quote}"). He called you all talk. Where does this stand?', 'It does not need to be a thing. I respect him, and I have to focus on my team.', 'It stands where it did. I said it, and I am ready for him.', 'He called me all talk? Then he should listen: I am talking right now.', '', 'Then he should be ready. I am not going anywhere.', 'Say it to my face, {oppStar}. Right here.'],
    ['feud', 2, 'The league is calling it a feud between you and {oppStar}. Is that fair?', 'It is not a feud. It is competition. It makes both of us better.', 'Call it what you want. I like it.', 'A feud? I do not have the time. I have laundry.', '', 'You want a feud? He started it, I will finish it.', ''],
    ['feud', 1, 'Fans are picking sides between you and {oppStar} after your comments. Do you enjoy it?', 'I do not pay attention to sides. I just want to win.', 'I enjoy it a little. Attention comes with being good.', 'I have been picked last my whole life. Being picked at all is nice.', '', '', ''],
  ];

  // the headline the press room runs: {name} {opp} {team} {quote}
  const HEADLINES = {
    humble: ['{name} puts the team first: "It is not about me"', '{name} hands the credit to his teammates', 'Class act: {name} praises the {team} locker room'],
    confident: ['{name} is ready: "I like where I am"', '{name} sends a message: confidence is high in {team}', 'No doubt in {name}\'s voice ahead of the {opp}'],
    joke: ['{name} has the press room in stitches', 'Comedy hour: {name} cracks up reporters', '{name} keeps it light before the {opp}'],
    deflect: ['{name} keeps it short with reporters', 'Few words from {name}: "{quote}"', '{name} says little, and reporters want more'],
    trash: ['{name} fires shots at the {opp}: "{quote}"', '{name} turns up the heat on the {opp}', 'Trash talk alert: {name} vs the {opp}'],
    fight: ['{name} loses his cool in the press room', 'Things get heated: {name} challenges the {opp}', '{name} comes out swinging: "{quote}"'],
  };
  const FAN_HANDLES = ['hoopsgremlin', 'courtside.cj', 'lakeshow_lenny', 'bucketsbyjess', 'nba.tok.daily', 'no_cap_hoops', 'rimrattler23', 'mvp_or_bust', 'sixthman.szn', 'ankle.breaker', 'fadeaway.fran', 'buzzerbeaterbae', 'dunkcity_dre', 'triple.dub', 'hardwood.heaven', 'swish.the.dish'];
  // the fan feed: short posts in the voice of the timeline. {name} {opp} {team}
  const FANS = {
    humble: ['bro really said team first and meant it 🥹 respect', 'this is why i fw {name} fr', 'no ego at all?? {team} fans we are so blessed 🙏', 'the way he gave his teammates flowers... leader behavior', 'humble king 🤝 love to see it', 'tell me you are a good dude without telling me you are a good dude'],
    confident: ['said it with his chest 🔥', 'confidence at 100 rn you can feel it', '{name} not scared of nobody 😭', 'ok ok i believe him lowkey', 'this man woke up and chose greatness', 'the aura is crazy rn 😤'],
    joke: ['{name} is so funny why is he not doing stand up 😭😭', 'the presser was better than the game fr', 'i am screaming at the reporters face 💀', 'he ate that. no crumbs', 'why is he so funny i cannot 😭', 'press conference MVP goes to {name}'],
    deflect: ['bro gave the one game at a time speech again 🥱', 'say less king', 'pr trained fr', 'nothing to see here 😭', 'he said nothing and still made a headline lol', 'the media team in the back: 😬'],
    trash: ['{opp} fans in shambles rn 😭🔥', 'he said WHAT 💀', 'this is either gonna age like wine or milk no in between', '{opp} locker room bulletin board just got updated', 'the trash talk is back baby 🔥🔥', 'bro is cooking (the beef)'],
    fight: ['BRO WHAT 😭😭😭', 'someone get this man a lawyer', 'the league office is typing... 💀', 'this is gonna be a fine fr', 'he really said that on camera 😭', 'it is giving beef szn 🥩'],
  };
  const FANS_WIN = ['and then he backed it up!! W 🔥', 'receipts delivered fr', 'W press conference W game', 'we are so back'];
  const FANS_LOSS = ['after that loss?? 💀 bold', 'the L hurts but he still showed up 🙏', 'it is giving fall off but ok', 'we need to talk about this team after tonight 😭'];

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  const fill = (s, c) => String(s).replace(/\{(\w+)\}/g, (m, k) => (c[k] != null && c[k] !== false ? String(c[k]) : ''));
  // three or four posts for the fan feed (from the bank, plus anything Claude wrote for a typed answer)
  function fanPosts(tone, c, result, extra, rnd) {
    const bank = (FANS[tone] || FANS.deflect).slice(), out = [], handles = FAN_HANDLES.slice();
    const take = (arr) => { if (!arr.length) return; const i = Math.floor(rnd() * arr.length); out.push(arr.splice(i, 1)[0]); };
    (extra || []).slice(0, 2).forEach((t) => out.push(String(t).slice(0, 160)));
    while (out.length < 3 && bank.length) take(bank);
    if (result === 'W') take(FANS_WIN.slice()); else if (result === 'L') take(FANS_LOSS.slice());
    return out.slice(0, 4).map((t) => { const h = handles.splice(Math.floor(rnd() * handles.length), 1)[0] || 'hoopsfan'; return { who: '@' + h, text: fill(t, c) }; });
  }
  const headlineFor = (tone, c, quote, rnd) => fill(pick(HEADLINES[tone] || HEADLINES.deflect, rnd), Object.assign({}, c, { quote: String(quote || '').replace(/^[“"]|[”"]$/g, '').slice(0, 70) }));

  NBA.Reporters = { REPORTERS, beatFor, reporterFor, moodFor, PERSONAS, personaOf, PERSONA_TOPICS, CALLBACKS, FEUDS, HEADLINES, FANS, fanPosts, headlineFor, mulberry };
})(typeof window !== 'undefined' ? window : globalThis);
