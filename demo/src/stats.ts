import { GAME_VER } from "./main";
import { S } from "./state";

/* ================= 统计信标 =================

   只回答作者的三个问题：多少人来、玩了多久、走到哪一步。
   原则：
   · 匿名——设备号是本地随机生成的 16 位十六进制，不含任何个人信息，
     不读存档内容，不采集名字/段位/选择，发出去的只有 {id, 事件, 版本}
   · 决不影响游戏——所有调用 try/catch 吞掉，服务端挂了、CSP 拦了、
     隐私模式存不了号，游戏照玩
   · 只在 http(s) 环境发（本地 file:// 打开、无头测试跑生涯都是空操作） */

export const STATS_ON = (typeof location !== "undefined") && /^https?:$/.test(location.protocol)
  && (typeof navigator !== "undefined");

export function statSid() {
  try {
    let id = localStorage.getItem("poxiao_sid");
    if (id && /^[0-9a-f]{16}$/.test(id)) return id;
    let b: any;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      b = crypto.getRandomValues(new Uint8Array(8));
    } else {
      b = Array.from({length: 8}, () => Math.floor(Math.random() * 256));
    }
    id = Array.from(b as number[]).map(x => (x & 255).toString(16).padStart(2, "0")).join("");
    localStorage.setItem("poxiao_sid", id);
    return id;
  } catch (e) {
    // 隐私模式：发一个会话内稳定的临时号（statSid 只算一次，见下面的 SID）
    return Array.from({length: 16}, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  }
}
export const STAT_SID = STATS_ON ? statSid() : "";

export function statSend(e) {
  if (!STATS_ON) return;
  try {
    const body = JSON.stringify({ id: STAT_SID, e: e,
      v: String(GAME_VER).split(" ")[0] });
    if (navigator.sendBeacon &&
        navigator.sendBeacon("/api/t", new Blob([body], { type: "application/json" }))) return;
    fetch("/api/t", { method: "POST", body: body, keepalive: true,
      headers: { "content-type": "application/json" } }).catch(() => {});
  } catch (err) {}
}

/* 漏斗事件（start 开新档 / career 签下第一份职业合同 / end 打出结局）：
   按这一局去重——标记写进 S，跟着存档走，读档回来也不会重复上报 */
export function statEvent(e) {
  try {
    if (S) {
      S.statFlags = S.statFlags || {};
      if (S.statFlags[e]) return;
      S.statFlags[e] = 1;
    }
    statSend(e);
  } catch (err) {}
}

/* 心跳：每分钟最多记 1 分钟游玩时长，而且要同时满足（外部审计：原来只要标签页可见就发，
   看板上的「游玩时长」其实是「所有可见标签页累计打开的时间」）：
   · 标签页可见；
   · 已经开局（建档页不算）；
   · 最近 3 分钟里有过操作（点击 / 按键 / 触摸 / 滚轮）——挂着不动的不算；
   · 同源开几个标签页只有一个在数：localStorage 里一把 90 秒的租约，谁拿着谁发。 */
export const BEAT_IDLE_MS = 3 * 60000, BEAT_LEASE_MS = 90000, BEAT_LEASE_KEY = "poxiao_beat";
export const BEAT_TAB = Math.random().toString(36).slice(2, 10);
export let _beatLast = Date.now();
export function beatTouch() { _beatLast = Date.now(); }
export function beatLease() {
  try {
    const now = Date.now(), raw = localStorage.getItem(BEAT_LEASE_KEY) || "";
    const i = raw.indexOf(":"), who = i > 0 ? raw.slice(0, i) : "", t = i > 0 ? +raw.slice(i + 1) : 0;
    if (who && who !== BEAT_TAB && now - t < BEAT_LEASE_MS) return false;   // 别的标签页正在数
    localStorage.setItem(BEAT_LEASE_KEY, BEAT_TAB + ":" + now);
    return true;
  } catch (e) { return true; }   // 存不了（隐私模式）：只能各数各的
}
export function beatDue() {
  try {
    if (document.visibilityState !== "visible") return false;
    if (!S || S.step === "create") return false;
    if (Date.now() - _beatLast > BEAT_IDLE_MS) return false;
    return beatLease();
  } catch (e) { return false; }
}

if (STATS_ON) {
  statSend("view");
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach(function (ev) {
    try { document.addEventListener(ev, beatTouch, { passive: true, capture: true }); } catch (e) {}
  });
  setInterval(function () {
    try { if (beatDue()) statSend("beat"); } catch (e) {}
  }, 60000);
}
