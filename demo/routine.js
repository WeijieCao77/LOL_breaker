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
   已经撞瓶颈的训练会自动跳过——不浪费点数。

   中途会有事打断：际遇、更衣室谈话、报名、上分。
   打断的位置必须记下来。否则处理完弹窗再点一次「执行计划」，
   会从第一项重新跑一遍——排位打两次、休息被跳过、疲劳莫名其妙地高。 */
function weekKey(){
  return S.step === "pre" ? "pre" + (S.pre ? S.pre.week : 0)
                          : "s" + S.si + "w" + S.week;
}
/* 本周还有没有没跑完的计划？（换周之后自动失效） */
function pendingActs(){
  const e = S.exec;
  if(!e || e.wk !== weekKey() || !e.list) return null;
  return (e.list.length - e.i) > 0 ? e : null;
}
function runActs(list, fromCursor){
  if(fromCursor){
    const e = pendingActs();
    if(e){ list = e.list; }
  }
  if(!list || !list.length) return 0;
  let done = 0, guard = 0;
  const inPre = () => S.step === "pre";
  const apNow = () => inPre() ? (S.pre ? S.pre.ap : 0) : S.ap;
  let i = (fromCursor && pendingActs()) ? pendingActs().i : 0;
  for(; i < list.length; i++){
    const a = list[i];
    if(guard++ > 40) break;
    if(apNow() <= 0) break;
    // 有事发生就停下，交回给玩家——但记住停在第几项
    if(S.rndEv || S.locker || S.signup || S.rankUp){
      S.exec = { wk: weekKey(), list: list.slice(), i: i };
      return done;
    }
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
        // 赛季里现在有真的「打排位」了（保持手感），直接对应过去
        if(key === "rank"){
          doAction("solo");
        } else {
          doAction(key === "rest" ? "rest" : "stream");
        }
      }
    }

    if(apNow() === before) break;   // 这一步没消耗点数，说明卡住了，别死循环
    done++;
  }
  S.exec = null;   // 走完了，或者这周点数没了——两种情况都不用再接着走
  return done;
}
/* 把当前这周剩下的点数按计划填满。
   有断点就先把断点接上，不要重头再来。 */
function runPlan(){
  if(pendingActs()){ runActs(null, true); render(); return; }
  const plan = S.plan && S.plan.length ? S.plan : S.lastWeek;
  if(!plan) return;
  runActs(plan);
  render();
}
function repeatLast(){
  if(pendingActs()){ runActs(null, true); render(); return; }
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
  const pend = (typeof pendingActs === "function") ? pendingActs() : null;
  if(!hasLast && !hasPlan && !pend && !(S.thisWeek && S.thisWeek.length)) return "";
  // 上次执行被打断了——先把断点摆在最显眼的位置
  const resume = pend ? `<div class="rt-row rt-resume">
      <button class="btn sm" id="rtResume" ${(ap <= 0 || blocked) ? "disabled" : ""}>
        接着执行</button>
      <span class="rt-txt">还剩 <b>${pend.list.length - pend.i}</b> 项：${
        actListText(pend.list.slice(pend.i))}</span>
      <button class="rt-x" id="rtDrop" title="不接了，这周自己安排">放弃</button>
    </div>` : "";
  return `<div class="routine">
    ${resume}
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
