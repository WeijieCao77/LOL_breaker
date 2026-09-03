/* ================= 明星选手：存在感 =================

   玩家原话：「明星选手不管是 LPL 还是其他赛区的存在感都不够强，不管是对位
   的时候还是即将遇到的时候，被击败或战胜都要更有感觉」。

   这套东西不改任何胜率——存在感是叙事，不是 buff。三处落点：
   · 赛前备战：对位聚光灯（同位置的明星）/ 对面阵中（其他位置的明星）
   · 比赛卡：一行对位徽章
   · 赛后：击败对位明星有专门的高光事件（热度/粉丝，一个赛段一位一次）；
     被明星上课也有一句，让你记住是谁
   名单以 2022 库里的真名为键，转会了跟着人走；库里没有的名字永远不会匹配。 */

const STARS={
  /* LPL */
  Uzi:{ep:"永远的狂小狗", t:"ADC 的代名词——退役又复出，手还在"},
  TheShy:{ep:"上路单杀机器", t:"对线期每一次换血都可能是终结"},
  Rookie:{ep:"宿命中单", t:"S8 冠军中单，LPL 外援的天花板"},
  JieJie:{ep:"EDG 的野区发动机", t:"S11 冠军打野，节奏从他手上起"},
  Scout:{ep:"S11 决赛 MVP", t:"稳到可怕的中单"},
  Viper:{ep:"毒蛇", t:"S11 冠军 AD，团战永远站在最正确的位置"},
  Knight:{ep:"天才中单", t:"LPL 本土中单的招牌"},
  Bin:{ep:"上路杀神", t:"S10 决赛五杀剑魔"},
  GALA:{ep:"MSI 双冠 AD", t:"团战后手拉满"},
  Xiaohu:{ep:"虎将", t:"中单改上单再改回来的老将"},
  "369":{ep:"上路铁人", t:"一个人守一条边"},
  Kanavi:{ep:"野区野兽", t:"MVP 级的打野"},
  Doinb:{ep:"S9 冠军中单", t:"一手把节奏带出来的怪才"},
  Ming:{ep:"辅助之光", t:"RNG 王朝的辅助"},
  Wei:{ep:"野区节拍器", t:"MSI 冠军打野"},
  Yagao:{ep:"中路老将", t:"JDG 的定海神针"},
  Crisp:{ep:"辅助大脑", t:"S9 冠军辅助"},
  Tian:{ep:"S9 决赛 MVP", t:"关键局从不手软的打野"},
  /* LCK */
  Faker:{ep:"大魔王", t:"不解释"},
  ShowMaker:{ep:"DK 的魔法师", t:"S10 冠军中单"},
  Chovy:{ep:"对线教科书", t:"领先 20 刀是常态"},
  Deft:{ep:"金东河", t:"十年老将，还在等一座冠军"},
  Ruler:{ep:"S7 冠军 AD", t:"后期决胜的 AD"},
  Canyon:{ep:"S10 冠军打野", t:"野区节奏的天花板"},
  Zeus:{ep:"新生代上单", t:"操作没有天花板"},
  Keria:{ep:"辅助鬼才", t:"什么英雄都能开发成辅助"},
  Gumayusi:{ep:"T1 的稳定器", t:"团战里最难被杀的 AD"},
  Oner:{ep:"T1 的节拍器", t:"前期节奏的发起点"},
  Peanut:{ep:"花生", t:"老牌打野，还是那么凶"},
  Kiin:{ep:"上路稳定器", t:"没有明显短板"},
  Bdd:{ep:"中路老将", t:"对线细节拉满"},
  BeryL:{ep:"S10 冠军辅助", t:"游戏理解怪物"},
  /* LEC */
  Caps:{ep:"欧洲之王", t:"LEC 十冠中单"},
  Jankos:{ep:"第一滴血之王", t:"欧洲最会入侵的打野"},
  Rekkles:{ep:"欧洲 AD 传奇", t:"稀有的不死 AD"},
  Upset:{ep:"欧洲第一 AD", t:"操作与稳健兼备"},
  Humanoid:{ep:"欧洲中路新王", t:"MAD 的核心"},
  /* LCS */
  Bjergsen:{ep:"北美中单之神", t:"TSM 的图腾"},
  CoreJJ:{ep:"S7 冠军辅助", t:"北美最会开团的人"},
  Impact:{ep:"S3 冠军上单", t:"老兵不死"},
  Blaber:{ep:"北美野王", t:"C9 的发动机"}
};

function starOf(id){ return id&&STARS[id] ? Object.assign({id}, STARS[id]) : null; }
function rosterOf(teamName){
  const t=(typeof findTeam==="function")?findTeam(teamName):null;
  return (t&&t.players)||[];
}
/* 对面阵里所有明星（带位置和数值） */
function starsOf(teamName){
  return rosterOf(teamName).filter(p=>p&&!p.me&&STARS[p.id]).map(p=>Object.assign({p}, starOf(p.id)));
}
/* 同位置的明星——真正要对线的那个 */
function laneStar(teamName){
  return starsOf(teamName).find(s=>s.p.pos===S.pos)||null;
}
function myOvr(){ return avg(DIMS.map(d=>S.attrs[d])); }

/* 赛前一句：按差距说人话，不装神弄鬼 */
function starPrepLine(s){
  const gap=ovrOf(s.p)-myOvr();
  if(gap>=10) return `他大概不会把你当对手——但也不会给你任何机会。<b>别送，把这场当成一堂课。</b>`;
  if(gap>=4)  return `账面上他压你一头。<b>对线期少换血，等团战找机会。</b>`;
  if(gap>=-3) return `数值上你们已经站在同一层。<b>这一场会被拿出来反复看。</b>`;
  return `现在轮到<b>他</b>研究<b>你</b>了。别飘——名字比数值多活好几年。`;
}

/* 备战卡里的聚光灯：对位的明星单独一块，其余明星列一行 */
function starSpotHtml(teamName){
  if(!S.career) return "";
  const all=starsOf(teamName); if(!all.length) return "";
  const lane=all.find(s=>s.p.pos===S.pos);
  const others=all.filter(s=>!lane||s.id!==lane.id);
  let h="";
  if(lane){
    h+=`<div class="ver" style="border-left:3px solid var(--gold);padding-left:10px;margin-top:10px">
      <div style="font-size:11px;letter-spacing:.08em;color:var(--ink-3)">对位聚光灯</div>
      <div style="font-size:15px;margin:2px 0"><b>${lane.id}</b> · ${lane.ep}${lane.p.cn?`<span style="color:var(--ink-3)">（${lane.p.cn}）</span>`:""}
        <span class="tag">综合 ${ovrOf(lane.p).toFixed(0)} · 你 ${myOvr().toFixed(0)}</span></div>
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
function starLaneBadge(teamName){
  if(!S.career) return "";
  const lane=laneStar(teamName);
  const all=starsOf(teamName);
  if(!lane&&!all.length) return "";
  return `<div class="ver" style="text-align:center;margin-top:-4px;color:var(--ink-2);font-size:12px">${
    lane?`对位 <b style="color:var(--gold)">${lane.id}</b> · ${lane.ep}`:`对面有 ${all.map(s=>`<b>${s.id}</b>`).join("、")}`}</div>`;
}

/* 赛后回响：一个赛段里同一位明星只发一次高光，免得刷屏。
   不动胜率、不动属性——只动热度和粉丝（击败明星本来就是上热搜的事）。 */
function starAfterMatch(m,won,ctx){
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
