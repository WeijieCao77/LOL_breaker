/* ================= 界面配色：深 / 浅 / 米（2026-09-06）=================
   玩家原话：「界面亮色看起来会舒服一点」「可以借鉴一下隔壁 vct 电竞经理的」。
   照 VCT电竞经理那套：深色是游戏自己的（赛事转播那种黑底），默认；浅色是数据表（白面板压冷灰）；
   米色是笔记本（米黄底，比白底少反一点光，看久了更舒服）。
   选择记在这台设备上（localStorage），不进存档、不跟着 /xfer 搬家——手机在太阳底下和半夜的显示器要的答案不一样。
   构建时 bundle.mjs 在 <head> 里塞了一行同步脚本读同一个 key，浅色页面不会先黑一下再变白。
   样式在 theme.css 末尾：[data-theme="light"] / [data-theme="cream"] 两块覆盖，深色就是 :root 本身。 */
export type Theme = "dark" | "light" | "cream";
export const THEME_KEY = "poxiao_theme";
export const THEMES: { key: Theme; short: string; label: string; hint: string; bar: string }[] = [
  { key: "dark",  short: "深", label: "深色", hint: "默认，赛事转播那种黑底", bar: "#0B1220" },
  { key: "light", short: "浅", label: "浅色", hint: "白底，像一张数据表", bar: "#E6EAF0" },
  { key: "cream", short: "米", label: "米色", hint: "米黄底，比白底柔和，看久了更舒服", bar: "#E9E1D0" },
];
const isTheme = (v: any): v is Theme => v === "dark" || v === "light" || v === "cream";

export function readTheme(): Theme {
  try { const v = localStorage.getItem(THEME_KEY); if (isTheme(v)) return v; } catch (e) {}
  return "dark";
}
/* 画到文档上：样式表认的是 <html data-theme>，浏览器地址栏认的是 <meta theme-color>。
   深色＝没有这个属性，所以 :root 那块就是深色，切回去不用撤销任何东西。 */
export function paintTheme(t: Theme) {
  try {
    const root = document.documentElement;
    if (t === "dark") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    const bar = (THEMES.find(x => x.key === t) || THEMES[0]).bar;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bar);
  } catch (e) {}
  syncThemeUI(t);
}
export function setTheme(t: Theme) {
  if (!isTheme(t)) return;
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  paintTheme(t);
}
export function nextTheme(t: Theme): Theme {
  const i = THEMES.findIndex(x => x.key === t);
  return THEMES[(i + 1) % THEMES.length].key;
}
/* 页面上所有配色控件按当前主题对齐（顶栏那组每次 render 都重画，页头和教程说明里的是静态的，靠这里刷） */
export function syncThemeUI(t?: Theme) {
  const cur = t || readTheme();
  try {
    document.querySelectorAll<HTMLElement>("[data-theme-set]").forEach(b => {
      const on = b.getAttribute("data-theme-set") === cur;
      b.classList.toggle("on", on); b.setAttribute("aria-checked", on ? "true" : "false");
    });
    const c = THEMES.find(x => x.key === cur) || THEMES[0], n = THEMES.find(x => x.key === nextTheme(cur)) || THEMES[0];
    document.querySelectorAll<HTMLElement>("[data-theme-cycle]").forEach(b => {
      b.innerHTML = `<i class="tsw" data-t="${cur}" aria-hidden="true"></i>${c.short}`;
      b.setAttribute("aria-label", `界面配色：${c.label}。点击换成${n.label}`); b.title = `${c.label} → ${n.label}`;
    });
  } catch (e) {}
}
/* 顶栏形态：三段各一个字、带一块地面色样；手机上那一栏挤，只放一颗，点一下换下一套 */
export function themeSeg(): string {
  const cur = readTheme(), c = THEMES.find(x => x.key === cur) || THEMES[0], n = THEMES.find(x => x.key === nextTheme(cur)) || THEMES[0];
  return `<span class="tseg" role="radiogroup" aria-label="界面配色">${THEMES.map(t =>
    `<button type="button" class="pvb ${t.key === cur ? "on" : ""}" role="radio" aria-checked="${t.key === cur}" data-theme-set="${t.key}" title="${t.label}：${t.hint}"><i class="tsw" data-t="${t.key}" aria-hidden="true"></i>${t.short}</button>`).join("")}</span>`
    + `<button type="button" class="pvb tcyc" data-theme-cycle aria-label="界面配色：${c.label}。点击换成${n.label}" title="${c.label} → ${n.label}"><i class="tsw" data-t="${cur}" aria-hidden="true"></i>${c.short}</button>`;
}
/* 教程说明里的完整形态：带名字和一句说明 */
export function themeFull(): string {
  const cur = readTheme();
  return `<div class="theme-full" role="radiogroup" aria-label="界面配色">${THEMES.map(t =>
    `<button type="button" class="tf ${t.key === cur ? "on" : ""}" role="radio" aria-checked="${t.key === cur}" data-theme-set="${t.key}"><b><i class="tsw" data-t="${t.key}" aria-hidden="true"></i>${t.label}</b><span>${t.hint}</span></button>`).join("")}</div>`;
}
/* 一次性挂在 document 上的委托：控件在 stage / 页头 / 教程说明里都有，重画也不掉 */
let bound = false;
export function bindTheme() {
  if (bound || typeof document === "undefined") return;
  bound = true;
  document.addEventListener("click", (e: any) => {
    const b = e.target && e.target.closest ? e.target.closest("[data-theme-set],[data-theme-cycle]") : null;
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute("data-theme-cycle")) setTheme(nextTheme(readTheme()));
    else setTheme(b.getAttribute("data-theme-set"));
  });
  paintTheme(readTheme());
}
