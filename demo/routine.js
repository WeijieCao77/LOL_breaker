/* ================= 重复上回合 · 训练计划 =================

   一局要点三百多次训练按钮，其中大部分是「跟上周一样」。
   这个模块把重复的部分收起来，但不替玩家做决定——
   计划是你自己排的，出事的那几周你还是得手动改。

   两个东西：
     重复上回合 —— 一键把上周做过的事再做一遍
     训练计划   —— 你自己存一套「没事发生时的默认安排」，随时一键执行     */

/* 记录一次行动 */
function noteAct(kind, key){
  S.thisWeek = S.thisWeek || [];
  S.thisWeek.push({k: kind, v: key});
}
/* 一周结束时把它归档成「上回合」 */
function archiveWeek(){
  if(S.thisWeek && S.thisWeek.length) S.lastWeek = S.thisWeek.slice();
  S.thisWeek = [];
}

/* 行动的中文名，界面用 */
function actLabel(a){
  if(a.k === "train")  return "练" + a.v;
  if(a.k === "squad"){
    const s = (typeof SQUAD_ACTS !== "undefined") ? SQUAD_ACTS.find(x => x.k === a.v) : null;
    return s ? s.n : "战队";
  }
  if(a.k === "pre"){
    return a.v === "rank" ? "打排位" : a.v === "stream" ? "直播" : "休息";
  }
  return a.v === "stream" ? "直播" : "休息";
}
function actListText(list){
  if(!list || !list.length) return "空";
  const c = {};
  list.forEach(a => { const n = actLabel(a); c[n] = (c[n] || 0) + 1; });
  return Object.entries(c).map(([n, v]) => v > 1 ? `${n}×${v}` : n).join(" · ");
}

/* 执行一串行动，直到行动点用完或列表走完。
   已经撞瓶颈的训练会自动跳过——不浪费点数。 */
function runActs(list){
  if(!list || !list.length) return 0;
  let done = 0, guard = 0;
  const inPre = () => S.step === "pre";
  const apNow = () => inPre() ? (S.pre ? S.pre.ap : 0) : S.ap;
  for(const a of list){
    if(guard++ > 40) break;
    if(apNow() <= 0) break;
    if(S.rndEv || S.locker || S.signup || S.rankUp) break;   // 有事发生就停下，交回给玩家
    const before = apNow();

    if(a.k === "train"){
      // 计划里的维度练满了就换一个还能练的——空转等于白扔一个行动点
      let d = a.v;
      if(S.attrs[d] >= capOf(d)){
        const av = DIMS.filter(x => S.attrs[x] < capOf(x));
        d = av.length ? av[0] : null;
      }
      if(d) inPre() ? preAct("train", d) : doTrain(d);
      else  inPre() ? preAct("stream") : doAction("stream");

    } else if(a.k === "squad"){
      // 战队行动只有进队之后才有；职业前就换成排位
      if(!inPre() && typeof doSquad === "function" && S.squad) doSquad(a.v);
      else if(inPre()) preAct("rank");
      else doAction("stream");

    } else {
      // pre 与 season 的行动名不通用，按当前阶段翻译一次
      const key = a.v;
      if(inPre()){
        preAct(key === "stream" ? "stream" : key === "rest" ? "rest" : "rank");
      } else {
        // 职业前的「打排位」在赛季里没有对应项 —— 折算成练最短板
        if(key === "rank"){
          const av = DIMS.filter(x => S.attrs[x] < capOf(x));
          av.length ? doTrain(av[0]) : doAction("stream");
        } else {
          doAction(key === "rest" ? "rest" : "stream");
        }
      }
    }

    if(apNow() === before) break;   // 这一步没消耗点数，说明卡住了，别死循环
    done++;
  }
  return done;
}
/* 把当前这周剩下的点数按计划填满 */
function runPlan(){
  const plan = S.plan && S.plan.length ? S.plan : S.lastWeek;
  if(!plan) return;
  runActs(plan);
  render();
}
function repeatLast(){
  if(!S.lastWeek) return;
  runActs(S.lastWeek);
  render();
}
function savePlan(){
  const src = (S.thisWeek && S.thisWeek.length) ? S.thisWeek : S.lastWeek;
  if(!src || !src.length) return;
  S.plan = src.slice();
  pushEvent(`把这周的安排存成了默认计划：<b>${actListText(S.plan)}</b>。`, "info", "计划");
  render();
}
function clearPlan(){ S.plan = null; render(); }

/* ---------- 界面 ---------- */
function routineBar(){
  const ap = (S.step === "pre") ? (S.pre ? S.pre.ap : 0) : S.ap;
  const blocked = S.rndEv || S.locker || S.signup || S.rankUp;
  const hasLast = S.lastWeek && S.lastWeek.length;
  const hasPlan = S.plan && S.plan.length;
  if(!hasLast && !hasPlan && !(S.thisWeek && S.thisWeek.length)) return "";
  return `<div class="routine">
    <div class="rt-row">
      <button class="btn ghost sm" id="rtRepeat" ${(!hasLast || ap <= 0 || blocked) ? "disabled" : ""}>
        重复上回合</button>
      <span class="rt-txt">${hasLast ? actListText(S.lastWeek) : "还没有上回合"}</span>
    </div>
    <div class="rt-row">
      <button class="btn ghost sm" id="rtPlan" ${(!hasPlan || ap <= 0 || blocked) ? "disabled" : ""}>
        执行计划</button>
      <span class="rt-txt">${hasPlan ? actListText(S.plan) : "还没存计划"}</span>
      ${hasPlan
        ? `<button class="rt-x" id="rtClear" title="清掉计划">×</button>`
        : `<button class="rt-x" id="rtSave" title="把这周的安排存成计划">存为计划</button>`}
      ${hasPlan ? `<button class="rt-x" id="rtSave2" title="用这周的安排覆盖计划">覆盖</button>` : ""}
    </div>
    ${blocked ? `<div class="rt-note">有事情要先处理，处理完才能一键推进。</div>` : ""}
  </div>`;
}
