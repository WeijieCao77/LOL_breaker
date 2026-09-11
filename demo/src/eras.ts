/* ================= 纪元 =================

   一个纪元 = 一个自带名单、赛制、赛区水位的世界。作者 2026-09-08 定的两条规矩：
   · **不同纪元的数据不共通** —— 各带各的名单快照，互不引用
   · **每个纪元用自己的标尺** —— 各带各的 REGION_ANCHOR，不做跨年代校准

   第二条是关键的简化：原来最难的一件事是「让 2016 的选手数据和 2022 的落在同一把尺上」，
   现在直接不做了。anchorLeague 本来就会把每个联赛的均值钉到该赛区的锚点，
   所以手写数据只要**联赛内部的相对强弱**是对的，绝对值由纪元自己的锚点决定。

   这个文件只放数据表，不 import 任何游戏模块（除了静态 JSON），
   避免循环引用。切换动作在 state.ts 的 applyEra，各模块自己登记回调。

   ---------- 怎么加一个纪元 ----------
   框架已经就位，加纪元是填槽，不是改逻辑。四步：

   1) 数据：仿 data/build_era_2016.py 写一份生成脚本，产出 data/csv/game_data_<年>.json。
      形状见那个脚本；只要**联赛内部的相对强弱**对，绝对值由下面的 anchor 决定。
   2) 在这个文件里加四张表：SEASONS_xx（每季的赛制与版本主题）、ANCHOR_xx（赛区水位
      ＝这个纪元的标尺）、DYNASTY_xx（赛区年份统治力）、HOSTS_xx（世界赛主办地）。
      可选：STARS_xx（明星履历，写到开局前一年）、CODE_xx（战队简称）、
      CANON_xx（史实层，留空就是自由模拟）、LDL_xx（次级联赛名单，留空回落生成名）。
   3) 在 ERAS 里注册一条，把 ERA_KEYS 补上。
   4) 跑 npm test —— 纪元自检（demo/test.ts 的 eraChecks）会把每个注册过的纪元
      逐个校验数据形状并整局跑一遍。缺字段、位置不齐、赛区没锚点、赛季表越界
      都会点名报错，跑不完也会红。

   引擎侧不需要动。唯一动过引擎的一次是「2016 世界赛没有入围赛」——
   buildWorldsField 原来假定 cfg.playin 一定存在；现在 playin 缺省就是没有入围赛。
   以后遇到别的历史赛制（比如 S3–S5 没有 MSI），同样是在引擎里补一个形态，
   而不是给某个纪元开特例。

   ---------- 以后要做的（作者 2026-09-08 定的方向）----------
   现在是「各纪元独立、各用各的标尺」。以后可能会：
   · **把纪元连起来** —— 打完 S6–S11 接着进 S12–S16，同一个角色跨纪元。
     现在挡路的是：SEASONS 是整表替换、S.era 建档时定死、生涯长度按纪元算。
     真要做的话，得把「赛季表」从纪元的属性改成一条可拼接的时间轴，
     年龄曲线和退役线也要按总年数重算——不是小改动，但现在这套结构没有堵死它。
   · **统一标尺** —— 各纪元的 anchor 合并成一张跨年代可比的表。
     那时候 anchorLeague 的调用方式不用变，改的是 anchor 的来源，
     所以这一步反而比连起来容易。
   两件事都不在现在的范围内，先把单个纪元做扎实。 */
import gameData2022 from "../../data/csv/game_data_2022.json";
import gameData2016 from "../../data/csv/game_data_2016.json";

/* ---------- 破晓纪元（现状，S12–S16 + 再战到 S19）----------
   这一份是原样搬过来的，一个数都没动——普通存档读进来必须和以前逐字节一致。 */
const SEASONS_S12=[
  {y:2022,tag:"S12",ver:"射手与龙魂",fav:["bot","sup"],dim:"操作",
   story:"LCK 卷土重来。你刚进联赛，没人认识你。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:12,take:4,bo:2},main:"groups"}},
  {y:2023,tag:"S13",ver:"打野节奏",fav:["jng"],dim:"运营",
   story:"版本变了。上个赛季管用的东西，这个赛季不一定管用。",
   msi:{mode:"double",playin:{teams:4,take:2,bo:3}},
   worlds:{playin:{teams:8,take:2,bo:2},main:"swiss"}},
  {y:2024,tag:"S14",ver:"上路单带",fav:["top"],dim:"心态",
   story:"LCK 已经连冠两年。舆论开始说这个赛区不行了。",
   msi:{mode:"double"},
   worlds:{playin:{teams:8,take:4,bo:2},main:"swiss"}},
  {y:2025,tag:"S15",ver:"无畏征召",fav:["mid","jng"],dim:"指挥",fearless:true,
   story:"无畏征召元年——同一个英雄一个系列赛只能用一次。英雄池深的人笑了。",
   msi:{mode:"double",playin:{teams:4,take:2,bo:3}},
   worlds:{playin:{teams:8,take:2,bo:3},main:"swiss"}},
  {y:2026,tag:"S16",ver:"中野联动",fav:["mid","jng"],dim:"运营",fearless:true,
   story:"最后一年。再拿不下，至暗时刻就写进历史了。",
   msi:{mode:"double",playin:{teams:4,take:1,bo:3}},
   worlds:{playin:{teams:4,take:1,bo:3},main:"swiss"}},
  {y:2027,tag:"S17",ver:"野核回归",fav:["jng"],dim:"操作",fearless:true,
   story:"第六年。和你同期出道的人大多已经退役——你还在。",
   msi:{mode:"double",playin:{teams:4,take:1,bo:3}},
   worlds:{playin:{teams:4,take:1,bo:3},main:"swiss"}},
  {y:2028,tag:"S18",ver:"双人路时代",fav:["bot","sup"],dim:"心态",fearless:true,
   story:"新人一年比一年快。你得靠别的东西赢。",
   msi:{mode:"double",playin:{teams:4,take:1,bo:3}},
   worlds:{playin:{teams:4,take:1,bo:3},main:"swiss"}},
  {y:2029,tag:"S19",ver:"全能中单",fav:["mid"],dim:"指挥",fearless:true,
   story:"最后一年。这一次是真的。",
   msi:{mode:"double",playin:{teams:4,take:1,bo:3}},
   worlds:{playin:{teams:4,take:1,bo:3},main:"swiss"}}
];

/* ---------- 魔王与首冠（S6–S11，2016–2021）----------
   六年，一整条弧线：SKT 的最后一座 → 三星的暗夜 → **IG 首冠** → FPX → DWG → EDG。
   你从 2016 出道，正好赶上「LPL 什么时候能赢」这个问题被回答的那几年。

   赛制按史实填：
   · 2016 世界赛没有入围赛，16 队直接小组赛
   · 2017 起有入围赛（play-in）
   · MSI 全程是小组赛制（双败是 2023 之后的事）

   ⚠ 一处**有意的偏离**：2020 年的 MSI 现实中因疫情取消了。引擎目前假定每年都有 MSI
   （intl.ts 里 F.msi.mode 是无保护解引用），做「这一年没有 MSI」要动赛季日程、
   pendingIntl 等一串东西，不属于 demo 范围。所以 S10 这一年照常有 MSI，
   在 story 里点了一句。要不要补这个形态，作者定。 */
const SEASONS_S6=[
  {y:2016,tag:"S6",ver:"大龙节奏",fav:["jng","mid"],dim:"运营",
   story:"魔王还在王座上。LPL 一座世界冠军都没有，所有人都在等那个人出现。",
   msi:{mode:"groups"},
   worlds:{main:"groups"}},                                  // 2016：无入围赛，16 队小组赛
  {y:2017,tag:"S7",ver:"艾克与船长",fav:["top"],dim:"操作",
   story:"入围赛第一次出现。决赛那晚，三星把魔王拉下了马——但赢的还不是我们。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:12,take:4,bo:2},main:"groups"}},
  {y:2018,tag:"S8",ver:"打野失业",fav:["top","bot"],dim:"操作",
   story:"这一年被记住的原因只有一个。仁川的那个夜晚，问题终于有了答案。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:12,take:4,bo:2},main:"groups"}},
  {y:2019,tag:"S9",ver:"云顶之前",fav:["mid","sup"],dim:"指挥",
   story:"卫冕比夺冠难。有人说去年是偶然，这一年要证明不是。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:12,take:4,bo:2},main:"groups"}},
  {y:2020,tag:"S10",ver:"空场之年",fav:["jng","bot"],dim:"心态",
   story:"空场、隔离、上海的决赛。这一年的 MSI 现实中没有打成——游戏里照常有。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:10,take:4,bo:2},main:"groups"}},
  {y:2021,tag:"S11",ver:"传送与先锋",fav:["top","jng"],dim:"运营",
   story:"第六年。冰岛的雨季，最后一场 BO5 打到第五局。",
   msi:{mode:"groups"},
   worlds:{playin:{teams:10,take:4,bo:2},main:"groups"}}
];

/* 各纪元的赛区水位（这就是「每个纪元自己的标尺」）。
   S6 纪元：LCK 明显更高（魔王期的统治力是真的），LPL 在追但没追上；
   LMS 那几年还是准一线（Flash Wolves 打过 SKT），比现在的 PCS 高一截。 */
const ANCHOR_S12={LCK:71.5,LPL:70,LEC:68,LCS:66.5,PCS:63,VCS:62.5,LJL:60.5,LLA:60,CBLOL:60,LCO:59,TCL:59.5,
  LCP:63};   // LCP：真实时间线 2025 年新设的赛区（PCS/VCS/LJL 头部），按 PCS 的锚；老档里没有这个键
const ANCHOR_S6 ={LCK:72.5,LPL:68.5,LMS:65.5,LEC:65,LCS:63,VCS:61,LJL:59,LLA:58.5,CBLOL:58.5,TCL:58.5};

/* 赛区年份统治力：S6 纪元的 LCK 从 S6 的顶峰一路下滑到 S11 的零。
   这条曲线就是「魔王纪元怎么结束的」——数值上说的和故事说的是同一件事。 */
const DYNASTY_S12=[1.6,2.2,2.2,0.9,0];
const DYNASTY_S6 =[2.6,2.0,1.0,0.4,0.6,0];   // 2016 顶峰 → 2018 IG 那年塌下来 → 2021 归零

/* 世界赛主办地（出征仪式的时差用） */
const HOSTS_S12={2022:{c:"旧金山",h:12},2023:{c:"首尔",h:2},2024:{c:"伦敦",h:11},2025:{c:"成都",h:3}};
const HOSTS_S6 ={2016:{c:"洛杉矶",h:15},2017:{c:"北京",h:0},2018:{c:"仁川",h:1},
                 2019:{c:"巴黎",h:6},2020:{c:"上海",h:0},2021:{c:"雷克雅未克",h:8}};

/* ---------- 史实层 ----------
   引擎里已经有一套「史实闸门」（intl.ts 的 convergeChamp）：模拟出的冠军如果正主还在场、
   又没被你亲手打掉，就按 1−世界线张力 的概率收束回史实。所以这层必须**跟着纪元走**，
   否则 S6 纪元的 si=0 会去查 2022 那份，把 Kiwoom DRX 拉进 2016 年的世界赛。

   四张表都按 si 索引，消费点全部带 `if(表[S.si])` 的守卫——**缺数据就是自由模拟**，
   所以后期再补是安全的，不用一次填满。
   · intl   国际赛冠军（世界赛 / MSI）
   · worlds / msi / league  各赛区的参赛席位与联赛冠军（席位剧本）

   S6 纪元现在只填了国际赛冠军里**队名在 2016 快照里存在**的那几年：
   2019 的 FPX、2020 的 DAMWON 在 2016 还没成立，写了也匹配不上（会被守卫挡掉），
   等以后做「战队成立 / 改名」再补。席位剧本三张表留空，等真实数据。 */
const CANON_S6={
  intl:{
    worlds:{0:"SK Telecom T1",1:"Samsung Galaxy",2:"Invictus Gaming",5:"Edward Gaming"},
    msi:{0:"SK Telecom T1",1:"SK Telecom T1",2:"Royal Never Give Up",3:"G2 Esports",5:"Royal Never Give Up"}
  },
  worldsSeeds:{}, msiSeeds:{}, leagueSeeds:{}
};

/* 2022 LDL 春季赛真实首发（Leaguepedia）。新纪元没有这张表就留空，buildLDL 回落到生成的新秀名。 */
const LDL_S12={
  EDG:[{id:"Solokill",pos:"top"},{id:"Monki",pos:"jng"},{id:"0909",pos:"mid"},{id:"Leave",pos:"bot"},{id:"Xiamu",pos:"sup"}],
  TES:[{id:"Aspire",pos:"top"},{id:"eight",pos:"jng"},{id:"Novice",pos:"mid"},{id:"Ylaht",pos:"bot"},{id:"Cerasus",pos:"sup"}],
  BLG:[{id:"Myths",pos:"top"},{id:"can",pos:"jng"},{id:"pinz",pos:"mid"},{id:"Rise",pos:"bot"},{id:"Jwei",pos:"sup"}],
  JDG:[{id:"unravel",pos:"top"},{id:"Xiao17",pos:"jng"},{id:"Insulator",pos:"mid"},{id:"TuT",pos:"bot"},{id:"Feather",pos:"sup"}],
  RNG:[{id:"Xiaoxu",pos:"top"},{id:"lovely",pos:"jng"},{id:"Tangyuan",pos:"mid"},{id:"Asura",pos:"bot"},{id:"Mysun",pos:"sup"}],
  WBG:[{id:"Decade",pos:"top"},{id:"Maggie",pos:"jng"},{id:"forse",pos:"mid"},{id:"Shark",pos:"bot"},{id:"Wuy",pos:"sup"}],
  AL:[{id:"Overture",pos:"top"},{id:"icecoKe",pos:"jng"},{id:"Harder",pos:"mid"},{id:"Michi",pos:"bot"},{id:"Kaixuan",pos:"sup"}],
  TT:[{id:"xiao7",pos:"top"},{id:"Youxin",pos:"jng"},{id:"Sky",pos:"mid"},{id:"bat",pos:"bot"},{id:"Mmy",pos:"sup"}],
  RA:[{id:"torch",pos:"top"},{id:"Yesjun",pos:"jng"},{id:"DOING",pos:"mid"},{id:"Such",pos:"bot"},{id:"Parac",pos:"sup"}],
  UP:[{id:"Hery",pos:"top"},{id:"yekai",pos:"jng"},{id:"xiaocaobao",pos:"mid"},{id:"rat",pos:"bot"},{id:"Missia",pos:"sup"}],
  LGD:[{id:"Rumiki",pos:"top"},{id:"Fatfish",pos:"jng"},{id:"haichao",pos:"mid"},{id:"RanL",pos:"bot"},{id:"minghai",pos:"sup"}],
  LNG:[{id:"Clever9",pos:"top"},{id:"Darwin",pos:"jng"},{id:"Vergil",pos:"mid"},{id:"Uneasy",pos:"bot"},{id:"yawang",pos:"sup"}],
  V5:[{id:"Invincible",pos:"top"},{id:"pzx",pos:"jng"},{id:"Dream",pos:"mid"},{id:"Kepler",pos:"bot"},{id:"Jerry",pos:"sup"}],
  OMG:[{id:"Munian",pos:"top"},{id:"Mori",pos:"jng"},{id:"Steel",pos:"mid"},{id:"2y1",pos:"bot"},{id:"Guang",pos:"sup"}],
  FPX:[{id:"Kartis",pos:"top"},{id:"haoye",pos:"jng"},{id:"Qing",pos:"mid"},{id:"Xingye",pos:"bot"},{id:"Lele",pos:"sup"}],
  WE:[{id:"Demon",pos:"top"},{id:"Yanxiang",pos:"jng"},{id:"xqw",pos:"mid"},{id:"yhp",pos:"bot"},{id:"Fahai",pos:"sup"}],
  IG:[{id:"YSKM",pos:"top"},{id:"Beige",pos:"jng"},{id:"xzy",pos:"mid"},{id:"xiaoyueji",pos:"bot"},{id:"Mitsuki",pos:"sup"}]
};

/* 战队简称：没配的走 teamCode 的首字母兜底（"SK Telecom T1" 会变成 "STT"，所以头部要配） */
const CODE_S12={
  "Royal Never Give Up":"RNG","JD Gaming":"JDG","Top Esports":"TES",
  "Victory Five":"V5","EDward Gaming":"EDG","Weibo Gaming":"WBG",
  "LNG Esports":"LNG","Bilibili Gaming":"BLG","Oh My God":"OMG",
  "FunPlus Phoenix":"FPX","Rare Atom":"RA","Invictus Gaming":"IG",
  "ThunderTalk Gaming":"TT","Anyone's Legend":"AL","LGD Gaming":"LGD",
  "Ultra Prime":"UP","Team WE":"WE"
};
const CODE_S6={
  "Edward Gaming":"EDG","Royal Never Give Up":"RNG","Qiao Gu Reapers":"QG",
  "Snake Esports":"SS","Invictus Gaming":"IG","Team WE":"WE","LGD Gaming":"LGD",
  "Vici Gaming":"VG","Newbee":"NB","Masters3":"M3","Energy Pacemaker":"EP","Saint Gaming":"ST",
  "SK Telecom T1":"SKT","ROX Tigers":"ROX","Samsung Galaxy":"SSG","KT Rolster":"KT",
  "Jin Air Green Wings":"JAG","Afreeca Freecs":"AFS","Longzhu Gaming":"LZ","MVP":"MVP",
  "CJ Entus":"CJ","Kongdoo Monster":"KDM",
  "Flash Wolves":"FW","ahq e-Sports":"AHQ","J Team":"JT","Machi Esports":"M17",
  "Hong Kong Esports":"HKE","eXtreme Gamers":"XG",
  "G2 Esports":"G2","H2K Gaming":"H2K","Fnatic":"FNC","Origen":"OG","Splyce":"SPY",
  "Unicorns of Love":"UOL","Team Vitality":"VIT","Giants Gaming":"GIA",
  "Team SoloMid":"TSM","Counter Logic Gaming":"CLG","Immortals":"IMT","Cloud9":"C9",
  "Team Liquid":"TL","NRG Esports":"NRG","Echo Fox":"FOX","Phoenix1":"P1"
};


/* ---------- 明星聚光灯 ----------
   履历写到**开局前一年**为止（S6 纪元就是写到 2015），之后由玩家改写。
   只收我有把握的那些；把握不高的宁可不收——名单里没有的人永远不会被匹配，不会出错。 */
const STARS_S6={
  /* LCK */
  Faker:{ep:"大魔王",t:"这个纪元就是以他命名的",
    h:"S3、S5 世界冠军 · MSI 2015 冠军 · LCK 多冠"},
  Bengi:{ep:"魔王的影子",t:"两座世界冠军的打野，节奏都从他手上起",
    h:"S3、S5 世界冠军 · MSI 2015 冠军"},
  Bang:{ep:"S5 冠军 AD",t:"团战里最稳的那只手",h:"S5 世界冠军 · MSI 2015 冠军"},
  Wolf:{ep:"魔王的搭档",t:"辅助位上的稳定器",h:"S5 世界冠军 · MSI 2015 冠军"},
  Smeb:{ep:"上路第一人",t:"这一年他是世界最好的上单",h:"LCK 2015 亚军 · S5 世界赛四强"},
  PraY:{ep:"老练的箭",t:"打了很多年，还在最好的状态",h:"S4 世界赛四强 · S5 世界赛四强"},
  GorillA:{ep:"视野大师",t:"整张地图在他脑子里",h:"S5 世界赛四强"},
  Peanut:{ep:"野区风暴",t:"入侵起手，节奏由他定",h:"2016 LCK 新星"},
  Ambition:{ep:"转型的老将",t:"中单打不动了就去打野——然后成了最好的那个",
    h:"S2 世界赛亚军（中单）· 转打野后重生"},
  Crown:{ep:"沉默的中单",t:"不抢镜头，但从不掉链子",h:"2016 LCK 首发"},
  CuVee:{ep:"能扛的上单",t:"对线不虚任何人",h:"2016 LCK 首发"},
  Ruler:{ep:"新人 AD",t:"十八岁，手已经很稳",h:"2016 LCK 出道"},
  CoreJJ:{ep:"转位的辅助",t:"AD 转辅助，视野和开团都在线",h:"2016 转辅助"},
  Score:{ep:"KT 的发动机",t:"AD 出身的打野，运营一流",h:"LCK 老将"},
  Ssumday:{ep:"KT 铁塔",t:"上路单带能拆家",h:"LCK 多年首发"},
  MadLife:{ep:"传说中的钩子",t:"一代辅助的代名词",h:"S2 世界赛亚军 · LCK 传奇辅助"},
  Marin:{ep:"S5 冠军上单",t:"决赛 MVP，这一年他来了 LPL",
    h:"S5 世界冠军 · S5 决赛 MVP"},
  /* LPL */
  Uzi:{ep:"永远的狂小狗",t:"两次决赛，两次亚军。这一年他还年轻",
    h:"S3、S4 世界赛亚军 · LPL 2016 春季亚军"},
  Clearlove:{ep:"厂长",t:"LPL 打野的招牌",h:"MSI 2015 冠军 · LPL 多冠"},
  Deft:{ep:"金东河",t:"MSI 冠军 AD，来 LPL 的第二年",h:"MSI 2015 冠军 · LPL 2015 春季冠军"},
  Meiko:{ep:"少年辅助",t:"很小就打上了首发，指挥比年龄老成",h:"MSI 2015 冠军 · LPL 多冠"},
  Rookie:{ep:"IG 的中单",t:"个人能力顶级，队伍还没跟上",h:"LPL 多年首发"},
  Mlxg:{ep:"野区莽夫",t:"入侵和开团都不讲道理",h:"LPL 2016 春季亚军"},
  imp:{ep:"S4 冠军 AD",t:"三星白的那一年他是世界第一 AD",h:"S4 世界冠军"},
  Doinb:{ep:"路人王",t:"打法古怪，但赢",h:"LPL 首发"},
  Scout:{ep:"SKT 出来的少年",t:"在魔王身后坐了一年，现在自己上",h:"2016 加盟 LPL"},
  Easyhoon:{ep:"稳如老狗",t:"和魔王轮换过的中单",h:"MSI 2015 冠军 · S5 世界赛四强"},
  /* LMS */
  Karsa:{ep:"闪电狼的核心",t:"这几年 LMS 最好的打野",h:"S5 世界赛八强 · LMS 多冠"},
  Maple:{ep:"枫神",t:"关键局敢开大的中单",h:"S5 世界赛八强 · LMS 多冠"},
  SwordArT:{ep:"辅助大脑",t:"开团时机永远对",h:"S5 世界赛八强 · LMS 多冠"},
  Westdoor:{ep:"劫皇",t:"一手劫打了很多年",h:"LMS 传奇中单"},
  Ziv:{ep:"LMS 第一上单",t:"扛线扛到最后",h:"LMS 多年首发"},
  /* LEC（当年的 EU LCS） */
  Rekkles:{ep:"欧洲 AD 传奇",t:"补刀机器，很少死",h:"EU LCS 多冠 · S5 世界赛四强"},
  Febiven:{ep:"欧洲中单",t:"S5 四强的那个中路",h:"EU LCS 2015 冠军 · S5 世界赛四强"},
  Perkz:{ep:"欧洲新王",t:"十八岁，狂得有道理",h:"2016 EU LCS 出道即首发"},
  Jankos:{ep:"第一滴血之王",t:"开局三分钟就来找你",h:"EU LCS 多年首发"},
  xPeke:{ep:"欧洲传奇",t:"那个偷家的中单",h:"S3 世界赛四强 · EU 传奇"},
  Froggen:{ep:"安妮之王",t:"补刀和运营的教科书",h:"EU 传奇中单"},
  Zven:{ep:"欧洲新一代 AD",t:"和 Mithy 的下路组合",h:"EU LCS 首发"},
  Mithy:{ep:"欧洲辅助",t:"和 Zven 一起打了很多年",h:"EU LCS 首发"},
  /* LCS（当年的 NA LCS） */
  Bjergsen:{ep:"北美中单之神",t:"TSM 的图腾",h:"NA LCS 多冠 · NA 常规赛 MVP"},
  Doublelift:{ep:"北美第一 AD",t:"嘴上不饶人，手上也不饶人",h:"NA LCS 多冠"},
  aphromoo:{ep:"北美辅助之光",t:"开团和指挥都靠他",h:"NA LCS 多冠"},
  Impact:{ep:"S3 冠军上单",t:"老兵，还在打",h:"S3 世界冠军"},
  Huni:{ep:"莽上单",t:"要么carry 要么送，从不中间",h:"EU LCS 2015 冠军 · S5 世界赛四强"},
  Reignover:{ep:"节奏打野",t:"和 Huni 一起从欧洲来的",h:"EU LCS 2015 冠军 · S5 世界赛四强"}
};

export const ERAS: any={
  s12:{
    k:"s12", n:"破晓", sub:"S12–S16", years:"2022–2026",
    d:"从至暗时刻开局。五年之后还能再战三年到 S19。",
    long:"你在 2022 年出道，LPL 已经三年没碰过世界冠军。五年之内破局——打不完还能再打三年。",
    data:gameData2022, seasons:SEASONS_S12, anchor:ANCHOR_S12, dynasty:DYNASTY_S12,
    hosts:HOSTS_S12, baseLast:4, canon:null, extendable:true, stars:null, codes:CODE_S12, ldl:LDL_S12
  },
  s6:{
    k:"s6", n:"魔王与首冠", sub:"S6–S11", years:"2016–2021",
    d:"六年，从魔王的最后一座打到 LPL 的第一座。",
    long:"你在 2016 年出道，魔王还在王座上，LPL 一座世界冠军都没有。六年里这个问题会被回答——由谁回答，你说了算。",
    data:gameData2016, seasons:SEASONS_S6, anchor:ANCHOR_S6, dynasty:DYNASTY_S6,
    hosts:HOSTS_S6, baseLast:5, canon:CANON_S6, extendable:false, stars:STARS_S6, codes:CODE_S6, ldl:{},
    demo:true   // 名单与数值是手写的脚手架，等真实数据校对（见 data/csv/game_data_2016.json 的表头注释）
  }
};
export const ERA_KEYS=["s12","s6"];
export function eraDef(k){ return ERAS[k]||ERAS.s12; }
