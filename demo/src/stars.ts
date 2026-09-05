import { findTeam } from "./intl";
import { DIMS, SEASONS, SPLITS, addFans, avg, ovrOf, pushEvent } from "./main";
import { S } from "./state";

/* ================= 明星选手：存在感 =================

   玩家原话：「明星选手不管是 LPL 还是其他赛区的存在感都不够强，不管是对位
   的时候还是即将遇到的时候，被击败或战胜都要更有感觉」；
   「职业选手的聚光灯不要写段位，写他们的履历——明星之所以是明星是因为他们的履历」。

   这套东西不改任何胜率——存在感是叙事，不是 buff。三处落点：
   · 赛前备战：对位聚光灯（同位置的明星，带履历）/ 对面阵中（其他位置的明星）
   · 比赛卡：一行对位徽章
   · 赛后：击败对位明星有专门的高光事件（热度/粉丝，一个赛段一位一次）；
     被明星上课也有一句，让你记住是谁
   名单以 2022 库里的真名为键，转会了跟着人走；库里没有的名字永远不会匹配。
   履历 h 写到 2021 赛季（S11）为止——游戏从 2022 开始，之后的冠军由本作的世界线
   自己写进去（S.honors + 季后赛缓存），你改写了历史，他们的履历就跟着变。 */

export const STARS={
  /* LPL */
  Uzi:{ep:"永远的狂小狗", t:"ADC 的代名词——退役又复出，手还在",
    h:"MSI 2018 冠军 · LPL 2016 春 / 2018 春夏冠军 · S3、S4 世界赛亚军 · 2018 亚运会金牌"},
  TheShy:{ep:"上路单杀机器", t:"对线期每一次换血都可能是终结",
    h:"S8 世界冠军 · LPL 2019 春季冠军"},
  Rookie:{ep:"宿命中单", t:"S8 冠军中单，LPL 外援的天花板",
    h:"S8 世界冠军 · LPL 2019 春季冠军 · 2018 LPL 常规赛 MVP"},
  Jiejie:{ep:"EDG 的野区发动机", t:"S11 冠军打野，节奏从他手上起",
    h:"S11 世界冠军 · LPL 2021 春季冠军"},
  Scout:{ep:"S11 决赛 MVP", t:"稳到可怕的中单",
    h:"S11 世界冠军 · S11 决赛 MVP · LPL 2021 春季冠军"},
  Viper:{ep:"毒蛇", t:"S11 冠军 AD，团战永远站在最正确的位置",
    h:"S11 世界冠军 · LPL 2021 春季冠军"},
  Knight:{ep:"天才中单", t:"LPL 本土中单的招牌",
    h:"LPL 2020 夏季冠军 · 2020 LPL 夏季 MVP · S10 世界赛四强"},
  Bin:{ep:"上路杀神", t:"S10 决赛五杀剑魔",
    h:"S10 世界赛亚军（决赛五杀剑魔）· LPL 2020 夏季亚军"},
  GALA:{ep:"MSI 双冠 AD", t:"团战后手拉满",
    h:"MSI 2021 冠军 · LPL 2021 春季冠军"},
  Xiaohu:{ep:"虎将", t:"中单改上单再改回来的老将",
    h:"MSI 2018、2021 冠军 · LPL 四冠（2016 春、2018 春夏、2021 春）"},
  "369":{ep:"上路铁人", t:"一个人守一条边",
    h:"LPL 2020 夏季冠军 · S10 世界赛四强"},
  Kanavi:{ep:"野区野兽", t:"MVP 级的打野",
    h:"LPL 2020 春季冠军 · 2020 LPL 春季 MVP"},
  Doinb:{ep:"S9 冠军中单", t:"一手把节奏带出来的怪才",
    h:"S9 世界冠军 · LPL 2019 夏季冠军 · 2019 LPL 夏季 MVP"},
  Ming:{ep:"辅助之光", t:"RNG 王朝的辅助",
    h:"MSI 2018、2021 冠军 · LPL 四冠（2016 春、2018 春夏、2021 春）"},
  Wei:{ep:"野区节拍器", t:"MSI 冠军打野",
    h:"MSI 2021 冠军 · LPL 2021 春季冠军"},
  Yagao:{ep:"中路老将", t:"JDG 的定海神针",
    h:"LPL 2020 春季冠军"},
  Crisp:{ep:"辅助大脑", t:"S9 冠军辅助",
    h:"S9 世界冠军 · LPL 2019 夏季冠军"},
  Tian:{ep:"S9 决赛 MVP", t:"关键局从不手软的打野",
    h:"S9 世界冠军 · S9 决赛 MVP · LPL 2019 夏季冠军"},
  /* LCK */
  Faker:{ep:"大魔王", t:"不解释",
    h:"S3、S5、S6 世界冠军 · MSI 2016、2017 冠军 · LCK 九冠"},
  ShowMaker:{ep:"DK 的魔法师", t:"S10 冠军中单",
    h:"S10 世界冠军 · LCK 2020 夏 / 2021 春夏冠军 · 2020 LCK 夏季 MVP"},
  Chovy:{ep:"对线教科书", t:"领先 20 刀是常态",
    h:"2019-2021 连续三届世界赛 · LCK 三次决赛（2018 夏、2019 春夏）"},
  Deft:{ep:"金东河", t:"十年老将，还在等一座冠军",
    h:"MSI 2015 冠军 · LPL 2015 春季冠军 · LCK 2014 春季冠军"},
  Ruler:{ep:"S7 冠军 AD", t:"后期决胜的 AD",
    h:"S7 世界冠军 · S6 世界赛亚军 · 2018 亚运会金牌"},
  Canyon:{ep:"S10 冠军打野", t:"野区节奏的天花板",
    h:"S10 世界冠军 · S10 决赛 MVP · LCK 2020 夏 / 2021 春夏冠军 · 2020 LCK 夏季 MVP"},
  Zeus:{ep:"新生代上单", t:"操作没有天花板",
    h:"T1 青训直升首发 · 2021 LCK 首秀"},
  Keria:{ep:"辅助鬼才", t:"什么英雄都能开发成辅助",
    h:"2020 LCK 最佳新人 · S11 世界赛四强"},
  Gumayusi:{ep:"T1 的稳定器", t:"团战里最难被杀的 AD",
    h:"S11 世界赛四强"},
  Oner:{ep:"T1 的节拍器", t:"前期节奏的发起点",
    h:"S11 世界赛四强 · 2021 LCK 首秀"},
  Peanut:{ep:"花生", t:"老牌打野，还是那么凶",
    h:"MSI 2017 冠军 · LCK 2016 夏 / 2017 春夏冠军 · S6、S7 世界赛亚军"},
  Kiin:{ep:"上路稳定器", t:"没有明显短板",
    h:"S8 世界赛八强 · LCK 2018 春季亚军"},
  Bdd:{ep:"中路老将", t:"对线细节拉满",
    h:"S11 世界赛四强 · LCK 2021 春季亚军"},
  BeryL:{ep:"S10 冠军辅助", t:"游戏理解怪物",
    h:"S10 世界冠军 · S11 世界赛亚军 · LCK 2020 夏 / 2021 春夏冠军"},
  /* LEC */
  Caps:{ep:"欧洲之王", t:"LEC 十冠中单",
    h:"MSI 2019 冠军 · LEC 六冠（2018 春夏、2019 春夏、2020 春夏）· S8、S9 世界赛亚军"},
  Jankos:{ep:"第一滴血之王", t:"欧洲最会入侵的打野",
    h:"MSI 2019 冠军 · LEC 2019 春夏 / 2020 春夏冠军 · S9 世界赛亚军"},
  Rekkles:{ep:"欧洲 AD 传奇", t:"稀有的不死 AD",
    h:"LEC 六冠 · S8 世界赛亚军"},
  Upset:{ep:"欧洲第一 AD", t:"操作与稳健兼备",
    h:"LEC 2021 夏季亚军 · 2021 世界赛"},
  Humanoid:{ep:"欧洲中路新王", t:"MAD 的核心",
    h:"LEC 2021 春夏冠军 · S11 世界赛八强"},
  /* LCS */
  Bjergsen:{ep:"北美中单之神", t:"TSM 的图腾",
    h:"LCS 六冠 · 2020 LCS MVP"},
  CoreJJ:{ep:"S7 冠军辅助", t:"北美最会开团的人",
    h:"S7 世界冠军 · LCS 2019 春夏 / 2020 春季冠军 · MSI 2019 亚军"},
  Impact:{ep:"S3 冠军上单", t:"老兵不死",
    h:"S3 世界冠军 · LCS 2019 春夏 / 2020 春季冠军"},
  Blaber:{ep:"北美野王", t:"C9 的发动机",
    h:"LCS 2020、2021 春季冠军 · 2020 LCS 春季 MVP"}
};

export function starOf(id){ return id&&STARS[id] ? Object.assign({id}, STARS[id]) : null; }
export function rosterOf(teamName){
  const t=findTeam(teamName);
  return (t&&t.players)||[];
}
/* 对面阵里所有明星（带位置和数值） */
export function starsOf(teamName){
  return rosterOf(teamName).filter(p=>p&&!p.me&&STARS[p.id]).map(p=>Object.assign({p,team:teamName}, starOf(p.id)));
}
/* 同位置的明星——真正要对线的那个 */
export function laneStar(teamName){
  return starsOf(teamName).find(s=>s.p.pos===S.pos)||null;
}
export function myOvr(){ return avg(DIMS.map(d=>S.attrs[d])); }

/* 本作里新写进去的履历：世界线上他所在的队在哪一年拿了什么。
   国际赛由 S.honors 记（intlChampEvent / crownChampion 落账），联赛冠军读季后赛缓存
   （majorStandings 的 poCache）；你自己亲手拿的那个赛段不算在他们头上。 */
export function starInGameHonors(teamName){
  const out=[];
  try{
    const H=S.honors||{};
    Object.keys(H.worlds||{}).forEach(si=>{ if(H.worlds[si]===teamName) out.push(`${SEASONS[+si].tag} 世界冠军`); });
    Object.keys(H.msi||{}).forEach(si=>{ if(H.msi[si]===teamName) out.push(`${SEASONS[+si].tag} MSI 冠军`); });
    const mine=(S.career&&S.career.titles)||[];
    Object.keys(S.poCache||{}).forEach(k=>{
      const [si,sp,lg]=k.split("|"); const res=S.poCache[k];
      if(!res||res[0]!==teamName) return;
      const tag=`${SEASONS[+si].tag} ${lg}${SPLITS[+sp]||""}`;
      if(mine.includes(tag)) return;                  // 那座是你亲手拿的
      out.push(`${SEASONS[+si].tag} ${lg} ${SPLITS[+sp]||""}冠军`);
    });
  }catch(e){}
  return out;
}

/* 赛前一句：按差距说人话，不装神弄鬼 */
export function starPrepLine(s){
  const gap=ovrOf(s.p)-myOvr();
  if(gap>=10) return `他大概不会把你当对手——但也不会给你任何机会。<b>别送，把这场当成一堂课。</b>`;
  if(gap>=4)  return `账面上他压你一头。<b>对线期少换血，等团战找机会。</b>`;
  if(gap>=-3) return `数值上你们已经站在同一层。<b>这一场会被拿出来反复看。</b>`;
  return `现在轮到<b>他</b>研究<b>你</b>了。别飘——名字比数值多活好几年。`;
}

/* 备战卡里的聚光灯：对位的明星单独一块（带履历），其余明星列一行 */
export function starSpotHtml(teamName){
  if(!S.career) return "";
  const all=starsOf(teamName); if(!all.length) return "";
  const lane=all.find(s=>s.p.pos===S.pos);
  const others=all.filter(s=>!lane||s.id!==lane.id);
  let h="";
  if(lane){
    const ig=starInGameHonors(teamName);
    h+=`<div class="ver" style="border-left:3px solid var(--gold);padding-left:10px;margin-top:10px">
      <div style="font-size:11px;letter-spacing:.08em;color:var(--ink-3)">对位聚光灯</div>
      <div style="font-size:15px;margin:2px 0"><b>${lane.id}</b> · ${lane.ep}${lane.p.cn?`<span style="color:var(--ink-3)">（${lane.p.cn}）</span>`:""}
        <span class="tag">实力 ${ovrOf(lane.p).toFixed(0)} · 你 ${myOvr().toFixed(0)}</span></div>
      <div style="color:var(--gold);font-size:12.5px;margin:2px 0">履历：${lane.h||"—"}${ig.length?`　<span style="color:var(--cyan)">本作：${ig.join(" · ")}</span>`:""}</div>
      <div style="color:var(--ink-2);font-size:12.5px">${lane.t}。${starPrepLine(lane)}</div></div>`;
  }
  if(others.length){
    h+=`<div class="ver" style="margin-top:8px;color:var(--ink-2);font-size:12.5px">对面阵中：${
      others.map(s=>`<b>${s.id}</b>（${s.ep}）`).join("、")}——<span style="color:var(--ink-3)">${
      lane?"不止一个人要防。":"你的对位不是明星，但他们的节奏会从别处压过来。"}</span></div>`;
  }
  return h;
}
/* 比赛卡里的一行徽章 */
export function starLaneBadge(teamName){
  if(!S.career) return "";
  const lane=laneStar(teamName);
  const all=starsOf(teamName);
  if(!lane&&!all.length) return "";
  return `<div class="ver" style="text-align:center;margin-top:-4px;color:var(--ink-2);font-size:12px">${
    lane?`对位 <b style="color:var(--gold)">${lane.id}</b> · ${lane.ep}`:`对面有 ${all.map(s=>`<b>${s.id}</b>`).join("、")}`}</div>`;
}

/* 赛后回响：一个赛段里同一位明星只发一次高光，免得刷屏。
   不动胜率、不动属性——只动热度和粉丝（击败明星本来就是上热搜的事）。 */
export function starAfterMatch(m,won,ctx){
  try{
    if(!S.career||!m||!m.oppName) return;
    const all=starsOf(m.oppName); if(!all.length) return;
    S.starSeen=S.starSeen||{};
    const key=id=>`${S.si}|${S.split||0}|${S.intl?"i":"l"}|${id}`;
    const lane=all.find(s=>s.p.pos===S.pos);
    const big=(ctx&&ctx.intl)||(m.need>=3);
    if(won){
      if(lane&&!S.starSeen[key(lane.id)]){
        S.starSeen[key(lane.id)]=1;
        const outlaned=ctx&&ctx.laneWon;
        addFans(big?22:14);
        pushEvent(`<b>击败 ${lane.id}（${lane.ep}）。</b>${outlaned
          ?`对位数据压过了他——这种截图会在圈里传很久。`
          :`对线没占到便宜，但比分是 ${m.sc[0]}:${m.sc[1]}——赢的是五个人。`}${
          big?`<br><span style="color:var(--ink-3)">大场面赢下他，你的名字第一次被放在他旁边念。</span>`:""}`,"big","高光");
      } else if(!lane){
        const s=all[0];
        if(!S.starSeen[key("T:"+s.id)]){ S.starSeen[key("T:"+s.id)]=1; addFans(big?10:6);
          pushEvent(`掀翻了有 <b>${s.id}</b>（${s.ep}）的 ${m.oppName}。你的对位不是他，但击败他的队伍，赛后采访问的全是他。`,"good","高光"); }
      }
    } else if(lane){
      const gap=ovrOf(lane.p)-myOvr();
      if(gap>=4&&!S.starSeen[key("L:"+lane.id)]){
        S.starSeen[key("L:"+lane.id)]=1;
        pushEvent(`<b>${lane.id}</b> 给你上了一课。对线细节、视野、换血时机——${lane.ep}不是白叫的。
          <span style="color:var(--ink-3)">复盘把这场标红：下次见他之前，把差距缩到两位数以内。</span>`,"info","对位");
      }
    }
  }catch(e){}
}
