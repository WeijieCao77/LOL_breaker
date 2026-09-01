/* ================= 动态宿敌 =================
   不预设「中单就打 Faker」——谁淘汰过你、谁在决赛赢过你、
   谁抢走你的荣誉，谁才是你的宿敌。每个位置都有戏。 */

function rivalKey(p){ return p.id; }
function ensureRivals(){ if(!S.rivals) S.rivals={}; }

/* 记仇：weight 越大越难忘 */
function noteGrudge(teamName,weight,reason){
  ensureRivals();
  const t=findTeam(teamName); if(!t) return;
  // 记的是对位那个人，不是整支队
  const foe=t.players.find(p=>p.pos===S.pos)||t.players[0];
  if(!foe) return;
  const k=rivalKey(foe);
  const r=S.rivals[k]||(S.rivals[k]={id:foe.id,cn:foe.cn||"",pos:foe.pos,
                                     team:teamName,heat:0,log:[],beat:0,lost:0});
  r.team=teamName; r.heat+=weight; r.lost++;
  r.log.push(`${SEASONS[S.si].tag}${SPLITS[S.split||0]}：${reason}`);
  if(r.heat>=6&&!r.declared){
    r.declared=true;
    pushEvent(`<b>${foe.id}</b>${foe.cn?`（${foe.cn}）`:""} 又一次挡在你面前。${reason}——<b>这个名字你记住了。</b>`,"bad","宿敌");
  }
}
/* 复仇：赢回来 */
function noteRevenge(teamName){
  ensureRivals();
  const t=findTeam(teamName); if(!t) return;
  const foe=t.players.find(p=>p.pos===S.pos)||t.players[0];
  if(!foe) return;
  const r=S.rivals[rivalKey(foe)];
  if(!r||!r.declared) return;
  r.beat++; r.heat=Math.max(0,r.heat-4);
  pushEvent(`<b>${S.team}</b> 击败 ${teamName}。<b>${foe.id}</b> 这一次输给了你——${
    r.beat>=r.lost?"这笔账算平了。":"但账还没算完。"}`,"big","宿敌");
  if(r.beat>=r.lost&&typeof checkAch==="function") checkAch("revenge");   // 审计：钩子缺失
}
function topRival(){
  ensureRivals();
  const arr=Object.values(S.rivals).filter(r=>r.declared).sort((a,b)=>b.heat-a.heat);
  return arr[0]||null;
}
/* 宿敌在场时，你会更投入（心态高的人享受这个，心态低的人被压住） */
function rivalBoost(oppTeam){
  const r=topRival();
  if(!r||r.team!==oppTeam) return 0;
  const m=(S.attrs.心态-52)/14;
  return clamp(m,-2.2,2.6);
}

/* 界面卡片 */
function rivalCard(){
  const r=topRival();
  if(!r) return "";
  const meeting=S.schedule&&S.schedule[S.week-1]===r.team;
  return `<div class="card"><h2>宿敌<em>${r.beat}胜 ${r.lost}负</em></h2>
    <h3>${typeof avatarOf==="function"?avatarOf(r,30):""} ${r.id}${r.cn?`（${r.cn}）`:""} <span class="tag">${POSN[r.pos]}</span>
      <span class="tag g">${r.team}</span></h3>
    <p class="note" style="margin-top:2px">${meeting
      ? '<b style="color:var(--gold)">本周就是他。</b>'
      : "还没轮到，但这个赛季总会碰上。"}</p>
    <div class="log" style="max-height:120px">${r.log.slice(-4).reverse()
      .map(x=>`<div>${x}</div>`).join("")}</div></div>`;
}
