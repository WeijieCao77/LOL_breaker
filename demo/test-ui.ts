/* 界面测试：把构建产物 demo/career.html 装进 jsdom，像浏览器一样跑起来，再用页面上的按钮操作。
   覆盖的是无头引擎测试碰不到的那一层：建档页的按钮、导览的模态与焦点圈、右下角浮窗、手机折叠、更新日志、存档。
   jsdom 不算布局，导览的几何在 test.ts 里按纯函数量；真机 / 模拟器实测仍然是最后一道。
     npx tsx demo/test-ui.ts        （先 npm run bundle） */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 同 test.ts：行尾归一，免得 Windows 上的 CRLF 让字面匹配失效 */
const html = fs.readFileSync(path.join(HERE, "career.html"), "utf8").replace(/\r\n/g, "\n");
const bad: string[] = [];
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function boot(opts: { width?: number; tracks?: string[]; theme?: string; seed?: number } = {}) {
  const errors: string[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e: any) => errors.push(String(e && (e.detail && e.detail.stack || e.message) || e)));
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/", virtualConsole: vc,
    beforeParse(window: any) {
      if (opts.width) Object.defineProperty(window, "innerWidth", { value: opts.width, configurable: true });
      // 服务端接口：歌单探测、版本戳、信标——都给个像样的回答
      window.fetch = async (url: string) => {
        const u = String(url);
        const body = u.includes("api/bgm") ? { tracks: opts.tracks || [] } : u.includes("api/version") ? { v: "test" } : {};
        return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
      };
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = function () {};
      if (opts.theme) { try { window.localStorage.setItem("poxiao_theme", opts.theme); } catch (e) {} }   // 设备上记的配色
      /* 固定随机数（2026-09-08）：建档走的是界面按钮，种子由 screenCreate() 里的 Math.random 抽，
         所以每跑一次都是另一局——「用按钮推周」偶尔会撞上一局推不动，CI 上就是随机翻红。
         把这一页的 Math.random 换成定种子的 mulberry32：同一次提交每次跑都是同一局，
         真撞上推不动就是稳定复现的真问题，而不是抽签。 */
      let _s = (opts.seed || 20260908) >>> 0;
      window.Math.random = function () {
        _s = (_s + 0x6D2B79F5) >>> 0;
        let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
  });
  const w: any = dom.window;
  return { dom, w, d: w.document as Document, errors };
}
/* 用建档页的按钮把一个人物捏出来并出发 */
function createChar(w: any, d: Document, who: string) {
  const sn = d.getElementById("savenew"); if (sn) { sn.click(); const ok = d.getElementById("cfmOk"); if (ok) ok.click(); }
  const pos = d.querySelector<HTMLElement>('#stage [data-pos="mid"]'); if (!pos) { bad.push(who + "：建档页没有位置按钮"); return false; }
  pos.click();
  const nm = d.querySelector<HTMLInputElement>("#stage input[type=text]"); if (!nm) { bad.push(who + "：建档页没有名字输入框"); return false; }
  nm.value = "测试"; nm.dispatchEvent(new w.Event("input", { bubbles: true }));
  const bg = d.querySelector<HTMLElement>("#stage [data-bg]"); if (bg) bg.click();
  const ages = d.querySelectorAll<HTMLElement>("#stage [data-age]"); if (ages[1]) ages[1].click();
  for (let i = 0; i < 40; i++) { const inc = d.querySelector<HTMLElement>("#stage [data-inc]:not([disabled])"); if (!inc) break; inc.click(); }
  const go = d.getElementById("go") as HTMLButtonElement | null;
  if (!go || go.disabled) { bad.push(who + "：填完了「开始」按钮还没亮"); return false; }
  go.click();
  const sg = d.getElementById("startgo"); if (!sg) { bad.push(who + "：没有出发确认页"); return false; }
  sg.click();
  return true;
}
/* 用页面上的按钮推几周（随机事件、确认框、升段卡都按掉） */
function playWeeks(w: any, d: Document, P: any, n: number) {
  let weeks = 0, clicks = 0, stop = "";
  for (let i = 0; i < 400 && weeks < n; i++) {
    const st = d.getElementById("stage")!;
    const rnd = st.querySelector<HTMLElement>("[data-rnd]"); if (rnd) { rnd.click(); clicks++; continue; }
    const ok = st.querySelector<HTMLElement>("#cfmOk, #achpopok, .rankup button"); if (ok) { ok.click(); clicks++; continue; }
    const S = P.S(); if (S.step !== "pre") { stop = "step=" + S.step; break; }
    const blocker = ["signup", "cupMatch", "cupResult", "tryout", "deal"].find(k => S[k]); if (blocker) { stop = blocker; break; }
    const act = st.querySelector<HTMLElement>("[data-pre]:not([disabled])");
    const nx = (st.querySelector<HTMLButtonElement>("#prenext, #next")) || Array.from(st.querySelectorAll<HTMLButtonElement>("button")).find(b => /下一周/.test(b.textContent || "") && !b.disabled);
    if (act) { act.click(); clicks++; } else if (nx && !nx.disabled) { nx.click(); clicks++; weeks++; } else { stop = "no-button"; break; }
  }
  return { weeks, clicks, stop };
}

/* ---------------- 桌面 ---------------- */
{
  const { dom, w, d, errors } = boot();
  await tick(50);   // 歌单探测的 fetch 回来
  const P = w.poxiao;
  if (!P) bad.push("window.poxiao 没挂上");
  if (d.querySelectorAll("#stage [data-pos]").length !== 5) bad.push("建档页没有 5 个位置按钮");
  const fab = Array.from(d.querySelectorAll(".audiofab button")).map(b => b.id);
  if (fab.includes("aud-bgm")) bad.push("服务器歌单为空时 ♪ 仍在：" + fab.join(","));
  if (!fab.includes("aud-log") || !fab.includes("aud-love")) bad.push("浮窗缺按钮：" + fab.join(","));
  if (d.querySelector(".audiofab")!.classList.contains("fold")) bad.push("桌面宽度不该折叠浮窗");
  // 更新日志开合
  (d.getElementById("aud-log") as HTMLElement).click();
  if (!d.getElementById("chlog")) bad.push("点 📜 没打开更新日志"); else { (d.getElementById("chlogok") as HTMLElement).click(); if (d.getElementById("chlog")) bad.push("更新日志关不掉"); }
  if (P && createChar(w, d, "桌面")) {
    const S = P.S();
    if (S.step !== "pre") bad.push("出发后 step=" + S.step);
    if (typeof S.seed !== "number" || typeof S.rng !== "number") bad.push("新档没有随机种子");
    if (d.getElementById("hud")!.classList.contains("hide")) bad.push("HUD 没显示");
    if (!d.querySelector("#pin .pvb")) bad.push("属性条没画");
    if (!d.querySelector("#stage .tab")) bad.push("没有标签栏");
    // 导览选择卡：render 末尾 600ms 后弹；开着时背景 inert、Tab 只在卡里绕、Esc 关掉
    await tick(800);
    const ask = d.getElementById("tour");
    if (!ask || !ask.classList.contains("ask")) bad.push("导览选择卡没弹");
    else {
      const wrap: any = d.querySelector(".wrap");
      if (wrap.inert !== true) bad.push("导览开着时背景没 inert");
      const tab = (id: string, shift: boolean) => { d.getElementById(id)!.focus(); d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true })); return d.activeElement && d.activeElement.id; };
      if (tab("tour-full", false) !== "tour-skip") bad.push("Tab 没从最后一颗绕回第一颗，落在 " + (d.activeElement && d.activeElement.id));
      if (tab("tour-skip", true) !== "tour-full") bad.push("Shift+Tab 没从第一颗绕到最后一颗，落在 " + (d.activeElement && d.activeElement.id));
      (d.getElementById("tour-lite") as HTMLElement).click();
      const t2 = d.getElementById("tour");
      const k = t2 && t2.querySelector(".tour-k") && t2.querySelector(".tour-k")!.textContent;
      if (!t2 || t2.classList.contains("ask")) bad.push("点「简明」后导览没开始");
      else if (!/导览 1 \/ \d+/.test(k || "")) bad.push("导览步数文案不对：" + k);
      d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      if (d.getElementById("tour")) bad.push("Esc 没关掉导览");
      if (wrap.inert === true) bad.push("导览关了背景还 inert");
      if (w.localStorage.getItem("poxiao_tour_pre") !== "1") bad.push("Esc 关掉的导览没记成「看过」");
    }
    const r = playWeeks(w, d, P, 6);
    if (r.weeks < 3) bad.push("用按钮推周推不动：" + JSON.stringify(r));
    // ---- 仪式的两套新机制在真 DOM 里能不能玩（2026-09-08 第二批）：反应（靶场）与决策（限时三选一） ----
    // 无头引擎测试只能验结算，摆盘、计时器、点击都在这一层。试训上机在职业前就能开，正好在这里试。
    {
      const S = P.S(); const pd = (el: Element) => el.dispatchEvent(new w.Event("pointerdown", { bubbles: true, cancelable: true }));
      // 别的弹窗（际遇、成就、确认框、杯赛……）先散场，仪式才开——真实界面里也是这个顺序，这里直接清掉
      const POPS = ["intlChamp", "rndEv", "rndResult", "locker", "confirm", "autoSum", "patchNote", "rankUp", "streamOffer", "cupResult", "cupMatch", "signup", "traitUp"];
      const clearPops = () => { POPS.forEach(k => { S[k] = null; }); S.achPop = []; };
      clearPops();
      S.tryout = { tier: "mid", team: "T", expect: 60, day: 0, score: 0, lines: [], fat: 0, done: false, days: [0, 1, 2, 3] };
      S.cer = { k: "bench", step: 0 }; P.render();
      if (!d.querySelector(".cer .cer-art")) bad.push("试训上机的开场卡没画场景图" + (d.querySelector(".cer") ? "" : "（仪式层根本没渲染：" + POPS.filter(k => S[k]).join(",") + " achPop=" + (S.achPop || []).length + "）"));
      S.cer.step = 1; P.render();
      const go = d.getElementById("mg-go"); const arena = d.querySelector("#cer-game .mg-arena");
      if (!arena || !go) bad.push("反应挑战没挂出靶场 / 开始按钮");
      else {
        pd(go); await tick(900);   // 第一个靶 500ms 后出现
        const tg = d.querySelector<HTMLElement>("#cer-game .mg-target");
        if (!tg) bad.push("开始之后 900ms 内没有靶亮起");
        else { pd(tg); await tick(20); if ((d.getElementById("mg-hit") || { textContent: "" }).textContent !== "1") bad.push("点中靶没有计入命中：" + (d.getElementById("mg-hit") || {}).textContent); }
      }
      const skip = d.querySelector<HTMLElement>('.cer [data-cer="skip"]'); if (!skip) bad.push("反应挑战没有跳过按钮"); else skip.click();
      if (S.cer || S.tryout.cerAdj !== 0) bad.push("反应挑战跳过没按银档结算");
      S.tryout = null;
      // 决策：五道题一题一屏，点一个选项 700ms 后翻到下一题
      S.cer = { k: "patch", step: 1 }; P.render();
      const opts = d.querySelectorAll<HTMLElement>("#cer-game .mg-opt");
      if (opts.length !== 3 || !d.getElementById("mg-bar")) bad.push("决策挑战没有三个选项 / 倒计时条：" + opts.length);
      else {
        const head0 = (d.querySelector("#cer-game .mg-head") || { textContent: "" }).textContent || "";
        if (!/1\s*\/\s*5/.test(head0.replace(/\s+/g, ""))) bad.push("决策第一题的题号不对：" + head0);
        pd(opts[0]); await tick(800);
        const head1 = (d.querySelector("#cer-game .mg-head") || { textContent: "" }).textContent || "";
        if (!/2\s*\/\s*5/.test(head1.replace(/\s+/g, ""))) bad.push("答完一题没翻到第二题：" + head1);
      }
      const skip2 = d.querySelector<HTMLElement>('.cer [data-cer="skip"]'); if (skip2) skip2.click();
      if (S.cer) bad.push("决策挑战跳过后仪式没散场"); S.verCer = null;
      P.render();
    }
    // ---- 赛后拆解的「简洁 / 详细」tab 在真 DOM 里能点（2026-09-08） ----
    {
      const S = P.S(); const m0 = S.match, st0 = S.step, pm0 = S.pmMode;
      S.step = "match"; S.pmMode = undefined;
      S.match = { opp: { players: [] }, oppName: "X", sc: [1, 2], game: 4, lines: [], node: null, swing: 0, done: true, pmSeen: true, need: 2,
        attr: { rows: [{ n: "个人能力", v: -1.8, fix: "a" }, { n: "默契", v: 1.1, fix: "b" }, { n: "状态", v: -0.6, fix: "c" }, { n: "战术", v: 0.3, fix: "d" }], myTotal: 78, opTotal: 80 },
        nodeLog: [{ g: 1, t: "抢龙", dim: "操作", p: 61, ok: true, d: 4 }], luck: [], gameLog: [], box: null };
      P.render();
      const tabFull = d.querySelector<HTMLElement>('#stage [data-pm="full"]'), tabBrief = d.querySelector<HTMLElement>('#stage [data-pm="brief"]');
      if (!tabFull || !tabBrief) bad.push("拆解卡上没有简洁 / 详细 tab");
      else {
        if (!tabBrief.classList.contains("on") || d.querySelector("#stage .review .rv-h")) bad.push("默认不是简洁版");
        tabFull.click();
        if (S.pmMode !== "full" || !d.querySelector('#stage [data-pm="full"].on') || !Array.from(d.querySelectorAll("#stage .rv-h")).some(e => /临场账本/.test(e.textContent || ""))) bad.push("点「详细」没切到详细版");
        (d.querySelector<HTMLElement>('#stage [data-pm="brief"]') as HTMLElement).click();
        if (S.pmMode !== "brief" || !d.querySelector("#stage .pmrows.lite")) bad.push("点「简洁」没切回简洁版");
      }
      S.match = m0; S.step = st0; S.pmMode = pm0; P.render();
    }
    // 存档：手动存、读回
    (d.getElementById("savenow") as HTMLElement | null)?.click();
    const raw = w.localStorage.getItem("pojuzhe_save_v1");
    if (!raw) bad.push("点「立即保存」后 localStorage 里没有存档");
    else { const b = P.readSave(); if (!b || b.bad || !b.S || b.S.step !== "pre") bad.push("存档读不回来"); if (!/"seed":\d+/.test(raw)) bad.push("存档里没有随机种子"); }
    // 存档栏的版本戳与作者栏
    if (!(d.querySelector(".savebar") && d.querySelector(".savebar")!.textContent!.includes(P.ver.split(" ")[0]))) bad.push("存档栏没有版本戳");
    // 节流窗内的最后一步不能丢（2026-09-10 玩家实锤：回满体能后误触地址栏，回来体能条只剩 50 多）
    {
      const S = P.S();
      // 基线：体能 55 稳稳落盘。上一段的仪式小游戏收尾有定时器，机器忙的时候 render() 可能还在被小游戏挡着（mgLive），
      // 所以多试几轮，等它真的存进去再往下走——测的是节流窗，不是上一段的收尾速度
      let b0: any = null;
      for (let i = 0; i < 6; i++) { S.fatigue = 45; P.render(); await tick(1600); P.render(); b0 = P.readSave(); if (b0 && b0.S && b0.S.fatigue === 45) break; await tick(400); }
      if (!b0 || b0.S.fatigue !== 45) bad.push("拖尾存档：测试基线不对，存档体力=" + (b0 && b0.S.fatigue));
      S.fatigue = 0; P.render();                                          // 1.5 秒内回满：这一次被节流
      b0 = P.readSave(); if (!b0 || b0.S.fatigue !== 45) bad.push("拖尾存档：节流窗内的重画不该立刻存，存档体力=" + (b0 && b0.S.fatigue));
      await tick(1700);
      const b1 = P.readSave(); if (!b1 || b1.S.fatigue !== 0) bad.push("拖尾存档：节流窗内的改动没有补存，重载会回到旧体能（存档 fatigue=" + (b1 && b1.S.fatigue) + "）");
      S.fatigue = 45; P.render();                                         // 又一次落在窗口里
      Object.defineProperty(d, "visibilityState", { get: () => "hidden", configurable: true });
      d.dispatchEvent(new w.Event("visibilitychange"));
      const b2 = P.readSave(); if (!b2 || b2.S.fatigue !== 45) bad.push("切到后台没有立刻存档（存档 fatigue=" + (b2 && b2.S.fatigue) + "）");
      Object.defineProperty(d, "visibilityState", { get: () => "visible", configurable: true });
    }
    // ---- 成就殿堂（2026-09-11）：成就页「本局 / 殿堂」两个视图都画得出来、标签上写着数；封面存档卡写「本局 N · 殿堂 M/总数」 ----
    {
      const S = P.S();
      S.achPop = []; S.confirm = null; S.tab = "ach"; S.achView = "save"; P.render();
      const tSave = d.querySelector<HTMLElement>('#stage [data-achv="save"]'), tHall = d.querySelector<HTMLElement>('#stage [data-achv="hall"]');
      if (!tSave || !tHall) bad.push("成就页没有「本局 / 殿堂」两个视图标签");
      else {
        const ms = /本局\s*(\d+)\s*\/\s*(\d+)/.exec(tSave.textContent || ""), mh = /殿堂\s*(\d+)\s*\/\s*(\d+)/.exec(tHall.textContent || "");
        if (!ms || !mh) bad.push("成就页的视图标签上没写数：" + tSave.textContent + " | " + tHall.textContent);
        if (!tSave.classList.contains("on")) bad.push("成就页默认不是「本局」视图");
        const nSave = d.querySelectorAll("#stage .achgrid .ach").length;
        tHall.click();
        if (S.achView !== "hall" || !d.querySelector('#stage [data-achv="hall"].on')) bad.push("点「殿堂」没切到殿堂视图");
        const nHall = d.querySelectorAll("#stage .achgrid .ach").length;
        if (ms && nHall < +ms[2]) bad.push(`殿堂视图只画了 ${nHall} 张卡（成就一共 ${ms[2]} 项）`);
        if (!/重开、开新档都不会清/.test((d.getElementById("stage") as HTMLElement).textContent || "")) bad.push("殿堂视图没写清它跨存档、不清空");
        (d.querySelector('#stage [data-achv="save"]') as HTMLElement).click();
        if (S.achView !== "save" || d.querySelectorAll("#stage .achgrid .ach").length !== nSave) bad.push("点「本局」没切回原来那张表");
      }
      // 封面：存一个带两项成就的档再回到建档页——封面先把它记进殿堂，成就格写「本局 N · 殿堂 M/总数」
      S.ach = Object.assign({}, S.ach, { sweep: 1, upset: 1 }); S.tab = "act";
      const want = Object.keys(S.ach).length;
      P.saveGame("测试");
      P.screenCreate();
      const tile = Array.from(d.querySelectorAll<HTMLElement>(".savestats > div")).find(el => /成就/.test((el.querySelector(".k") || { textContent: "" }).textContent || ""));
      const txt = tile ? (tile.textContent || "").replace(/\s+/g, " ") : "";
      const mt = /本局 (\d+) · 殿堂 (\d+)\/(\d+)/.exec(txt);
      if (!mt || +mt[1] !== want) bad.push(`封面存档卡的成就格不是「本局 ${want} · 殿堂 M/总数」：` + txt);
      else if (+mt[2] < 2) bad.push("封面没把存档里已解锁的成就记进殿堂：" + txt);
    }
  }
  if (errors.length) bad.push("桌面：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 配色：深 / 浅 / 米 ---------------- */
{
  const { dom, w, d, errors } = boot({ theme: "light" });
  await tick(50);
  const root = d.documentElement;
  if (root.getAttribute("data-theme") !== "light") bad.push("设备上记的浅色首屏没画上（<head> 里那行脚本）：" + root.getAttribute("data-theme"));
  const meta = d.querySelector('meta[name="theme-color"]');
  if (!meta || meta.getAttribute("content") !== "#E6EAF0") bad.push("浅色的 theme-color 没跟上：" + (meta && meta.getAttribute("content")));
  const top = d.querySelector<HTMLElement>('.theme-top [data-theme-set="light"]');
  if (!top) bad.push("页头没有配色控件"); else if (!top.classList.contains("on") || top.getAttribute("aria-checked") !== "true") bad.push("页头控件没按当前配色对齐");
  d.querySelector<HTMLElement>('.theme-top [data-theme-set="cream"]')!.click();
  if (root.getAttribute("data-theme") !== "cream") bad.push("点「米」没换成米色");
  if (w.localStorage.getItem("poxiao_theme") !== "cream") bad.push("换配色没记到 localStorage");
  d.querySelector<HTMLElement>(".theme-top [data-theme-cycle]")!.click();   // 米 → 深
  if (root.hasAttribute("data-theme")) bad.push("循环键从米色没回到深色：" + root.getAttribute("data-theme"));
  if (meta && meta.getAttribute("content") !== "#0B1220") bad.push("回深色后 theme-color 没跟上");
  if (w.poxiao && createChar(w, d, "配色")) {
    if (!d.querySelector("#pin [data-theme-set]")) bad.push("进游戏后属性条上没有「深 / 浅 / 米」");
    d.querySelector<HTMLElement>('#pin [data-theme-set="light"]')!.click();
    if (root.getAttribute("data-theme") !== "light") bad.push("属性条上的配色键不管用");
    if (!d.querySelector<HTMLElement>('.theme-top [data-theme-set="light"]')!.classList.contains("on")) bad.push("属性条换了配色，页头的控件没同步");
  }
  if (errors.length) bad.push("配色：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 「支持作者」自动提示：只在生涯结束、退役仪式收起之后才排上 ---------------- */
{
  const { dom, w, d, errors } = boot();
  await tick(50);
  const P = w.poxiao;
  if (d.getElementById("chlog")) (d.getElementById("chlogok") as HTMLElement).click();
  if (P && createChar(w, d, "支持作者")) {
    await tick(800);
    const S = P.S();
    const seen = () => { try { return w.sessionStorage.getItem("poxiao_support_seen_session_v1") === "1"; } catch (e) { return false; } };
    if (seen() || d.getElementById("suplove")) bad.push("开局就把「支持作者」提示排上了（应该只在生涯结束之后）");
    S.career = { w: 0, l: 0, titles: [], best: 99, since: 0, log: [] }; S.team = "TEST";
    S.step = "end"; P.cerStart("farewell"); P.render();
    if (!d.querySelector("#stage .cer")) bad.push("结局页上没画出退役仪式");
    if (seen()) bad.push("退役仪式还没收起就排上了「支持作者」提示");
    const closeBtn = d.querySelector<HTMLElement>('#stage [data-cer="close"]');
    if (closeBtn) closeBtn.click(); else bad.push("退役仪式上没有「看生涯名片」按钮");
    await tick(10);
    if (d.querySelector("#stage .cer")) bad.push("退役仪式点「看生涯名片」没收起");
    if (!seen()) bad.push("结局名片出来了却没排上「支持作者」提示");
    if (d.getElementById("suplove")) bad.push("「支持作者」浮窗没等 5 秒就压在名片上");
  }
  if (errors.length) bad.push("支持作者：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 仪式小游戏不能被重画冲掉（玩家实锤：靶场点了「开始」又回到开始） ---------------- */
{
  const { dom, w, d, errors } = boot();
  await tick(50);
  const P = w.poxiao;
  if (d.getElementById("chlog")) (d.getElementById("chlogok") as HTMLElement).click();
  if (P && createChar(w, d, "小游戏重画")) {
    await tick(500);
    const S = P.S();
    S.career = { w: 0, l: 0, titles: [], best: 99, since: 0, log: [] };
    S.cer = null; S.cerQ = []; S.achPop = null;
    P.cerStart("draw"); P.render();
    const nx = d.querySelector<HTMLElement>('#stage [data-cer="next"]');
    if (!nx) bad.push("抽签仪式没画出「上台」");
    else {
      nx.click();
      const g = d.getElementById("cer-game");
      if (!g) bad.push("上台之后没挂上小游戏");
      else {
        (g as any).__probe = "live";                 // DOM 被换掉的话这个记号就没了
        P.render();
        const g2 = d.getElementById("cer-game");
        if (!g2 || (g2 as any).__probe !== "live") bad.push("小游戏进行中被 render 重挂了一次（这一局会从头开始）");
        const skip = d.querySelector<HTMLElement>('#stage [data-cer="skip"]');
        if (skip) skip.click();                      // 跳过之后必须解锁，界面还能继续画
        S.cer = null; S.cerQ = []; S.step = "pre"; P.render();
        if (!d.getElementById("stage")!.innerHTML) bad.push("小游戏收场后 render 被永久锁住了");
      }
    }
  }
  if (errors.length) bad.push("小游戏重画：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 生涯名片图：结局页能生成一张带二维码的 PNG ---------------- */
{
  const { dom, w, d, errors } = boot();
  await tick(50);
  const P = w.poxiao;
  if (d.getElementById("chlog")) (d.getElementById("chlogok") as HTMLElement).click();
  if (P && createChar(w, d, "生涯名片图")) {
    await tick(500);
    const S = P.S();
    S.career = { w: 60, l: 40, titles: ["S13 LPL夏季赛"], best: 1, since: 0, log: [], leagueTitles: 1, lgYears: [1] };
    S.team = "RNG"; S.homeLeague = "LPL"; S.si = 2; S.age = 22;
    S.step = "end"; S.cer = null; S.cerQ = []; S.achPop = null; P.render();
    const btn = d.getElementById("sharecardbtn");
    if (!btn) bad.push("结局页没有「生成生涯名片图」按钮");
    else {
      // jsdom 没有 canvas，画不出图；这里只钉住「按钮能点开浮层、失败也有兜底文案」
      (btn as HTMLElement).click();
      await tick(30);
      if (!d.getElementById("sharecard")) bad.push("点了生成生涯名片图没有弹出浮层");
      else {
        await tick(120);
        const body = d.querySelector("#sharecard .share-body");
        if (!body || !body.textContent!.trim()) bad.push("生涯名片图浮层里什么都没有");
        (d.getElementById("share-x") as HTMLElement).click();
        if (d.getElementById("sharecard")) bad.push("生涯名片图浮层关不掉");
      }
    }
    // 二维码得是内嵌的 data URI：站点 CSP 只放行 self / data:，外链图不会显示
    if (!/^data:image\/png;base64,/.test(P.SITE_QR || "")) bad.push("站点二维码不是内嵌的 data URI");
  }
  /* jsdom 不带 canvas（要另装 canvas 这个原生包），getContext 会报一条 not implemented。
     这是 jsdom 的限制，不是产品的问题——真浏览器里画得出来，画不出来时代码也有兜底文案，
     上面那几条断言钉的就是这条兜底路径。所以只在这里把这一条滤掉。 */
  const real = errors.filter((x: string) => !/getContext\(\) method|canvas npm package/.test(x));
  if (real.length) bad.push("生涯名片图：页面脚本报错 " + real.length + " 条：" + real.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 手机（375px） ---------------- */
{
  const { dom, w, d, errors } = boot({ width: 375 });
  await tick(50);
  const P = w.poxiao;
  const fab = d.querySelector(".audiofab")!;
  if (!fab.classList.contains("fold")) bad.push("375px 浮窗没折叠成「⋯」");
  const more = d.getElementById("aud-more") as HTMLElement;
  more.click();
  if (!fab.classList.contains("open") || more.getAttribute("aria-expanded") !== "true") bad.push("点「⋯」没展开");
  (d.getElementById("aud-log") as HTMLElement).click();   // 点了任意一颗就收回
  await tick(10);
  if (fab.classList.contains("open")) bad.push("展开后点了一颗没收回");
  if (d.getElementById("chlog")) (d.getElementById("chlogok") as HTMLElement).click();
  if (P && createChar(w, d, "手机")) {
    await tick(800);
    if (!d.querySelector("#stage .tabs.mob")) bad.push("手机没有底栏");
    if (!d.querySelector("#stage [data-more]")) bad.push("底栏没有「更多」");
    const ask = d.getElementById("tour"); if (ask) d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    (d.querySelector("#stage [data-more]") as HTMLElement).click();
    if (!d.querySelector(".tabsheet")) bad.push("点「更多」没有抽屉");
    const r = playWeeks(w, d, P, 3);
    if (r.weeks < 2) bad.push("手机上用按钮推周推不动：" + JSON.stringify(r));
  }
  if (errors.length) bad.push("手机：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

/* ---------------- 玩家交流群：两张码 + 玩满 10 分钟弹一次 ---------------- */
{
  const { dom, w, d, errors } = boot({});
  await tick(50);
  const P = w.poxiao;
  if (!P || typeof P.showCommunity !== "function") bad.push("交流群：调试口上没有 showCommunity");
  else {
    // 手动打开：两张码都在、不带「别再提示」
    P.showCommunity();
    const pop = d.getElementById("community-pop");
    if (!pop) bad.push("交流群：手动打不开");
    else {
      if (pop.getAttribute("role") !== "dialog" || pop.getAttribute("aria-modal") !== "true") bad.push("交流群：浮窗没有 dialog / aria-modal");
      const dy = d.getElementById("community-qr-dy") as HTMLImageElement | null;
      const xh = d.getElementById("community-qr-xhs") as HTMLImageElement | null;
      if (!dy || !/douyin-group-qr/.test(dy.getAttribute("src") || "")) bad.push("交流群：缺抖音二维码");
      if (!xh || !/xhs-group-qr/.test(xh.getAttribute("src") || "")) bad.push("交流群：缺小红书二维码");
      // 抖音码通用扫码器读不出来，群号是唯一退路，不能丢
      if (!/274886355718/.test(pop.textContent || "")) bad.push("交流群：没有写抖音群号（花式码扫不出时的唯一退路）");
      if (!/xhslink\.com/.test(pop.innerHTML || "")) bad.push("交流群：小红书没给可点的链接");
      if (d.getElementById("community-never")) bad.push("交流群：手动打开不该出现「别再提示」");
      (d.getElementById("community-x") as HTMLElement).click();
      if (d.getElementById("community-pop")) bad.push("交流群：关不掉");
    }
    // 没到 10 分钟不能弹
    w.localStorage.removeItem("poxiao_community_shown_v1");
    w.localStorage.removeItem("poxiao_community_hide_v1");
    w.localStorage.setItem("poxiao_community_playms_v1", String(5 * 60 * 1000));
    P.communityTick();
    if (d.getElementById("community-pop")) bad.push("交流群：才 5 分钟就自动弹了");
    // 过了 10 分钟要弹，而且带「别再提示」
    w.localStorage.setItem("poxiao_community_playms_v1", String(11 * 60 * 1000));
    P.communityTick();
    const auto = d.getElementById("community-pop");
    if (!auto) bad.push("交流群：满 10 分钟没自动弹");
    else {
      if (!d.getElementById("community-never")) bad.push("交流群：自动弹的没带「别再提示」");
      if (w.localStorage.getItem("poxiao_community_shown_v1") !== "1") bad.push("交流群：自动弹过没记住");
      (d.getElementById("community-never") as HTMLElement).click();
      if (w.localStorage.getItem("poxiao_community_hide_v1") !== "1") bad.push("交流群：点了「别再提示」没记住");
    }
    // 退订之后：自动不弹了，但手动入口必须还能开
    w.localStorage.setItem("poxiao_community_playms_v1", String(60 * 60 * 1000));
    P.communityTick();
    if (d.getElementById("community-pop")) bad.push("交流群：退订后还在自动弹");
    P.showCommunity();
    if (!d.getElementById("community-pop")) bad.push("交流群：退订后手动也打不开了");
  }
  if (errors.length) bad.push("交流群：页面脚本报错 " + errors.length + " 条：" + errors.slice(0, 3).join(" | "));
  dom.window.close();
}

if (bad.length) { console.error("界面测试失败：\n - " + bad.join("\n - ")); process.exit(1); }
console.log("界面测试通过：建档按钮 · 导览模态与焦点圈 · 浮窗与歌单探测 · 更新日志 · 推周 · 仪式小游戏（靶场 / 限时三选一） · 存档 · 配色切换 · 支持作者只在结局弹 · 小游戏不被重画冲掉 · 生涯名片图 · 手机折叠与抽屉 · 交流群两张码与 10 分钟自动弹");
process.exit(0);
