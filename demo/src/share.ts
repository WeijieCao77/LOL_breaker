import { ORIGIN, POSN, SEASONS, SPLITS, ending, fanTier, rankFull } from "./main";
import { S } from "./state";
import { ringTitles, titleCount } from "./rotation";
import { txStops } from "./tryout";
import { statEvent } from "./stats";
import { bondCardLines } from "./bond";

/* ================= 生涯结算图（玩家点名 2026-09-09）=================

   玩家原话：「能不能出一个生涯结算小图，可以保存相册，然后右下角配一个二维码或者网址，
   这样子想玩的人可以直接扫，想留作纪念的也可以一键保存，推广游玩双利好」。

   结局页原来只有一句「上面这张名片，截图就能发」——截图带着浏览器地址栏和底栏，
   发出去既不好看也没有入口。这里把同一份数据画进一张 1080×1620 的竖图：
   判词、ID、冠军、逐年轨迹、五项统计，右下角一个二维码。

   为什么用 canvas 手画而不是 html2canvas：站点的 CSP 只放行 self 和 data:，
   外链脚本进不来；而且这是单文件发布，多一个库就多 60KB。手画反而可控——
   分辨率、留白、字号全是定死的，不会因为玩家的浏览器字体设置而跑版。

   保存的三条路（2026-09-09 作者实测补的第三条）：
   · 「存到相册」——navigator.share 带 File，唤起系统分享菜单，iOS 里点「存储图像」
     就直接进相册。这是手机上唯一能一步到相册的路径。
   · 长按图片保存——share 不可用时的兜底（老 Safari、桌面 Firefox）。
   · 「下载图片」——桌面走这条。注意 iOS Safari 上 <a download> 落到的是
     「文件」App 的下载项，不是相册，所以手机上它不再是主按钮。
   三条都不需要任何后端。 */

/* 站点二维码：https://www.poxiao.lol
   segno 生成（版本 2 / 纠错 M / 25 模块），334 字节，用 OpenCV 实际解码验证过。
   和爱发电那张二维码同一套做法——CSP 只放行 data:，外链图不显示。 */
export const SITE_QR="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAK4AAACuAQMAAACVwqStAAAABlBMVEULFiL///8qhWqJAAABA0lEQVR42u1XsQ3DMAwTqgN8kl/3ST5AgEpKdqesBYfW0JB4CSGRFGP5dMJ++3objudC2Ui+2IyXPZ5vXgPJBCIHHsKYjpctQ1IA2BA8A5KLkSQqRuqR4OvGAWmRkCeHrlqelHbIEJZSO+csFHhyxC2aDruRdJKwydGMVPUEJIkaUG4xTzAXr1bk9TeZdjbxoC30k3IV1XTCWj5AAi1jUirtQDIlHGueLOneKQ8pVEqeHCdZ7fMuVHExFq0IMuQyR+ixDYZUMRljb2YrETGfhMl38epJCZF0PunA1ttHmx7LY2sB6XbxzWynM6nObL47IZjOT87SQWforqVlaWb7/41+rt/vdDbChj/nTgAAAABJRU5ErkJggg==";
export const SITE_URL="www.poxiao.lol";

const W=1080, H=1620;
const CO={ bg:"#0B1622", panel:"#122132", line:"#1E3247", ink:"#E8EEF5",
           ink2:"#9FB2C6", ink3:"#6B8199", gold:"#E8B559", cyan:"#4FC3D9", red:"#D9605E" };
const FONT=(w,s)=>`${w} ${s}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif`;

/* 按宽度折行，返回实际画了几行 */
function wrap(g,text,x,y,maxW,lh,maxLines?){
  const cs=String(text||"").split("");
  let line="", n=0;
  for(let i=0;i<cs.length;i++){
    const t=line+cs[i];
    if(g.measureText(t).width>maxW&&line){
      if(maxLines&&n>=maxLines-1){ g.fillText(line.slice(0,-1)+"…",x,y+n*lh); return n+1; }
      g.fillText(line,x,y+n*lh); n++; line=cs[i];
    } else line=t;
  }
  if(line){ g.fillText(line,x,y+n*lh); n++; }
  return n;
}
/* 缩到放得下为止，最小 18px 还放不下就截断——统计格里「出圈到路人都认识」这种长档位名
   原来会压到隔壁那一格上去 */
function fitText(g,text,x,y,maxW,size,weight?){
  let t=String(text||""), sz=size;
  while(sz>18){ g.font=FONT(weight||700,sz); if(g.measureText(t).width<=maxW) break; sz-=2; }
  g.font=FONT(weight||700,sz);
  while(t.length>1&&g.measureText(t).width>maxW) t=t.slice(0,-1);
  if(g.measureText(String(text||"")).width>maxW&&t.length>1) t=t.slice(0,-1)+"…";
  g.fillText(t,x,y);
}
function roundRect(g,x,y,w,h,r){
  g.beginPath();
  g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
}

/* 逐年轨迹：和生涯名片同一份数据，只是排成一列 */
function yearRows(){
  const C=S.career||{}, log=(C as any).log||[];
  const played=SEASONS.slice(0,Math.min(SEASONS.length,(S.si||0)+1));
  let prev=null;
  return played.map((sea,si)=>{
    const rows=log.filter(x=>x.si===si);
    let team=rows.length?rows[rows.length-1].team:null;
    // 兜底和生涯名片同一套：转会记录 → 沿用上一年 → 当前东家
    if(!team){
      const tx=(S.txLog||[]).filter(x=>String(x.s||"").indexOf(sea.tag)===0);
      for(const t2 of tx.slice().reverse()){
        const m=String(t2.text||"").match(/<b>([^<]+)<\/b>/);
        if(m){ team=m[1]; break; }
      }
    }
    if(!team&&prev) team=prev;
    if(!team&&S.career&&si<=(S.si||0)) team=S.team;
    if(team) prev=team;
    const res=rows.map(r=>`${SPLITS[r.split]?SPLITS[r.split][0]:""}${
      r.result==="champion"?"冠":r.result===3?"亚":r.result===2?"四强":r.seed>6?"第"+r.seed:"季后赛"}`).join(" · ");
    const won=((C as any).lgYears||[]).includes(si)||((C as any).msiYears||[]).includes(si)||((C as any).worldsYears||[]).includes(si);
    return {tag:sea.tag, y:sea.y, team:team||"—", res:res||"—", won};
  });
}

/* 把整张图画出来，返回 canvas */
export function drawShareCard(){
  const cv=document.createElement("canvas");
  cv.width=W; cv.height=H;
  const g: any=cv.getContext("2d");
  if(!g) return null;
  const e=ending();

  g.fillStyle=CO.bg; g.fillRect(0,0,W,H);
  // 顶部一道金线，和游戏里卡片的左边线呼应
  g.fillStyle=CO.gold; g.fillRect(0,0,W,6);

  let y=110;
  g.textBaseline="alphabetic";
  g.font=FONT(700,40); g.fillStyle=CO.gold; g.fillText("破晓",72,y);
  g.font=FONT(400,24); g.fillStyle=CO.ink3;
  const _played=SEASONS.slice(0,Math.min(SEASONS.length,(S.si||0)+1));
  // 写实际打过的年份，不是整张赛季表——打到 S16 退役的人不该看到「S12–S19」
  g.fillText("生涯名片 · "+_played[0].tag+"–"+_played[_played.length-1].tag+" · "+_played[0].y+"–"+_played[_played.length-1].y,
             72+g.measureText("破晓").width+120,y-4);

  // 判词
  y+=96;
  g.font=FONT(700,72); g.fillStyle=CO.ink;
  g.fillText("「"+e.n+"」",72,y);
  y+=54;
  g.font=FONT(400,28); g.fillStyle=CO.ink2;
  y+=wrap(g,e.d,72,y,W-144,44,3)*44;

  // ID 一行
  y+=28;
  // canvas 上不能用 meName()：它会把名字转义成 HTML 实体，画出来是 &amp;
  const rawName=(S&&S.name)?String(S.name):"你";
  const idLine=[rawName,POSN[S.pos]||"",((ORIGIN as any)[S.origin]||{}).n||"",
                S.career?(S.team||"—"):"",(S.age||"")+" 岁"].filter(Boolean).join(" · ");
  g.font=FONT(600,30); g.fillStyle=CO.cyan;
  g.fillText(idLine,72,y);

  /* 冠军：按分量分三档画，不再一把梭成逗号列表。
     玩家实锤「世界赛的夺冠明明是更重要的事情，但重点被放在了下面的联赛成绩」——
     原来 join("、") 让「S16 世界赛」和「S14 PCS夏季赛」同字号同颜色，
     世界冠军就这么被地区赛季淹掉了。三档：世界赛最大、MSI 次之、联赛压成灰字小号。 */
  const own=((S.career as any)&&(S.career as any).titles)||[], ring=ringTitles();
  const all=own.concat(ring.map(t=>t+"（随队）"));
  const isW=(t:string)=>/世界赛/.test(t), isM=(t:string)=>/MSI/.test(t);
  const yr=(t:string)=>(String(t).match(/^S\d+/)||[""])[0];        // "S16 世界赛" → "S16"
  const wT=all.filter(isW), mT=all.filter(isM), lT=all.filter(t=>!isW(t)&&!isM(t));
  y+=64;
  if(!all.length){
    g.font=FONT(400,26); g.fillStyle=CO.ink3; g.fillText("还没有冠军",72,y); y+=40;
  }else{
    if(wT.length){
      g.font=FONT(400,24); g.fillStyle=CO.ink3; g.fillText("世界赛冠军",72,y); y+=56;
      g.font=FONT(700,46); g.fillStyle=CO.gold;
      const head=wT.length>1?`${wT.length} 冠`:"冠军";
      const hw=g.measureText(head).width;      // 必须在切字体之前量：measureText 看的是当前 g.font
      g.fillText(head,72,y);
      g.font=FONT(600,30); g.fillStyle=CO.ink;
      g.fillText(wT.map(yr).join(" · "),72+hw+24,y);
      y+=26;
    }
    if(mT.length){
      y+=30;
      g.font=FONT(600,30); g.fillStyle=CO.gold;
      const mh=`MSI ${mT.length>1?mT.length+" 冠":"冠军"}`;
      const mw=g.measureText(mh).width;        // 同上：切字体之前量
      g.fillText(mh,72,y);
      g.font=FONT(400,26); g.fillStyle=CO.ink2;
      g.fillText(mT.map(yr).join(" · "),72+mw+20,y);
    }
    if(lT.length){
      /* 有国际冠军时联赛压成灰字小号（别抢世界赛的戏）；
         一座国际冠军都没有时它就是这段生涯的全部——升成主角，
         否则「无冠但拿过三个联赛冠军」的名片会变成一片灰。 */
      const solo=!wT.length&&!mT.length;
      y+=solo?0:46;
      g.font=FONT(400,solo?24:24); g.fillStyle=CO.ink3;
      g.fillText(solo?"联赛冠军":`联赛及其他 ${lT.length} 座`,72,y);
      if(solo){
        y+=56;
        g.font=FONT(700,46); g.fillStyle=CO.gold;
        const lh=lT.length>1?`${lT.length} 冠`:"冠军";
        const lw=g.measureText(lh).width;
        g.fillText(lh,72,y);
        g.font=FONT(600,26); g.fillStyle=CO.ink2;
        y+=wrap(g,lT.join("、"),72+lw+24,y,W-144-lw-24,34,2)*34-34+6;
      }else{
        /* 列表另起一行走整宽：挂在标签右边时只剩三分之一的宽度，
           wrap 是按字符断的，会把「S18」断成「S1 / 8」。 */
        g.font=FONT(400,23); g.fillStyle=CO.ink3;
        y+=wrap(g,lT.join("、"),72,y+34,W-144,32,2)*32+2;
      }
    }
    y+=40;
  }

  // 逐年轨迹
  y+=34;
  const rows=yearRows();
  /* 共事账本给的两行（bond.ts）：并肩最久的人、你带过最久的人。
     作者原话：「最后我要退役了，小弟们的综评已经超越我了，开始带飞我了，就会有的感触」——
     名片是玩家会截图发出去的东西，这两行就是那个感触。没有账本内容时高度是 0，版式不动。 */
  const bond=bondCardLines();
  const bondH=bond.length?(26+bond.length*40):0;
  /* 行高按剩余空间算，把中间铺满：底部分隔线在 H-270，往上留统计块 132 + 间距 30。
     原来行高写死 74，五年的名片中间会空出一大块。 */
  const avail=(H-270-40)-y-132-30-bondH;
  /* 上限 112 → 84：八年的名片里逐年表能吃掉 896px，比冠军区还大一倍，
     而这张表大部分是常规赛名次——不是玩家要发出去的东西。 */
  const rh=Math.max(56,Math.min(84,Math.floor(avail/Math.max(1,rows.length))));
  rows.forEach((r,i)=>{
    const yy=y+i*rh;
    g.fillStyle=r.won?"#1A2A1E":CO.panel; roundRect(g,72,yy,W-144,rh-10,10); g.fill();
    if(r.won){ g.fillStyle=CO.gold; g.fillRect(72,yy,5,rh-10); }
    g.font=FONT(700,26); g.fillStyle=r.won?CO.gold:CO.ink2; g.fillText(r.tag,96,yy+(rh-10)/2+9);
    g.font=FONT(400,25); g.fillStyle=CO.ink;  g.fillText(r.team,200,yy+(rh-10)/2+9);
    g.font=FONT(400,25); g.fillStyle=CO.ink2;
    const rt=r.res, rw=g.measureText(rt).width;
    g.fillText(rt,W-96-rw,yy+(rh-10)/2+9);
  });
  y+=rows.length*rh+30;

  // 五项统计
  const C: any=S.career||{};
  const stats=[["生涯小分",(C.w||0)+"–"+(C.l||0)],["冠军",String(titleCount())],
               ["转会",txStops()+" 站"],["段位",rankFull(S.pre?S.pre.rank:0)],["粉丝",fanTier()]];
  const cw=(W-144)/stats.length;
  g.fillStyle=CO.panel; roundRect(g,72,y,W-144,132,12); g.fill();
  stats.forEach(([k,v],i)=>{
    const cx=72+cw*i+cw/2;
    g.textAlign="center";
    g.font=FONT(400,22); g.fillStyle=CO.ink3; g.fillText(k,cx,y+46);
    g.fillStyle=CO.ink; fitText(g,v,cx,y+96,cw-26,32);
    if(i){ g.fillStyle=CO.line; g.fillRect(72+cw*i,y+30,1,72); }
  });
  g.textAlign="left";
  y+=132;

  // 共事：并肩最久 / 你带过最久
  if(bond.length){
    y+=26;
    bond.forEach((ln,i)=>{
      const ly=y+i*40;
      g.font=FONT(400,24); g.fillStyle=CO.ink3;
      g.fillText(ln.k,72,ly);
      const kw=g.measureText(ln.k+"　").width;
      g.font=FONT(600,24); g.fillStyle=CO.gold;
      g.fillText(ln.v,72+kw,ly);
    });
    y+=bond.length*40;
  }

  // 底部：二维码 + 网址
  const qy=H-230;
  g.fillStyle=CO.line; g.fillRect(72,qy-40,W-144,1);
  g.font=FONT(700,34); g.fillStyle=CO.ink; g.fillText("破晓 · LOL 电竞生涯模拟",72,qy+40);
  g.font=FONT(400,26); g.fillStyle=CO.ink2; g.fillText("扫码开一局，写你自己的五年",72,qy+88);
  g.font=FONT(400,24); g.fillStyle=CO.gold; g.fillText(SITE_URL,72,qy+136);
  return cv;
}

/* 二维码是张图，要等它 load 完才能画进去，所以整体走异步 */
export function makeShareCard(){
  return new Promise<any>(res=>{
    const cv=drawShareCard();
    if(!cv) { res(null); return; }
    const g: any=cv.getContext("2d");
    const img=new Image();
    const qs=168, qx=W-72-qs, qy=H-230-8;
    const done=()=>{ try{ res(cv.toDataURL("image/png")); }catch(e){ res(null); } };
    img.onload=()=>{
      g.fillStyle="#fff"; roundRect(g,qx-10,qy-10,qs+20,qs+20,10); g.fill();
      g.drawImage(img,qx,qy,qs,qs);
      done();
    };
    img.onerror=done;
    img.src=SITE_QR;
  });
}

export const SHARE_FILE="破晓-生涯名片.png";
export const SHARE_TEXT="我的五年电竞生涯 · "+SITE_URL;
/* dataURL → File。navigator.share 只收 File，不收 dataURL，所以要自己拆一次 base64。
   老浏览器没有 File 构造函数（只有 Blob）——那就返回 null，走长按 / 下载那两条路。 */
export function dataUrlToFile(url,name){
  try{
    if(typeof File!=="function"||typeof atob!=="function") return null;
    const i=url.indexOf(","); if(i<0) return null;
    const bin=atob(url.slice(i+1)), buf=new Uint8Array(bin.length);
    for(let k=0;k<bin.length;k++) buf[k]=bin.charCodeAt(k);
    return new File([buf],name,{type:"image/png"});
  }catch(e){ return null; }
}
/* 这台设备能不能把「一个 PNG 文件」交给系统分享菜单。
   iOS Safari 15+ / 安卓 Chrome 可以；桌面 Firefox、老 Safari 不行。 */
export function canShareFile(file){
  try{
    const nav: any=(typeof navigator!=="undefined")?navigator:null;
    return !!(nav&&typeof nav.share==="function"&&typeof nav.canShare==="function"&&nav.canShare({files:[file]}));
  }catch(e){ return false; }
}

/* 浮层：图 + 存到相册 / 长按保存 / 下载 */
export function shareCardOpen(){
  if(typeof document==="undefined"||document.getElementById("sharecard")) return;
  const wrapEl=document.createElement("div");
  wrapEl.id="sharecard"; wrapEl.className="rankup share-overlay";
  wrapEl.setAttribute("role","dialog"); wrapEl.setAttribute("aria-modal","true");
  wrapEl.innerHTML=`<section class="share-card">
    <header class="share-head"><b>生涯名片</b>
      <button type="button" class="support-close" id="share-x" aria-label="关闭">关闭 <span aria-hidden="true">×</span></button></header>
    <div class="share-body"><div class="share-loading">正在生成…</div></div>
    <footer class="share-foot">
      <span class="share-tip" id="share-tip">正在生成…</span>
      <span class="share-acts">
        <button type="button" class="btn sm primary" id="share-save" hidden>存到相册</button>
        <a class="btn sm" id="share-dl" download="破晓-生涯名片.png" hidden>下载图片</a>
      </span>
    </footer>
  </section>`;
  const close=()=>{ document.removeEventListener("keydown",onKey); wrapEl.remove(); };
  const onKey=(ev)=>{ if(ev.key==="Escape") close(); };
  wrapEl.querySelector<HTMLElement>("#share-x").onclick=close;
  wrapEl.onclick=(ev)=>{ if(ev.target===wrapEl) close(); };
  document.body.appendChild(wrapEl);
  document.addEventListener("keydown",onKey);
  statEvent("sharecard");
  makeShareCard().then(url=>{
    const body=wrapEl.querySelector<HTMLElement>(".share-body");
    if(!body) return;
    if(!url){ body.innerHTML=`<div class="share-loading">这台设备生成不了图片，直接截图也一样能发。</div>`; return; }
    body.innerHTML=`<img class="share-img" alt="生涯名片" src="${url}">`;
    const dl: any=wrapEl.querySelector<HTMLElement>("#share-dl");
    if(dl){ dl.href=url; dl.hidden=false; }
    const save: any=wrapEl.querySelector<HTMLElement>("#share-save");
    const tip: any=wrapEl.querySelector<HTMLElement>("#share-tip");
    const file=dataUrlToFile(url,SHARE_FILE);
    if(save&&file&&canShareFile(file)){
      save.hidden=false;
      save.onclick=()=>{
        statEvent("sharesave");
        // 用户取消分享会抛 AbortError——那不是错误，什么都不做
        try{ (navigator as any).share({files:[file],title:"破晓 · 生涯名片",text:SHARE_TEXT}).catch(()=>{}); }catch(e){}
      };
      if(tip) tip.textContent="点「存到相册」走系统菜单，也可以长按图片保存";
    }else if(tip){
      tip.textContent="长按图片保存到相册；「下载图片」存到的是「文件」App 的下载项";
    }
  });
}
