/* ================= 段位徽章 =================
   手绘 SVG，不引用外部素材（CSP 也不允许）。
   造型取 LoL 段位的通用语言：盾形底座 + 宝石 + 环饰，颜色按档位区分。 */
const TIER_STYLE={
  "黄金":       {a:"#C89B3C",b:"#8A6420",gem:"#F0E6D2",ring:"#E8C97A"},
  "铂金":       {a:"#4E9996",b:"#28575A",gem:"#CFF3F0",ring:"#7FD4CE"},
  "钻石":       {a:"#576BCE",b:"#2A3475",gem:"#D6DEFF",ring:"#8E9CF0"},
  "大师":       {a:"#9D4DC3",b:"#51236B",gem:"#EED6FA",ring:"#C687E8"},
  "宗师":       {a:"#C6443E",b:"#6B1F1C",gem:"#FFD9D6",ring:"#E8817B"},
  "王者":       {a:"#C9A961",b:"#6B5424",gem:"#FFF6DF",ring:"#F0E6D2"},
  "国服前 100": {a:"#D8B45A",b:"#7A5F22",gem:"#FFF6DF",ring:"#F0E6D2"},
  "国服前 10":  {a:"#E8D5A0",b:"#8A7440",gem:"#FFFFFF",ring:"#FFF6DF"}
};
/* 小段罗马数字 */
const ROMAN={"一":"I","二":"II","三":"III","四":"IV"};

/* 段位 -> 官方徽章文件名 */
function tierArtKey(v){
  let i=0; RANKS.forEach((x,k)=>{ if(v>=x.at) i=k; });
  return ["gold","platinum","diamond","master","grandmaster","challenger","challenger","challenger"][i]||"gold";
}
function rankIcon(v,size){
  size=size||44;
  const src=RANK_ART[tierArtKey(v)];
  if(!src) return "";
  return `<img class="rankicon" src="${src}" width="${size}" height="${size}" alt="${rankFull(v)}">`;
}
/* 徽章 + 文字 */
function rankBadge(v,size){
  return `<span class="rankbadge">${rankIcon(v,size)}<b>${rankFull(v)}</b></span>`;
}


/* ---------- 队标 ---------- */
/* 队标已在导出时压成 data URI 内嵌（artifact 的 CSP 不允许外链图片） */
function teamLogo(name,size){
  size=size||22;
  if(!name) return "";
  // 职业前 S.world 还不存在，所以要按 世界 -> offer 世界 -> 原始数据 依次找
  const srcs=[];
  if(typeof S!=="undefined"&&S){ if(S.world)srcs.push(S.world); if(S.pre&&S.pre.world)srcs.push(S.pre.world); }
  if(typeof DATA!=="undefined"&&DATA.leagues) srcs.push(DATA.leagues);
  for(const src of srcs){
    for(const lg of Object.keys(src)){
      const t=(src[lg]||[]).find(x=>x.name===name);
      if(t&&t.logo) return `<img class="tlogo" src="${t.logo}" width="${size}" height="${size}" alt="">`;
    }
  }
  return "";
}
