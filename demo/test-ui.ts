/* 界面测试：把构建产物 demo/career.html 装进 jsdom，像浏览器一样跑起来，再用页面上的按钮操作。
   覆盖的是无头引擎测试碰不到的那一层：建档页的按钮、导览的模态与焦点圈、右下角浮窗、手机折叠、更新日志、存档。
   jsdom 不算布局，导览的几何在 test.ts 里按纯函数量；真机 / 模拟器实测仍然是最后一道。
     npx tsx demo/test-ui.ts        （先 npm run bundle） */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(HERE, "career.html"), "utf8");
const bad: string[] = [];
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function boot(opts: { width?: number; tracks?: string[]; theme?: string } = {}) {
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
    // 存档：手动存、读回
    (d.getElementById("savenow") as HTMLElement | null)?.click();
    const raw = w.localStorage.getItem("pojuzhe_save_v1");
    if (!raw) bad.push("点「立即保存」后 localStorage 里没有存档");
    else { const b = P.readSave(); if (!b || b.bad || !b.S || b.S.step !== "pre") bad.push("存档读不回来"); if (!/"seed":\d+/.test(raw)) bad.push("存档里没有随机种子"); }
    // 存档栏的版本戳与作者栏
    if (!(d.querySelector(".savebar") && d.querySelector(".savebar")!.textContent!.includes(P.ver.split(" ")[0]))) bad.push("存档栏没有版本戳");
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

if (bad.length) { console.error("界面测试失败：\n - " + bad.join("\n - ")); process.exit(1); }
console.log("界面测试通过：建档按钮 · 导览模态与焦点圈 · 浮窗与歌单探测 · 更新日志 · 推周 · 仪式小游戏（靶场 / 限时三选一） · 存档 · 配色切换 · 手机折叠与抽屉");
process.exit(0);
