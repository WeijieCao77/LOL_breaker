/* ================= 背景故事池 =================
   开局随机抽三个，可以重抽。每个背景都有明确代价，不存在纯强选项。
   折算口径：资金 60 万 ≈ 1 点，人气 10 ≈ 1 点，信任 3 ≈ 1 点，属性 1 点 = 1 点；
   训练/恢复倍率、自带课程、宿敌、寄家用不折点。按这个口径各卡在 1.8 ~ 11.3 点之间，**并不等值**——
   刻意如此：每张卡都有明确代价，差异在「形状」，不追求总分相等。
   （原注释写「约 +9 ~ +11」是早期版本的数，已失真——外部测评抓的；demo/test.js 现在会把这张表打出来。） */

const BACKGROUNDS=[
  {k:"netbar", origin:"academy", n:"网吧长大的",
   d:"从小在网吧后排看别人打，十二岁开始自己上机。手是练出来的，作息是毁掉的。",
   mod:{操作:+5,体质:-4}, money:40, fame:+6},

  {k:"rich", origin:"academy", n:"富裕家庭",
   d:"设备随便买，训练环境无可挑剔。但你没有草根故事——观众不买账，队友也觉得你没吃过苦。",
   mod:{}, money:430, fame:-18, trust:-9},

  {k:"town", origin:"academy", n:"小镇做题家",
   d:"全家供你一个人出来。你不能输，也输不起。",
   mod:{心态:+5}, money:0, fame:+6, train:1.12, upkeep:22},

  {k:"sport", origin:"academy", n:"体校退下来的",
   d:"练过八年短跑，膝盖不行了才转电竞。身体底子是这行最稀缺的东西。",
   mod:{体质:+7,操作:-3}, money:60, rest:1.35},

  {k:"single", origin:"streamer", n:"单亲家庭",
   d:"很早就学会自己扛事。没人替你做决定，也没人替你兜底。",
   mod:{心态:+6,运营:+2}, money:20, fame:+8},

  {k:"brother", origin:"academy", n:"前职业选手的弟弟",
   d:"所有人都拿你和你哥比。你继承了他的人脉，也继承了他的阴影。",
   mod:{运营:+4,指挥:+3}, money:70, fame:+22, trust:-8},

  {k:"late", origin:"streamer", n:"高考完才碰游戏",
   d:"起步太晚，手上功夫追不回来了。但你想事情比同龄人清楚一大截。",
   mod:{运营:+5,指挥:+5,操作:-6}, money:130},

  {k:"rehab", origin:"streamer", n:"被送去戒过网瘾",
   d:"那段经历上过新闻。你回来了，而且比进去之前更清楚自己要什么。",
   mod:{心态:+8,操作:+2,体质:-4}, money:10, fame:+14},

  {k:"soloq", origin:"academy", n:"国服榜一路人王",
   d:"只会一个英雄，但那个英雄没人打得过你。职业队看得上你的手，看不上你的脑子。",
   mod:{操作:+7,运营:-5,指挥:-4}, money:50, fame:+30},

  {k:"cut", origin:"academy", n:"青训被刷下来过",
   d:"进过一次，又被送出来。你知道被淘汰是什么感觉，所以你不敢松。",
   mod:{运营:+3,心态:+5}, money:0, trust:+10, train:1.08},

  {k:"kr", origin:"academy", n:"在韩国读过两年书",
   d:"韩服打上过宗师，语言也通。回国的时候，你比同龄人多见过一个赛区。",
   mod:{运营:+3,操作:+2}, money:80, course:"kr"},

  {k:"boost", origin:"streamer", n:"代练起家",
   d:"打过几百个号，也见过这行最脏的一面。手很稳，但那段历史迟早会被翻出来。",
   mod:{操作:+5,心态:-3}, money:200, fame:-12},

  {k:"hotel", origin:"streamer", n:"电竞酒店老板的儿子",
   d:"在自家酒店的机位上练了三年，什么配置都试过，就是没跟高手打过。",
   mod:{体质:+3,操作:-2}, money:280, trust:-4},

  {k:"captain", origin:"academy", n:"校队队长",
   d:"带过一支不太行的队伍，赢得不多，但你知道怎么让五个人往一处使。",
   mod:{指挥:+7,运营:+2,操作:-3}, money:50, trust:+12},

  {k:"sidekick", origin:"streamer", n:"大主播的固定队友",
   d:"在别人的直播间里被观众认识。流量是现成的，实力还得自己证明。",
   mod:{运营:+2,操作:-2}, money:110, fame:+34},

  {k:"injury", origin:"academy", n:"伤病复出的青训",
   d:"手腕伤过一次，医生说别打了。你没听。",
   mod:{心态:+9,运营:+3,体质:-7}, money:30, fame:+10},

  {k:"idol", origin:"streamer", n:"追星追进电竞圈",
   d:"因为一个选手才开始打排位，现在你想站到他对面去。",
   mod:{心态:+4,操作:+2,指挥:-2}, money:60, fame:+16, rival:true},

  {k:"army", origin:"streamer", n:"退伍回来的",
   d:"两年没碰鼠标，但纪律和抗压是刻进去的。年纪是唯一的问题。",
   mod:{心态:+6,体质:+5,操作:-5}, money:90, rest:1.25}
];

/* 抽三个不重复的背景 */
function drawBackgrounds(){
  // 抽 4 张，并保证主播/青训两条路都至少有一张——
  // 出身已经并进背景卡里，随机不该把一整条路直接抽没。
  const pick=(arr)=>arr.splice(Math.floor(rnd()*arr.length),1)[0];
  const aca=BACKGROUNDS.filter(b=>b.origin==="academy");
  const str=BACKGROUNDS.filter(b=>b.origin==="streamer");
  const out=[pick(aca),pick(str)];
  const rest=aca.concat(str);
  while(out.length<4&&rest.length) out.push(pick(rest));
  for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
function bgOf(k){ return BACKGROUNDS.find(x=>x.k===k)||BACKGROUNDS[0]; }

/* 背景卡文案：把数值翻译成人话 */
function bgEffects(b){
  const out=[];
  DIMS.forEach(d=>{ if(b.mod&&b.mod[d]) out.push(`${d} ${b.mod[d]>0?"+":""}${b.mod[d]}`); });
  if(b.money) out.push(`起始资金 ${b.money} 万`);
  if(b.fame) out.push(`名气 ${b.fame>0?"+":""}${b.fame}`);
  if(b.trust) out.push(`队友信任 ${b.trust>0?"+":""}${b.trust}`);
  if(b.train) out.push(`训练效率 +${Math.round((b.train-1)*100)}%`);
  if(b.rest) out.push(`恢复 +${Math.round((b.rest-1)*100)}%`);
  if(b.upkeep) out.push(`每赛段寄回家 ${b.upkeep} 万`);
  if(b.course) out.push(`自带${COURSES.find(c=>c.k===b.course).n}`);
  if(b.rival) out.push(`开局就有一个想超越的人`);
  return out;
}
