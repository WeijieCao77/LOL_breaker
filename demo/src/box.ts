/* 玩家信箱（作者 2026-10-01：「给 lol breaker 也加一个信箱功能」，照 val_player 的那一套搬）。

   玩家在游戏里写一条建议 → 作者在后台看过、点「展示」才上榜 → 大家点赞 → 作者照着赞多的往下修。
   · 服务端是 box.js，这边只负责画和发。连不上、超时、服务端出错，都只变成一句中文，游戏照常玩。
   · 别人写的字在这里只是<b>数据</b>：一律走 escapeHtml，一次都不往 innerHTML 里原样塞。
   · 身份用统计已经在用的那个设备号（stats.ts 的 STAT_SID）：不记 IP、不记名字、不读存档。
   · 先审后展示：你自己那条永远在「我的」里看得见，所以信箱不会看起来像坏了。 */
import { STATS_ON, STAT_SID, statEvent } from "./stats";
import { escapeHtml } from "./save";

type Item = { id: string; t: number; text: string; votes: number; state: string; pin: number;
              mine?: boolean; voted?: boolean; merge?: any };

export const BOX_STATE_CN: Record<string, string> = {
  pending: "待审核", shown: "已展示", hidden: "已收回", taken: "已采纳", fixed: "已修复", merged: "已合并",
};
/** 已展示不用挂牌子——在榜上本身就说明了；走到后面两步的要挂 */
const TAG: Record<string, string> = { taken: "已采纳", fixed: "已修复", merged: "已合并" };

const B = { open: false, tab: "hot" as "hot" | "new" | "mine", items: [] as Item[], mine: [] as Item[],
            max: 200, min: 4, loading: false, msg: "", sending: false, loaded: false, full: false };

const POP_ID = "box-pop";

async function post(url: string, body: any, ms = 8000) {
  if (!STATS_ON) return { ok: false, why: "本地打开的离线版连不上信箱，游戏照常玩。", off: true };
  let ctl: any = null, timer: any = 0;
  try { ctl = typeof AbortController !== "undefined" ? new AbortController() : null; } catch (e) {}
  if (ctl) timer = setTimeout(() => { try { ctl.abort(); } catch (e) {} }, ms);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
    const j = await r.json();
    return (j && typeof j === "object") ? j : { ok: false, why: "信箱回了一句看不懂的话，等会儿再来。" };
  } catch (e) {
    return { ok: false, why: "连不上作者的信箱，等会儿再来。游戏不受影响。", off: true };
  } finally { if (timer) clearTimeout(timer); }
}

export async function boxList() {
  B.loading = true; paint();
  const j: any = await post("/api/box/list", { v: 1, vid: STAT_SID });
  B.loading = false;
  if (j.ok) {
    B.items = Array.isArray(j.items) ? j.items : [];
    B.mine = Array.isArray(j.mine) ? j.mine : [];
    B.max = +j.max || 200; B.min = +j.min || 4; B.full = !!j.full; B.loaded = true; B.msg = "";
  } else B.msg = j.why || "这会儿读不到建议，等会儿再来。";
  paint();
}

export async function boxSend(text: string) {
  if (B.sending) return;
  B.sending = true; B.msg = ""; paint();
  const j: any = await post("/api/box/new", { v: 1, vid: STAT_SID, text });
  B.sending = false;
  if (j.ok && j.item) {
    B.mine = [j.item as Item].concat(B.mine.filter(x => x.id !== j.item.id));
    B.tab = "mine";
    B.msg = "收到了。作者看过之后会把它放上榜——在「我的」里能看到它的状态。";
    try { statEvent("box_new"); } catch (e) {}
    const ta = document.getElementById("box-text") as HTMLTextAreaElement | null;
    if (ta) ta.value = "";
  } else B.msg = j.why || "没发出去，等会儿再试。";
  paint();
}

export async function boxVote(id: string, on: boolean) {
  const hit = B.items.find(x => x.id === id);
  if (!hit) return;
  const j: any = await post("/api/box/vote", { v: 1, vid: STAT_SID, id, on });
  if (j.ok) { hit.votes = +j.votes || hit.votes; hit.voted = !!j.on; B.msg = ""; }
  else B.msg = j.why || "这一下没点上，再试一次。";
  paint();
}

/* ---------- 画 ---------- */
const day = (t: number) => {
  if (!t) return "";
  try { return new Date(t + 8 * 3600e3).toISOString().slice(5, 10).replace("-", "/"); } catch (e) { return ""; }
};

function rowHtml(it: Item, i: number, mine: boolean) {
  const tag = TAG[it.state] ? `<span class="mbx-tag s-${it.state}">${TAG[it.state]}</span>` : "";
  const st = mine ? `<span class="mbx-tag s-${it.state}">${BOX_STATE_CN[it.state] || it.state}</span>` : tag;
  const vote = mine
    ? `<span class="mbx-votes">${it.votes} 赞</span>`
    : `<button class="mbx-vote${it.voted ? " on" : ""}" data-vote="${escapeHtml(it.id)}" data-on="${it.voted ? "0" : "1"}" aria-pressed="${it.voted ? "true" : "false"}">${it.voted ? "已赞" : "赞"} ${it.votes}</button>`;
  const merge = (mine && it.state === "merged" && it.merge) ? `<div class="mbx-merge">${
    it.merge.availability === "public" && it.merge.target
      ? `你的建议已和另一条合并，票数合并去重。合并后那条现在是<b>${escapeHtml(BOX_STATE_CN[it.merge.target.state] || it.merge.target.state)}</b>、${it.merge.target.votes} 赞：<br>${escapeHtml(it.merge.target.text)}`
      : it.merge.availability === "private" ? "你的建议已和另一条合并，那一条还没公开，公开后能在这里看到进度。"
      : "你的建议已和另一条合并；合并后的那条暂时查不到了，你写的原文仍然保留在这里。"}</div>` : "";
  return `<li class="mbx-row${it.pin ? " pin" : ""}">
    <span class="mbx-no">${mine ? "·" : i + 1}</span>
    <div class="mbx-main"><div class="mbx-text">${escapeHtml(it.text)}</div>
      <div class="mbx-meta">${day(it.t)}${it.pin ? " · 置顶" : ""}${it.mine && !mine ? " · 你提的" : ""} ${st}</div>${merge}</div>
    <div class="mbx-right">${vote}</div></li>`;
}

function listHtml() {
  if (B.loading && !B.loaded) return `<p class="mbx-empty">正在读建议…</p>`;
  if (B.tab === "mine") {
    if (!B.mine.length) return `<p class="mbx-empty">你还没提过建议。写一条吧——作者看过之后会放上榜。</p>`;
    return `<ol class="mbx-list">${B.mine.map((x, i) => rowHtml(x, i, true)).join("")}</ol>`;
  }
  const list = B.tab === "new" ? B.items.slice().sort((a, b) => b.t - a.t) : B.items;
  if (!list.length) return `<p class="mbx-empty">榜上还没有建议。第一条可以是你的。</p>`;
  return `<ol class="mbx-list">${list.map((x, i) => rowHtml(x, i, false)).join("")}</ol>`;
}

function paint() {
  const pop = document.getElementById(POP_ID);
  if (!pop) return;
  const body = pop.querySelector(".mbx-body");
  if (body) body.innerHTML = listHtml();
  const tabs = pop.querySelectorAll<HTMLElement>("[data-mbxtab]");
  tabs.forEach(t => t.classList.toggle("on", t.getAttribute("data-mbxtab") === B.tab));
  const msg = pop.querySelector(".mbx-msg");
  if (msg) { msg.innerHTML = B.msg ? escapeHtml(B.msg) : ""; (msg as HTMLElement).style.display = B.msg ? "block" : "none"; }
  const sendBtn = pop.querySelector<HTMLButtonElement>("#box-send");
  if (sendBtn) { sendBtn.disabled = B.sending; sendBtn.textContent = B.sending ? "发送中…" : "发送"; }
  const cnt = pop.querySelector(".mbx-count");
  const ta = document.getElementById("box-text") as HTMLTextAreaElement | null;
  if (cnt && ta) cnt.textContent = `${[...(ta.value || "")].length} / ${B.max}`;
  wireRows(pop);
}

function wireRows(pop: HTMLElement) {
  pop.querySelectorAll<HTMLElement>("[data-vote]").forEach(b => {
    b.onclick = (e) => { e.preventDefault(); boxVote(b.getAttribute("data-vote") || "", b.getAttribute("data-on") === "1"); };
  });
}

export function showBox(source?: string) {
  try {
    if (document.getElementById(POP_ID)) return;
    const wrap = document.createElement("div");
    wrap.id = POP_ID;
    wrap.className = "rankup support-overlay mbx-overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-labelledby", "box-title");
    wrap.innerHTML = `<section class="support-card mbx-card">
      <header class="support-head">
        <div><div class="support-kicker">玩家信箱</div>
        <h2 id="box-title">把想说的写给作者，顺便看看别人提了什么</h2></div>
        <button type="button" class="support-close" id="box-x" aria-label="关闭玩家信箱">关闭 <span aria-hidden="true">×</span></button>
      </header>
      <p class="support-lead">建议会先到作者手里，<strong>他看过之后才会出现在榜上</strong>；你自己那条在「我的」里随时能看到状态。觉得谁说得对就点个赞——<strong>作者按赞多的先改</strong>。</p>
      <div class="mbx-send">
        <textarea id="box-text" maxlength="400" rows="3" placeholder="比如：某个数值不合理、某个说明看不懂、希望加什么功能。一条说一件事最好。"></textarea>
        <div class="mbx-sendfoot"><span class="mbx-count">0 / 200</span>
          <button type="button" class="support-never" id="box-refresh">刷新</button>
          <button type="button" class="support-close" id="box-send">发送</button></div>
      </div>
      <div class="mbx-msg" style="display:none"></div>
      <div class="mbx-tabs" role="tablist" aria-label="信箱">
        <button type="button" data-mbxtab="hot" class="on" role="tab">最热</button>
        <button type="button" data-mbxtab="new" role="tab">最新</button>
        <button type="button" data-mbxtab="mine" role="tab">我的</button>
      </div>
      <div class="mbx-body"><p class="mbx-empty">正在读建议…</p></div>
      <p class="mbx-foot">不记 IP、不记名字、不读存档；作者那边只看得到你写的这段字。</p>
    </section>`;
    document.body.appendChild(wrap);
    const close = () => { try { wrap.remove(); B.open = false; } catch (e) {} };
    (wrap.querySelector("#box-x") as HTMLElement).onclick = close;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.addEventListener("keydown", function esc(e: any) {
      if (e.key === "Escape" && document.getElementById(POP_ID)) { close(); document.removeEventListener("keydown", esc); }
    });
    wrap.querySelectorAll<HTMLElement>("[data-mbxtab]").forEach(t => {
      t.onclick = () => { B.tab = (t.getAttribute("data-mbxtab") as any) || "hot"; B.msg = ""; paint(); };
    });
    const ta = wrap.querySelector("#box-text") as HTMLTextAreaElement;
    ta.oninput = () => {
      const n = [...(ta.value || "")].length;
      const cnt = wrap.querySelector(".mbx-count");
      if (cnt) { cnt.textContent = `${n} / ${B.max}`; (cnt as HTMLElement).classList.toggle("over", n > B.max); }
    };
    (wrap.querySelector("#box-send") as HTMLElement).onclick = () => {
      const text = (ta.value || "").trim();
      const n = [...text].length;
      if (n < B.min) { B.msg = `太短了，至少 ${B.min} 个字，把想说的说清楚。`; paint(); return; }
      if (n > B.max) { B.msg = `一条最多 ${B.max} 个字，长了就分两条。`; paint(); return; }
      boxSend(text);
    };
    (wrap.querySelector("#box-refresh") as HTMLElement).onclick = () => boxList();
    B.open = true;
    try { statEvent("box_open"); } catch (e) {}
    boxList();
  } catch (e) {}
}

/** 结局页那一行：打完一局的人最有话说（val_player 也是在这里问的） */
export function boxEndCard() {
  return `<div class="card mbx-end"><h2>玩家信箱<em>作者在看</em></h2>
    <p class="note" style="margin:0 0 10px">这一局里有什么不合理、哪段说明看不懂、想加什么功能——写一条给作者。
    建议会挂在榜上让大家点赞，<b>作者按赞多的先改</b>。</p>
    <div class="row"><button class="btn" id="boxgo">写一条建议 →</button></div></div>`;
}
