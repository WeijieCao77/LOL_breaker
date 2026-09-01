/* ================= 头像与图标 =================

   玩家想要「队友的头像」和「弹窗配图」。
   真实选手照片不能用：肖像权是一层，B 站 Toy 审核明确禁止外链资源、
   照片打进包里体积也压不住。所以全部程序化生成：

   · avatarOf(p)  —— 按选手 id 哈希出发型 / 发色 / 肤色 / 队服 / 配件，
     同一个人在任何地方都长同一张脸，不同人几乎不会撞脸
     （5 发型 × 6 发色 × 3 肤色 × 6 队服 × 眼镜 × 耳机 ≈ 2000+ 组合）。
   · gicon(name)  —— 弹窗与按钮用的小图标，跟主题同一套金色调。      */

function _avaHash(s){
  let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  return h;
}

const AVA_SKIN =["#EFC9A5","#E3B28A","#C99B72"];
const AVA_HAIR =["#191A20","#2B2320","#503722","#8A6B3A","#B9BCC6","#7E3038"];
const AVA_SHIRT=["#27455C","#5C2E38","#2F4A33","#4A3A5F","#5C4A27","#1F5058"];

/* 半身像：队服 + 脸 + 发型，可选眼镜和耳机。风格压平，跟界面一致。
   如果 data/photos/ 里放了这位选手的照片（经 make_avatars.py 烤成像素图），
   优先用像素头像——真人像素风，认得出是谁。 */
function avatarOf(p,size){
  size=size||28;
  const id=((p&&(p.id||p))||"?")+"";
  if(typeof AVATARS!=="undefined"&&AVATARS[id]){
    return `<img class="ava pix" src="${AVATARS[id]}" width="${size}" height="${size}" alt=""
      style="vertical-align:middle;border-radius:50%;image-rendering:pixelated;border:1px solid ${
        (p&&p.me)?"var(--gold)":"var(--line)"}">`;
  }
  const h=_avaHash(id);
  const skin =AVA_SKIN [h%3];
  const hair =AVA_HAIR [(h>>2)%6];
  const shirt=AVA_SHIRT[(h>>5)%6];
  const style=(h>>8)%5;
  const glasses=((h>>11)%10)<3;
  const headset=((h>>13)%10)<4;
  const me=!!(p&&p.me);
  /* 发型：盖在头顶的那一块，各画各的 */
  const HAIRS=[
    // 0 短寸
    `<path d="M20 26a12 12 0 0 1 24 0v2c-3-5-7-7-12-7s-9 2-12 7z" fill="${hair}"/>`,
    // 1 中分
    `<path d="M20 27a12 12 0 0 1 24 0l-2 3c-1-5-4-8-8-8l-2 3-2-3c-4 0-7 3-8 8z" fill="${hair}"/>`,
    // 2 斜刘海
    `<path d="M20 27a12 12 0 0 1 24 0l-1 4c0-6-3-9-8-9-6 0-12 2-14 8z" fill="${hair}"/>`,
    // 3 束发（后面扎起来）
    `<path d="M20 26a12 12 0 0 1 24 0v3c-3-5-7-7-12-7s-9 2-12 7z" fill="${hair}"/>
     <circle cx="45" cy="20" r="3.4" fill="${hair}"/>`,
    // 4 蓬一点的碗盖
    `<path d="M19 29a13 13 0 0 1 26 0l-3 2c1-6-3-10-10-10s-11 4-10 10z" fill="${hair}"/>`
  ];
  return `<svg class="ava" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true" style="vertical-align:middle">
    <circle cx="32" cy="32" r="31" fill="rgba(10,30,47,.9)" stroke="${me?"var(--gold)":"var(--line)"}" stroke-width="2"/>
    <clipPath id="avc${h%9973}"><circle cx="32" cy="32" r="30"/></clipPath>
    <g clip-path="url(#avc${h%9973})">
      <path d="M12 64c1-12 9-18 20-18s19 6 20 18z" fill="${shirt}"/>
      <path d="M12 64c1-12 9-18 20-18v18z" fill="rgba(255,255,255,.06)"/>
      <rect x="27" y="38" width="10" height="9" rx="3" fill="${skin}"/>
      <circle cx="32" cy="28" r="12.5" fill="${skin}"/>
      ${HAIRS[style]}
      ${glasses
        ?`<g stroke="#1B222D" stroke-width="1.6" fill="none">
            <rect x="23" y="27" width="7.5" height="6" rx="2"/>
            <rect x="33.5" y="27" width="7.5" height="6" rx="2"/>
            <path d="M31 30h2"/></g>`
        :`<circle cx="27.5" cy="30" r="1.5" fill="#1B222D"/>
          <circle cx="36.5" cy="30" r="1.5" fill="#1B222D"/>`}
      <path d="M29 36c2 1.4 4 1.4 6 0" stroke="#B4805C" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      ${headset
        ?`<path d="M19 28a13 13 0 0 1 26 0" stroke="#151B24" stroke-width="3" fill="none"/>
          <rect x="17" y="26" width="5" height="9" rx="2.4" fill="#151B24"/>
          <rect x="42" y="26" width="5" height="9" rx="2.4" fill="#151B24"/>`
        :""}
    </g>
  </svg>`;
}

/* ---------- 弹窗与按钮的小图标 ---------- */
const GICONS={
  /* 直播：摄像机 + 红点 */
  stream:(c)=>`<rect x="8" y="16" width="30" height="24" rx="5" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M38 24l14-7v22l-14-7z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="16" cy="24" r="3.4" fill="${c}"/>`,
  /* 试训 / 俱乐部来信 */
  scout:(c)=>`<rect x="8" y="14" width="48" height="34" rx="4" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M10 18l22 17 22-17" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>`,
  /* 转会：双向箭头 */
  transfer:(c)=>`<path d="M14 22h30l-8-8M50 40H20l8 8" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  /* 奖杯 */
  cup:(c)=>`<path d="M20 10h24v10a12 12 0 0 1-24 0z" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M20 14h-8a8 8 0 0 0 9 9M44 14h8a8 8 0 0 1-9 9" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M32 32v8m-9 10c1-6 4-8 9-8s8 2 9 8z" fill="none" stroke="${c}" stroke-width="4"/>`,
  /* 成就：奖章 */
  ach:(c)=>`<circle cx="32" cy="24" r="13" fill="none" stroke="${c}" stroke-width="4"/>
    <path d="M25 34l-5 18 12-7 12 7-5-18" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M28 24l3 3 6-7" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  /* 合同：文件 + 笔 */
  deal:(c)=>`<path d="M16 8h22l10 10v38H16z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M38 8v10h10M23 30h18M23 38h18M23 46h10" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`,
  /* 抽签 / 对阵表 */
  draw:(c)=>`<path d="M12 14h12M12 26h12M12 40h12M12 52h12M24 20h10v26H24M34 33h10M44 20v26" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" transform="translate(4 -1)"/>`
};
function gicon(name,size,color){
  const d=GICONS[name]; if(!d) return "";
  return `<svg width="${size||44}" height="${size||44}" viewBox="0 0 64 64" aria-hidden="true" style="vertical-align:middle">${
    d(color||"var(--gold)")}</svg>`;
}
