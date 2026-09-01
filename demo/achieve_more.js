/* ================= 成就扩充 =================
   目标是把「打完一遍」和「打透」分开：
   核心路线 2 小时能走完，但要解锁大部分成就得换打法——
   换 build、换出身、换 offer、走不同的路，才够得着第三个小时。

   所以这批成就刻意分散在互斥或对立的路径上：
   有的要你专精，有的要你均衡；有的要你早签约，有的要你熬；
   有的奖励和平共处，有的奖励把人挂牌走。                        */

const ACH_MORE=[
  /* ---------- 荣誉进阶 ---------- */
  {id:"double", n:"双冠王", d:"同一年拿下 MSI 与世界赛。", tag:"荣誉",
   on:"worlds", cond:()=>((S.career.msiYears||[]).includes(S.si)), r:{money:2000,fame:200,fat:-90}},
  {id:"backtoback", n:"卫冕", d:"连续两年拿下世界冠军。", tag:"荣誉",
   on:"worlds", cond:()=>((S.career.worldsYears||[]).includes(S.si-1)), r:{money:2500,fame:240,fat:-90}},
  {id:"slam", n:"大满贯", d:"生涯集齐联赛、MSI、世界赛冠军。", tag:"荣誉",
   on:"worlds", cond:()=>(S.career.leagueTitles||0)>=1&&(S.career.msi||0)>=1, r:{money:1800,fame:180}},
  {id:"treble", n:"三冠", d:"同一年拿下联赛、MSI 和世界赛。", tag:"荣誉",
   on:"worlds", cond:()=>((S.career.msiYears||[]).includes(S.si))&&((S.career.lgYears||[]).includes(S.si)),
   r:{money:3000,fame:300,fat:-99}},
  {id:"lg3", n:"三连霸", d:"连续三个赛段拿下联赛冠军。", tag:"荣誉",
   on:"lgtitle", cond:()=>(S.career.lgStreak||0)>=3, r:{money:600,fame:90}},

  /* ---------- 战绩 ---------- */
  {id:"perfect", n:"全胜赛段", d:"一个赛段的常规赛一场不丢。", tag:"战绩",
   on:"splitend", cond:()=>S.record&&S.record.l===0&&S.record.w>=WEEKS, r:{money:300,fame:70,trust:12}},
  {id:"win10", n:"十连胜", d:"连赢十场。", tag:"战绩",
   on:"win", cond:()=>(S.winStreak||0)>=10, r:{money:200,fame:50}},
  {id:"w100", n:"百胜", d:"生涯赢下 100 场。", tag:"战绩",
   on:"win", cond:()=>((S.career||{}).w||0)>=100, r:{money:280,fame:60}},
  {id:"w200", n:"两百胜", d:"生涯赢下 200 场。", tag:"战绩",
   on:"win", cond:()=>((S.career||{}).w||0)>=200, r:{money:600,fame:120}},
  {id:"cb10", n:"逆风翻盘十次", d:"在账面劣势的情况下赢下十场。", tag:"战绩",
   on:"win", cond:()=>(S.comebacks||0)>=10, r:{money:350,fame:80,trust:10}},
  {id:"beat3lck", n:"韩流克星", d:"国际赛场上击败三支不同的 LCK 队伍。", tag:"战绩",
   on:"match", cond:()=>((S.lckBeaten||[]).length>=3), r:{money:500,fame:130}},
  {id:"noloss5", n:"零封五连", d:"连续五个系列赛一局不丢。", tag:"战绩",
   on:"match", cond:()=>(S.sweepStreak||0)>=5, r:{money:400,fame:90}},

  /* ---------- 养成：互斥的两条路 ---------- */
  {id:"allcap", n:"练无可练", d:"五个维度全部撞上瓶颈。", tag:"养成",
   on:"train", cond:()=>DIMS.every(d=>S.attrs[d]>=capOf(d)-0.05), r:{money:400,fame:60}},
  {id:"maxbreak", n:"顶到极限", d:"把某一维的瓶颈推到最高。", tag:"养成",
   on:"break", cond:()=>DIMS.some(d=>((S.capBonus||{})[d]||0)>=CAP_MAX_BONUS-0.01), r:{money:350,fame:50}},
  {id:"break3", n:"三处松动", d:"同时有三个维度的瓶颈被顶开过。", tag:"养成",
   on:"break", cond:()=>DIMS.filter(d=>((S.capBonus||{})[d]||0)>=2).length>=3, r:{money:300}},
  {id:"spec", n:"一招鲜", d:"把某一维练到 80 以上。", tag:"养成",
   on:"train", cond:()=>DIMS.some(d=>S.attrs[d]>=80), r:{money:450,fame:80}},
  {id:"balanced", n:"六边形", d:"五维全部练到 55 以上。", tag:"养成",
   on:"train", cond:()=>DIMS.every(d=>S.attrs[d]>=55), r:{money:450,fame:60}},
  {id:"mech", n:"苦练出真章", d:"靠纯机械训练顶开一次瓶颈。", tag:"养成",
   on:"breakauto", cond:()=>true, r:{money:220,fat:-30}},

  /* ---------- 职业前：早签 vs 熬 ---------- */
  {id:"fast", n:"一年上岸", d:"第一个转会窗口就签下合同。", tag:"职业前",
   on:"sign", cond:()=>(S.pre&&(S.pre.preYear||1)===1), r:{money:150,fame:20}},
  {id:"grind", n:"熬出来的", d:"熬到第三年才等到合同。", tag:"职业前",
   on:"sign", cond:()=>(S.pre&&(S.pre.preYear||1)>=3), r:{money:260,fame:40,trust:10}},
  {id:"citychamp", n:"城市争霸赛冠军", d:"把这个比赛赢到底。", tag:"职业前",
   on:"cup", cond:(c)=>c&&c.kind==="city"&&c.win>=4, r:{money:200,fame:45}},
  {id:"streamchamp", n:"主播杯冠军", d:"在一群主播里杀出来。", tag:"职业前",
   on:"cup", cond:(c)=>c&&c.kind==="stream"&&c.win>=3, r:{money:240,fame:60}},
  {id:"bothcup", n:"两个都拿了", d:"城市争霸赛和主播杯的冠军都是你。", tag:"职业前",
   on:"cup", cond:()=>(S.pre&&S.pre.cityCup>=4&&S.pre.streamCup>=3), r:{money:400,fame:90}},
  {id:"noCup", n:"野路子", d:"一个业余赛都没打，直接签上职业。", tag:"职业前",
   on:"sign", cond:()=>(S.pre&&!S.pre.cityCup&&!S.pre.streamCup), r:{money:180,fame:30}},

  /* ---------- 人际：和睦 vs 铁腕 ---------- */
  {id:"trust80", n:"更衣室之王", d:"全队对你的信任平均超过 80。", tag:"人际",
   on:"splitend", cond:()=>typeof avgTrust==="function"&&avgTrust()>=80, r:{money:260,fame:40}},
  {id:"nocrack", n:"没有裂痕", d:"队友之间任意两人的关系都在 60 以上。", tag:"人际",
   on:"splitend", cond:()=>{const v=Object.values(S.rel||{});return v.length>=3&&Math.min(...v)>=60;},
   r:{money:300,trust:10}},
  {id:"listed", n:"我说了算", d:"成功把一名队友挂牌。", tag:"人际",
   on:"clout", cond:(c)=>c&&c.kind==="list"&&c.ok, r:{money:200,fame:50}},
  {id:"recruit", n:"点名要人", d:"让俱乐部按你的要求签下一名选手。", tag:"人际",
   on:"clout", cond:(c)=>c&&c.kind==="sign"&&c.ok, r:{money:250,fame:70}},
  {id:"soul", n:"队魂", d:"威望达到 78。", tag:"人际",
   on:"splitend", cond:()=>typeof cloutOf==="function"&&cloutOf()>=78, r:{money:400,fame:80}},
  {id:"mentor", n:"带出来的", d:"陪新秀加练之后，他的数据明显好转。", tag:"人际",
   on:"mentor", cond:()=>true, r:{money:150,trust:12}},
  {id:"backfire", n:"消息走漏", d:"提出挂牌却被拒绝，还传了出去。", tag:"人际",
   on:"clout", cond:(c)=>c&&c.kind==="list"&&!c.ok, r:{fame:25}},

  /* ---------- 逆境 ---------- */
  {id:"aftercut", n:"我还会回来", d:"被解约之后，重新拿到一座冠军。", tag:"逆境",
   on:"lgtitle", cond:()=>!!S.everCut, r:{money:500,fame:120,trust:14}},
  {id:"hurtwin", n:"带伤上阵", d:"在伤病期间赢下一场比赛。", tag:"逆境",
   on:"win", cond:()=>!!S.injury, r:{money:180,fame:40,trust:8}},
  {id:"slumpwin", n:"低谷里的胜利", d:"状态跌到低谷时，仍然赢下比赛。", tag:"逆境",
   on:"win", cond:()=>typeof myForm==="function"&&myForm()<=34, r:{money:200,fame:45}},
  {id:"playinrun", n:"从入围赛杀上来", d:"打完入围赛，还在正赛走进八强。", tag:"逆境",
   on:"intlknock", cond:()=>!!S.cameFromPlayin, r:{money:600,fame:140}},
  {id:"benchout", n:"板凳翻身", d:"坐了整整一个赛季替补，之后拿到联赛冠军。", tag:"逆境",
   on:"lgtitle", cond:()=>(S.benchedSplits||0)>=2, r:{money:450,fame:100}},
  {id:"lowtrust", n:"众叛亲离还赢了", d:"全队信任低于 35 的情况下赢下比赛。", tag:"逆境",
   on:"win", cond:()=>typeof avgTrust==="function"&&avgTrust()<35, r:{fame:50}},

  /* ---------- 世界 ---------- */
  {id:"seelegend", n:"和传奇同场", d:"在正式比赛里遇到一位复出的传奇。", tag:"世界",
   on:"match", cond:(c)=>c&&c.metLegend, r:{fame:60}},
  {id:"beatlegend", n:"送走传奇", d:"击败一位复出的传奇所在的队伍。", tag:"世界",
   on:"win", cond:(c)=>c&&c.metLegend, r:{money:250,fame:90}},
  {id:"see10ret", n:"一代人过去了", d:"见证十位选手退役。", tag:"世界",
   on:"retire", cond:()=>(S.retireSeen||0)>=10, r:{fame:40}},
  {id:"allver", n:"什么版本都打过", d:"经历全部五个赛季的版本。", tag:"世界",
   on:"splitend", cond:()=>S.si>=SEASONS.length-1, r:{money:300,fame:50}},
  // LDL 是国内二级联赛，不是外赛区——这个判定写在 LDL 存在之前，
  // 玩家签 UP 青训被误发了「远走他乡」（线上抓的）
  {id:"foreign", n:"远走他乡", d:"签下一支外赛区战队。", tag:"世界",
   on:"sign", cond:()=>(S.homeLeague&&S.homeLeague!=="LPL"&&S.homeLeague!=="LDL"), r:{money:300,fame:80}},

  /* ---------- 经济与收藏 ---------- */
  {id:"rich", n:"存款过千万", d:"账上攒到 1000 万。", tag:"经济",
   on:"money", cond:()=>S.money>=1000, r:{fame:30}},
  {id:"allcourse", n:"全都学了", d:"把所有课程都修完。", tag:"经济",
   on:"course", cond:()=>typeof COURSES!=="undefined"&&COURSES.every(c=>(S.courses||[]).includes(c.k)),
   r:{money:200,fame:40}},
  {id:"grandmaster", n:"国服第一", d:"排位打到国服前十。", tag:"经济",
   on:"rank", cond:()=>S.pre&&S.pre.rank>=95, r:{money:300,fame:110}},

  /* ---------- 宿敌（2026-08-31 竞品拆解移植：交手账本读的是真实名单） ---------- */
  {id:"star1", n:"第一滴血", d:"第一次在正式比赛里赢下带明星选手的队伍。", tag:"宿敌",
   on:"match", cond:()=>typeof beatCount==="function"&&Object.keys(S.beatStars||{}).length>=1, r:{fame:30}},
  {id:"beatfaker", n:"破神者", d:"三次战胜 Faker 所在的队伍。", tag:"宿敌",
   on:"match", cond:()=>typeof beatCount==="function"&&beatCount("Faker")>=3, r:{fame:200,trust:10},
   flavor:"至暗时刻的墙上有一块最硬的砖。你把它敲下来了三次。"},
  {id:"beatchovy", n:"中路答卷", d:"三次战胜 Chovy 所在的队伍。", tag:"宿敌",
   on:"match", cond:()=>typeof beatCount==="function"&&beatCount("Chovy")>=3, r:{fame:130}},
  {id:"beatknight", n:"内战无敌手", d:"三次战胜 Knight 所在的队伍。", tag:"宿敌",
   on:"match", cond:()=>typeof beatCount==="function"&&beatCount("Knight")>=3, r:{fame:90}},
  {id:"star5", n:"名人册", d:"交手账本里写下 5 位明星选手的名字。", tag:"宿敌",
   on:"match", cond:()=>Object.keys(S.beatStars||{}).length>=5, r:{fame:110},
   flavor:"他们记不记得你不重要。账本记得。"},

  /* ---------- 内容与商业 ---------- */
  {id:"content10", n:"更新日历", d:"发布 10 条内容。", tag:"经济",
   on:"content", cond:()=>(S.contentN||0)>=10, r:{fame:50}},
  {id:"bizrep", n:"商业底蕴", d:"商业底蕴攒满 25 点。", tag:"经济",
   on:"content", cond:()=>(S.bizRep||0)>=25, r:{fame:60}},
  {id:"firstbiz", n:"第一单商务", d:"接到第一个商业邀约。", tag:"经济",
   on:"biz", cond:()=>true, r:{fame:30}},
  {id:"asset1", n:"置业", d:"买下第一件资产。", tag:"经济",
   on:"asset", cond:()=>Object.keys(S.assets||{}).length>=1, r:{fame:20}},
  {id:"asset4", n:"这就是生活", d:"四件资产全部入手。", tag:"经济",
   on:"asset", cond:()=>typeof ASSETS!=="undefined"&&ASSETS.every(a=>(S.assets||{})[a.k]), r:{fame:80},
   flavor:"职业选手的钱，最后都变成了让自己打得更久的东西。"},

  /* ---------- 收尾 ---------- */
  {id:"ach30", n:"收藏家", d:"解锁 30 项成就。", tag:"收尾",
   on:"ach", cond:()=>Object.keys(S.ach||{}).length>=30, r:{money:500,fame:100}},
  {id:"ach45", n:"打透了", d:"解锁 45 项成就。", tag:"收尾",
   on:"ach", cond:()=>Object.keys(S.ach||{}).length>=45, r:{money:1200,fame:220}}
];
