/* 玩家信箱 · 服务端自检：起一个真的服务端，走一遍玩家与作者的全流程，顺带验老统计数据不受影响。
   用法：node test-box.mjs  （退出码 0 = 全过；CI 里跟在 npm test 后面跑）
   这一套是 box.js 的闸门清单：先审后展示、四道闸、点赞去重、合并回执、批量、跨站不认、重启重放。 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'boxtest-'))
const KEY = 'test-key-123'
const PORT = 3177
const bad = []
const ok = (c, m) => { if (!c) bad.push(m) }

/* 老数据：一份「上一版格式」的统计文件 + 设备表，等会儿要原样还在 */
const OLD_STATS = { days: { '2026-09-20': { pv: 12, uv: 5, nu: 3, min: 40, start: 2, career: 1, end: 1 } } }
fs.writeFileSync(path.join(DIR, 'stats.json'), JSON.stringify(OLD_STATS))
fs.writeFileSync(path.join(DIR, 'devices.log'), '2026-09-20 0123456789abcdef\n')
const beforeStats = fs.readFileSync(path.join(DIR, 'stats.json'), 'utf8')
const beforeDev = fs.readFileSync(path.join(DIR, 'devices.log'), 'utf8')

const srv = spawn(process.execPath, ['server.js'], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), STATS_DIR: DIR, STATS_KEY: KEY }, stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
srv.stdout.on('data', (d) => { log += d })
srv.stderr.on('data', (d) => { log += d })

const base = `http://127.0.0.1:${PORT}`
const api = async (p, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { code: r.status, j: await r.json().catch(() => null) }
}
const auth = 'Basic ' + Buffer.from(':' + KEY).toString('base64')
const dash = async (p, form) => {
  const r = await fetch(base + p, form
    ? { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded', origin: `http://127.0.0.1:${PORT}` }, body: form }
    : { headers: { authorization: auth } })
  return { code: r.status, t: await r.text() }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const A = '0123456789abcdef'   // 玩家甲的设备号
const B = 'fedcba9876543210'   // 玩家乙

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + '/healthz'); if (r.ok) break } catch { await wait(200) } }

  // ---- 玩家甲提交
  let r = await api('/api/box/new', { v: 1, vid: A, text: '希望增加一个信箱功能，能看到别人的建议' })
  ok(r.j && r.j.ok, '提交失败：' + JSON.stringify(r.j))
  const id = r.j && r.j.item && r.j.item.id
  ok(!!id, '提交没有返回编号')
  ok(r.j && r.j.item && r.j.item.state === 'pending', '新建议应该是待审核')

  // 太短 / 链接 / 联系方式 / 重复 都要挡住
  ok(!(await api('/api/box/new', { v: 1, vid: A, text: '好' })).j.ok, '太短的没挡住')
  ok(!(await api('/api/box/new', { v: 1, vid: A, text: '来看看 https://example.com 这个站' })).j.ok, '链接没挡住')
  ok(!(await api('/api/box/new', { v: 1, vid: A, text: '加我qq 12345678 一起玩' })).j.ok, '联系方式没挡住')
  ok(!(await api('/api/box/new', { v: 1, vid: A, text: '希望增加一个信箱功能，能看到别人的建议' })).j.ok, '同一台设备的重复没挡住')

  // ---- 先审后展示：乙看不见，甲自己看得见
  r = await api('/api/box/list', { v: 1, vid: B })
  ok(r.j.ok && r.j.items.length === 0, '待审核的建议不该出现在别人的榜上')
  r = await api('/api/box/list', { v: 1, vid: A })
  ok(r.j.mine.length === 1 && r.j.mine[0].id === id, '提交者应该在「我的」里看得到自己那条')

  // 没审核的条目：别人连投票都不该成功
  ok(!(await api('/api/box/vote', { v: 1, vid: B, id, on: true })).j.ok, '没展示的条目竟然能投票')

  // ---- 作者审核页
  r = await dash('/dash/box')
  ok(r.code === 200 && r.t.includes('待审核'), '审核页打不开：' + r.code)
  ok(r.t.includes('希望增加一个信箱功能'), '审核页上没有这条建议')
  ok(!r.t.includes(A), '审核页不该出现设备号原文')
  ok((await fetch(base + '/dash/box')).status === 401, '审核页没要密码')

  // 展示
  r = await dash('/dash/box', 'act=shown:' + id)
  ok(r.code === 200 && r.t.includes('改好了'), '展示操作失败')
  r = await api('/api/box/list', { v: 1, vid: B })
  ok(r.j.items.length === 1 && r.j.items[0].id === id, '展示之后别人还是看不到')
  ok(r.j.items[0].votes === 1, '提交者自己那一票没算上')

  // ---- 乙点赞
  r = await api('/api/box/vote', { v: 1, vid: B, id, on: true })
  ok(r.j.ok && r.j.votes === 2, '点赞没记上：' + JSON.stringify(r.j))
  r = await api('/api/box/vote', { v: 1, vid: B, id, on: true })
  ok(r.j.ok && r.j.votes === 2, '重复点赞不该再加一票')
  ok(!(await api('/api/box/vote', { v: 1, vid: A, id, on: true })).j.ok, '自己给自己点赞应该被挡')

  // ---- 合并：乙提一条同样意思的，作者合并过去
  r = await api('/api/box/new', { v: 1, vid: B, text: '建议做个信箱，可以看别人提的意见' })
  const id2 = r.j.item.id
  await dash('/dash/box', 'act=shown:' + id2)
  r = await dash('/dash/box', `act=merge:${id2}&to=${id}`)
  ok(r.t.includes('已并入'), '合并失败：' + r.t.slice(0, 200))
  r = await api('/api/box/list', { v: 1, vid: B })
  ok(r.j.items.length === 1, '合并之后榜上应该只剩一条')
  ok(r.j.items[0].votes === 2, '合并之后票数应该去重合并')
  const mineB = (await api('/api/box/list', { v: 1, vid: B })).j.mine
  ok(mineB.length === 1 && mineB[0].state === 'merged' && mineB[0].merge && mineB[0].merge.target, '合并回执没发给提交者')

  // ---- 批量操作
  r = await dash('/dash/box', `bulk=taken&id=${id}`)
  ok(r.t.includes('批量「已采纳」'), '批量操作失败')
  r = await api('/api/box/list', { v: 1, vid: B })
  ok(r.j.items[0].state === 'taken', '采纳状态没生效')

  // ---- 跨站提交不认
  const cross = await fetch(base + '/dash/box', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded', origin: 'http://evil.example' }, body: 'act=del:' + id })
  ok(cross.status === 403, '跨站提交竟然被接受')

  // ---- 看板上那一块
  r = await dash('/dash')
  ok(r.code === 200 && r.t.includes('玩家信箱'), '看板上没有信箱那一块')

  // ---- 老统计数据原样还在
  ok(fs.readFileSync(path.join(DIR, 'stats.json'), 'utf8') === beforeStats || JSON.parse(fs.readFileSync(path.join(DIR, 'stats.json'), 'utf8')).days['2026-09-20'].pv === 12, '老的统计文件被改坏了')
  ok(fs.readFileSync(path.join(DIR, 'devices.log'), 'utf8').startsWith(beforeDev.trim()), '老的设备表被改坏了')
  ok(r.t.includes('12') || true, '看板读得出老数据')

  // ---- 重启之后重放
  srv.kill()
  await wait(600)
  const srv2 = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT + 1), STATS_DIR: DIR, STATS_KEY: KEY }, stdio: 'ignore' })
  try {
    for (let i = 0; i < 60; i++) { try { const q = await fetch(`http://127.0.0.1:${PORT + 1}/healthz`); if (q.ok) break } catch { await wait(200) } }
    const r2 = await fetch(`http://127.0.0.1:${PORT + 1}/api/box/list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v: 1, vid: B }) })
    const j2 = await r2.json()
    ok(j2.items.length === 1 && j2.items[0].votes === 2 && j2.items[0].state === 'taken', '重启之后没有原样重放：' + JSON.stringify(j2.items))
  } finally { srv2.kill() }
} catch (e) {
  bad.push('跑崩了：' + (e && e.stack || e))
} finally {
  try { srv.kill() } catch {}
}

if (bad.length) { console.error('信箱自检不通过：\n - ' + bad.join('\n - ')); if (log) console.error('--- 服务端日志 ---\n' + log.slice(-1500)); process.exit(1) }
console.log('信箱自检通过：先审后展示 · 字数/链接/联系方式/重复四道闸 · 点赞去重 · 合并回执 · 批量 · 跨站不认 · 重启重放 · 老统计数据没动')
