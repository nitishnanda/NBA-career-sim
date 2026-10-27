// press questions that draw on the career: every one fills its slots and some appear (rematches, earlier meetings, rookie year)
require(__dirname + '/../src/data.js');require(__dirname + '/../src/engine.js');require(__dirname + '/../src/league.js');
const N=require(__dirname + '/../src/game.js'),G=N.Game;
let seasons=0,pcs=0,withMem=0,bad=0,topics={},shown=0;
N.onSeasonLog=(st,rec)=>{seasons++;st.proSeasons.push(rec);const log=st.matchLog;
 log.forEach((x,i)=>{const isPc=(x.k==='g'&&x.pc&&!x.po)||(x.k==='hdr'&&x.ps!=null&&x.pc);if(!isPc)return;pcs++;const si=st.matchIdx;st.matchIdx=i;
  if(x.k==='hdr'){st.poPlans=Object.assign({},st.poPlans,{[x.ps]:'balanced'});}
  let pd=null;try{pd=G.pressOpen(st)}catch(e){bad++;console.log('ERR',e.stack.split('\n').slice(0,3).join('|'))}
  st.matchIdx=si;if(!pd)return;
  pd.qs.forEach(q=>{if(/mem:/.test(q.topic)){withMem++;topics[q.topic]=(topics[q.topic]||0)+1;if(/\{/.test(q.text)||q.opts.some(o=>/\{/.test(o.line))){bad++;console.log('UNFILLED',q.text)}if(/Finals|beat you|rookie/.test(q.text)&&shown++<4)console.log(pd.why,'|',q.text,'\n   ',q.opts.map(o=>o.label+': '+o.line.slice(0,70)).join('\n    '))}})
 });st.proSeasons.pop();};
for(let i=0;i<30;i++){N.setSeed(1300+i);const st=G.newCareer({name:'x'+i,pos:['SF','PG','C','PF'][i%4],arch:['scorer','twoway','defender'][i%3],stars:3+(i%3)});G.auto(st,{});}
console.log({seasons,pcs,withMem,bad,topics}); process.exit(bad||!withMem?1:0);
