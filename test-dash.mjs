/* 后台看板 · 服务端自检：拿一份<b>老格式</b>的统计文件起服务端，灌几条带枚举字段的信标，
   再把看板整页算一遍。盯死两件事：
     一、老数据一个数都不能少（作者 2026-10-01：「别把我以前的数据弄没了」）；
     二、新加的几节（漏斗 / 留存 / 结局 / 开局构成 / 设备与屏幕 / 报错 / 存档失败）画得出来。
   用法：node test-dash.mjs  （退出码 0 = 全过；CI 里跟在 npm test 后面跑） */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dashtest-'))
const KEY = 'test-key-123'
const PORT = 3188
const bad = []
const ok = (c, m) => { if (!c) bad.push(m) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* 老格式：只有当年那几个字段，没有 act / sec / f / endK 这些 */
const OLD = {
  days: {
    '2026-09-20': { pv: 120, uv: 44, nu: 12, min: 365, start: 9, career: 4, end: 2, ver: { 'v20260918a': 100 } },
    '2026-09-21': { pv: 90, uv: 30, nu: 5, min: 210, start: 6, career: 3, end: 1, support: 2, ver: {} },
  },
}
fs.writeFileSync(path.join(DIR, 'stats.json'), JSON.stringify(OLD))
fs.writeFileSync(path.join(DIR, 'devices.log'), '2026-09-20 0123456789abcdef\n2026-09-21 fedcba9876543210\n')

const srv = spawn(process.execPath, ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), STATS_DIR: DIR, STATS_KEY: KEY }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
srv.stdout.on('data', (d) => { log += d })
srv.stderr.on('data', (d) => { log += d })

const base = `http://127.0.0.1:${PORT}`
const beacon = (o) => fetch(base + '/api/t', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) })
const auth = 'Basic ' + Buffer.from(':' + KEY).toString('base64')

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/healthz'); if (r.ok) break } catch { await wait(200) } }

  const A = '0123456789abcdef', B = 'fedcba9876543210', C = 'aaaabbbbccccdddd'
  // 三台设备：一台走到结局，一台只建档，一台只打开
  await beacon({ id: A, e: 'view', v: 'v20261001a', dv: 'm', wd: '360-414' })
  await beacon({ id: A, e: 'beat', v: 'v20261001a' })
  await beacon({ id: A, e: 'beat', v: 'v20261001a' })
  await beacon({ id: A, e: 'start', v: 'v20261001a', o: 'academy', y: '2022', p: 'mid' })
  await beacon({ id: A, e: 'week1', v: 'v20261001a' })
  await beacon({ id: A, e: 'career', v: 'v20261001a', rg: 'LPL' })
  await beacon({ id: A, e: 'season1', v: 'v20261001a' })
  await beacon({ id: A, e: 'match', v: 'v20261001a', m: 'w' })
  await beacon({ id: A, e: 'match', v: 'v20261001a', m: 's' })
  await beacon({ id: A, e: 'end', v: 'v20261001a', k: 'dynasty' })
  await beacon({ id: B, e: 'view', v: 'v20261001a', dv: 'd', wd: '1440+' })
  await beacon({ id: B, e: 'start', v: 'v20261001a', o: 'streamer', y: '2016', p: 'bot' })
  await beacon({ id: B, e: 'savefail', v: 'v20261001a' })
  await beacon({ id: C, e: 'view', v: 'v20261001a', dv: 't', wd: '768-1024' })
  await beacon({ id: C, e: 'jserr', v: 'v20261001a', er: 'career.html:1200:33' })
  await beacon({ id: C, e: 'box_open', v: 'v20261001a' })
  // 乱来的字段一律不该进聚合
  await beacon({ id: C, e: 'end', v: 'v20261001a', k: '<script>alert(1)</script>' })
  await beacon({ id: C, e: 'start', v: 'v20261001a', o: '我是自由文本', y: '1999', p: 'xxx' })
  await wait(300)

  const r = await fetch(base + '/dash', { headers: { authorization: auth } })
  const t = await r.text()
  ok(r.status === 200, '看板打不开：' + r.status)

  // ---- 老数据还在
  ok(t.includes('210') || t.includes('365'), '看板上看不到老日子的分钟数了')
  ok(/2026-09-20/.test(t), '近 14 天明细里没有老日子')
  ok(t.includes('v20261001a'), '版本分布里没有这几条信标的版本')

  // ---- 新几节
  for (const h of ['玩家信箱', '漏斗', '留存', '结局分布', '开局构成', '设备与屏幕', '前端报错', '存档失败', '在线时长', '比赛：亲自打还是托管']) {
    ok(t.includes(h), '看板上缺一节：' + h)
  }
  ok(t.includes('王朝'), '结局分布里没把 dynasty 翻成中文')
  ok(t.includes('青训') && t.includes('主播'), '开局构成里没有出身')
  ok(t.includes('手机') && t.includes('电脑'), '设备与屏幕那节没画出来')
  ok(t.includes('career.html:1200:33'), '前端报错那节没记上')
  ok(!/<script>alert/.test(t), '乱来的 key 竟然原样进了页面')
  ok(!/我是自由文本/.test(t), '不合格式的枚举字段竟然被收下了')
  ok(/推完第一周/.test(t) && /打完第一个赛季/.test(t), '漏斗少了几步')

  // ---- 落盘之后老数据仍然对得上（看板每次都会触发一次落盘）
  await wait(500)
  const after = JSON.parse(fs.readFileSync(path.join(DIR, 'stats.json'), 'utf8'))
  ok(after.days['2026-09-20'] && after.days['2026-09-20'].pv === 120 && after.days['2026-09-20'].min === 365, '落盘之后老日子的数变了')
  ok(after.days['2026-09-21'].support === 2, '落盘之后老日子的「点开支持」丢了')
  const today = Object.keys(after.days).find((d) => d > '2026-09-21')
  ok(today && after.days[today].act && after.days[today].act.length === 3, '今天没按设备记下活跃表')
  ok(today && after.days[today].endK && after.days[today].endK.dynasty === 1, '今天的结局没记进聚合')

  // ---- 导出接口照常
  const ex = await fetch(base + '/api/export', { headers: { authorization: auth } })
  ok(ex.status === 200, '导出接口坏了：' + ex.status)
  const ej = await ex.json().catch(() => null)
  ok(ej && ej.days && ej.days['2026-09-20'], '导出里没有老数据')

  // ---- 重启之后：当天的事件从 JSONL 重放，老日子从 stats.json 读
  srv.kill()
  await wait(600)
  const srv2 = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT + 1), STATS_DIR: DIR, STATS_KEY: KEY }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 60; i++) { try { const q = await fetch(`http://127.0.0.1:${PORT + 1}/healthz`); if (q.ok) break } catch { await wait(200) } }
    const r2 = await fetch(`http://127.0.0.1:${PORT + 1}/dash`, { headers: { authorization: auth } })
    const t2 = await r2.text()
    ok(r2.status === 200 && t2.includes('王朝'), '重启之后当天的事件没重放出来')
    ok(t2.includes('2026-09-20'), '重启之后老数据不见了')
  } finally { srv2.kill() }
} catch (e) {
  bad.push('跑崩了：' + (e && e.stack || e))
} finally {
  try { srv.kill() } catch {}
}

if (bad.length) { console.error('看板自检不通过：\n - ' + bad.join('\n - ')); if (log) console.error('--- 服务端日志 ---\n' + log.slice(-1200)); process.exit(1) }
console.log('看板自检通过：老数据原样在 · 漏斗 / 留存 / 结局 / 开局构成 / 设备屏幕 / 报错 / 存档失败都画得出 · 乱来的字段进不来 · 重启重放')
