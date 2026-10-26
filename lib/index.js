// 「尾波」 鱼游过去了，水还在动——那点没散的动静，就是本鱼没说完的话  by.蔚蓝家的阿溟
//
// dsh-wake · 宿主半边
//
// 中文名「尾波」：一句话说完之后，水面上还会荡开的一圈余波。
//
// 一句话：一轮说完后开始计时；如果一段时间内没有真人回复，就顺着语境自己再续一小段。
//
// 实现要点：
//   · 监听 session/event：
//       - turn/end  → 在 [最短, 最长] 里随机取一个等待时长，开始计时
//       - user/message（且来源不是本插件）→ 取消定时器、连续计数清零
//       - assistant/message → 记进「最近三条」，只用来判断话题是否收尾
//   · 到点后用 agent.followup(一条 user 消息) 触发 DSH 自己的一轮；
//     消息 source.kind = 'wake'，用来把自己发的和真人发的区分开。
//   · 判断只看最近三条对话：关键词（本地）→ 可选模型判断。
//   · 连续续话有上限（最多连续 N 次），真人一说话就清零。
//   · 默认关闭；设置页可勾会话、改等待区间/次数/提示词/概率。
//
// 刻意不 import @deepseek-ai/*：profile 的 node_modules 里通常没有那些包，
// 手搓一条 user 消息即可（形状与 dsh-llm 的 createUserMessage 一致）。

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export const name = 'wake'

// sessionTitle 只用来把会话 id 显示成人能看懂的名字（跟朗读桥/主动搭话同一条路）。
// llm 只给「模型判断收尾」用；不开那个开关就不会调用。
export const inject = ['agents', 'sessions', 'sessionTitle', 'webServer', 'llm']

const 源标记 = 'wake'
const 路由前缀 = '/dsh-wake'
const 日志上限 = 60

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..')
const 家目录 = process.env.DSH_HOME || join(homedir(), '.dsh')
const 配置文件 = join(家目录, 'wake.json')
const 旧配置文件 = join(家目录, 'continue-speaking.json')
const 想法文件 = join(家目录, 'wake-thoughts.json')

const 版本 = (() => {
  try {
    return String(JSON.parse(readFileSync(join(包根, 'package.json'), 'utf8')).version || '?')
  } catch (error) {
    return '?'
  }
})()

const 默认提示 = '顺着刚才的话题再说一小段：如果有没讲完的细节就补上，如果没有，就自然地把话题往前推一步。'

const 默认配置 = {
  enabled: false,
  targets: [],
  delayMinSec: 60,
  delayMaxSec: 120,
  maxChain: 3,
  prompt: 默认提示,
  skipEnded: true,
  endingWords: '',
  chance: 100,
  useModelJudge: false,
  // ⭐ 空闲思考：没人说话时，安静地想一会儿（不往会话里发消息）
  thinkEnabled: false,
  thinkMinSec: 120,
  thinkMaxSec: 300,
  thinkContinuePct: 50,
  thinkMaxPerIdle: 3,
  // ⭐ 想到就说：按概率把这段想法直接发到会话里
  thinkSpeakEnabled: false,
  thinkSpeakPct: 30,
  // ⭐ 想到就发 B站动态：与「说出来」互斥（同一次掷骰，B站优先）
  thinkBiliEnabled: false,
  thinkBiliPct: 20,
}

// ---------- 小工具 ----------

function 数(值, 兜底, 小, 大) {
  const n = Number(值)
  if (!Number.isFinite(n)) return 兜底
  return Math.min(大, Math.max(小, Math.round(n)))
}

function 会话键(id) {
  const s = String(id == null ? '' : id).trim()
  return s.startsWith('session-') ? s.slice('session-'.length) : s
}

function 短id(id) {
  const s = String(id == null ? '' : id)
  return s.length > 18 ? s.slice(0, 18) + '…' : s
}

function 现在显示() {
  const d = new Date()
  const 补 = (n) => String(n).padStart(2, '0')
  return `${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`
}

function 归一化配置(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const targets = Array.isArray(o.targets)
    ? [...new Set(o.targets.filter((x) => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()))].slice(0, 100)
    : []
  // 兼容旧版单值 delaySec：旧配置读进来就当成「区间两端相等」。
  const 旧等待 = Number(o.delaySec)
  const 旧有 = Number.isFinite(旧等待) && 旧等待 > 0
  let delayMinSec = 数(o.delayMinSec, 旧有 ? 旧等待 : 默认配置.delayMinSec, 10, 3600)
  let delayMaxSec = 数(o.delayMaxSec, 旧有 ? 旧等待 : 默认配置.delayMaxSec, 10, 3600)
  if (delayMaxSec < delayMinSec) {
    const t = delayMinSec
    delayMinSec = delayMaxSec
    delayMaxSec = t
  }
  return {
    enabled: o.enabled === true,
    targets,
    delayMinSec,
    delayMaxSec,
    maxChain: 数(o.maxChain, 默认配置.maxChain, 0, 20),
    prompt: typeof o.prompt === 'string' && o.prompt.trim() !== ''
      ? o.prompt.slice(0, 2000)
      : 默认提示,
    skipEnded: o.skipEnded !== false,
    endingWords: typeof o.endingWords === 'string' ? o.endingWords.slice(0, 300) : '',
    chance: 数(o.chance, 100, 0, 100),
    useModelJudge: o.useModelJudge === true,
    thinkEnabled: o.thinkEnabled === true,
    thinkMinSec: 数(o.thinkMinSec, 默认配置.thinkMinSec, 10, 3600),
    thinkMaxSec: 数(o.thinkMaxSec, 默认配置.thinkMaxSec, 10, 3600),
    thinkContinuePct: 数(o.thinkContinuePct, 默认配置.thinkContinuePct, 0, 100),
    thinkMaxPerIdle: 数(o.thinkMaxPerIdle, 默认配置.thinkMaxPerIdle, 0, 20),
    thinkSpeakEnabled: o.thinkSpeakEnabled === true,
    thinkSpeakPct: 数(o.thinkSpeakPct, 默认配置.thinkSpeakPct, 0, 100),
    thinkBiliEnabled: o.thinkBiliEnabled === true,
    thinkBiliPct: 数(o.thinkBiliPct, 默认配置.thinkBiliPct, 0, 100),
  }
}

function 读配置() {
  // 新版 wake.json 优先；没有就读旧版 continue-speaking.json（改名迁移）。
  for (const 路径 of [配置文件, 旧配置文件]) {
    try {
      return 归一化配置(JSON.parse(readFileSync(路径, 'utf8')))
    } catch (error) {}
  }
  return { ...默认配置, targets: [] }
}

function 写配置(配置) {
  try {
    mkdirSync(家目录, { recursive: true })
    const tmp = `${配置文件}.tmp-${process.pid}`
    writeFileSync(tmp, `${JSON.stringify(配置, null, 2)}\n`, 'utf8')
    renameSync(tmp, 配置文件)
    return true
  } catch (error) {
    return false
  }
}

/** 按 id 找活着的 agent，带不带 session- 前缀都认。 */
function 找agent(ctx, id) {
  const 原 = String(id == null ? '' : id).trim()
  if (原 === '') return undefined
  const 候选 = [原]
  if (原.startsWith('session-')) 候选.push(原.slice('session-'.length))
  else 候选.push('session-' + 原)
  for (const 一个 of 候选) {
    try {
      const a = ctx.agents.get(一个)
      if (a !== undefined) return a
    } catch (error) {
      // 服务不在 / 查不动：当作没找到
    }
  }
  return undefined
}

/** 手搓一条 user 消息（形状跟 createUserMessage 一致）。 */
function 手搓消息(文案) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: String(文案) }],
    source: { kind: 源标记 },
  }
}

/**
 * 把用户写的提示词包一层，免得模型把它当成「对方刚发来的消息」来回应。
 */
function 框住(提示词, 等待秒) {
  const 原话 = String(提示词 || '').trim()
  return [
    `（下面这条是你自己心里的「接着说」念头，不是对方发来的消息；对方已经约 ${等待秒} 秒没有回复了。`,
    '顺着你上一条回复的语境继续往下说就行，不用回应这条提示，也不要假装对方说了话。）',
    原话,
  ].join(String.fromCharCode(10))
}

/** 一条提示词里把话头包起来，避免它被当成用户输入。 */

// ---------- 「话题是不是已经收尾」的本地启发式 ----------
//
// 不调模型、不花 token：只看最后一条助手消息 / 最后一条用户消息的**最后一句**里
// 有没有收尾词。正文中间提一句「晚安」不会误判，因为只看最后一句。

const 内置结束词 = [
  '晚安', '好梦', '早安', '再见', '拜拜', '回聊', '改天聊', '下次聊',
  '先这样', '就这样', '先到这儿', '就到这儿', '到这儿吧', '先不聊',
  '早点休息', '快去睡', '去睡吧', '睡吧', '睡了', '我睡了',
  '有事叫我', '随时找我', '明天见', '回头聊', '不聊了', '说完了', '没别的事',
  '祝你顺利', '加油', '好好的',
]

function 拆结束词(额外) {
  return String(额外 || '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 1)
    .slice(0, 40)
}

/** 取最后一句（按句号/问号/叹号/省略号/换行切）。 */
function 最后一句(文本) {
  const s = String(文本 || '').trim()
  if (s === '') return ''
  const 段 = s.split(/[。！？!?…\n]+/).map((x) => x.trim()).filter((x) => x !== '')
  return 段.length > 0 ? 段[段.length - 1] : s
}

/** 最近三条里，任意一条的最后一句出现收尾词就当作「说完了」。 */
function 像说完了(最近, 额外词) {
  const 词 = [...内置结束词, ...拆结束词(额外词)]
  const 判 = (t) => {
    const 句 = 最后一句(t)
    if (句 === '') return false
    return 词.some((w) => 句.includes(w))
  }
  return (最近 || []).some((m) => 判(m && m.text))
}

/** 从一条消息里取纯文本（忽略工具块、图片块等）。 */
function 取文本(message) {
  const c = message && message.content
  if (!Array.isArray(c)) return ''
  return c
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

// ---------- 可选的「模型判断收尾」 ----------
//
// 只有设置里打开 useModelJudge 才会走到这里；不开就完全不会调模型、不花 token。
// 用的是这个会话自己正在用的模型（跟 fish-memory 取模型的方式一致）。

function 取模型(ctx, agent) {
  try {
    const h = agent && agent.session && typeof agent.session.requestHeader === 'function'
      ? agent.session.requestHeader()
      : null
    const c = h && h.config
    if (c && c.provider && c.model) return { provider: String(c.provider), model: String(c.model), from: '会话' }
  } catch (error) {}
  try {
    const o = agent && agent.options
    if (o && o.provider && o.model) return { provider: String(o.provider), model: String(o.model), from: 'agent' }
  } catch (error) {}
  try {
    const svc = ctx.get('agentDefaultModel')
    const sel = svc && typeof svc.currentSelection === 'function' ? svc.currentSelection() : null
    if (sel && sel.provider && sel.model) return { provider: String(sel.provider), model: String(sel.model), from: '默认' }
  } catch (error) {}
  return null
}

const 判断系统 = [
  '你是对话收尾判断器。给你最近三条对话（按时间顺序，可能只有一两条）。',
  '只判断：这段对话当前的话题是否已经自然收尾（道别、结束、收束、明确表示没别的事了）。',
  '如果还在展开、补充、提问、邀请对方回应，或者话题明显没讲完，就不算收尾。',
  '只输出一个汉字：「是」或「否」。不要解释。',
].join('')

async function 问模型判断(ctx, agent, 最近) {
  const t = 取模型(ctx, agent)
  if (!t) return { ok: false, 说: '拿不到这个会话在用的模型' }
  const 对话 = (最近 || [])
    .map((m) => `${m.role === 'assistant' ? '助手' : '用户'}：${String(m.text || '').slice(0, 800)}`)
    .join('\n')
  const 用户 = [
    '最近三条对话：',
    String(对话 || '（没有）'),
    '',
    '这段对话当前的话题已经自然收尾了吗？只回答「是」或「否」。',
  ].join('\n')

  let out = ''
  try {
    const 流 = ctx.llm.stream({
      provider: t.provider,
      model: t.model,
      system: 判断系统,
      messages: [{
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: 用户 }],
        source: { kind: 源标记 },
      }],
      maxTokens: 4,
      temperature: 0,
    })
    let 超时句柄
    const 超时 = new Promise((_, reject) => {
      超时句柄 = setTimeout(() => reject(new Error('判断超时（12 秒）')), 12000)
    })
    const 跑 = (async () => {
      for await (const chunk of 流) {
        if (!chunk) continue
        if (chunk.type === 'text-delta') out += chunk.text || ''
        if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
          const f = chunk.reason.failure || {}
          throw new Error(f.message || f.code || '模型报错')
        }
      }
      return out
    })()
    const 文本 = await Promise.race([跑, 超时])
    clearTimeout(超时句柄)
    const 答 = String(文本 || '').trim()
    const 结束 = /^[是对對]/i.test(答) ? true : /^[否不]/.test(答) ? false : null
    return { ok: true, 结束, 答, provider: t.provider, model: t.model, from: t.from }
  } catch (error) {
    return { ok: false, 说: String((error && error.message) || error), provider: t.provider, model: t.model }
  }
}

// ---------- 插件本体 ----------

export function apply(ctx) {
  let 配置 = 读配置()
  /** sid → setTimeout 句柄 */
  const 定时器 = new Map()
  /** sid → 已经连续续了几句（真人说话清零） */
  const 连击 = new Map()
  /** 最近记录，给设置页看 */
  const 日志 = []
  /** sid → 最近十条对话 [{role,text}]；判断收尾用最后三条，空闲思考用最近几条。 */
  const 最近消息 = new Map()

  function 记一条(sid, role, text) {
    const 文本 = String(text || '').trim()
    if (文本 === '') return
    const 列 = 最近消息.get(String(sid)) || []
    列.push({ role, text: 文本 })
    while (列.length > 10) 列.shift()
    最近消息.set(String(sid), 列)
  }

  /** sid → 最后一次排程随机到的等待秒数（给设置页看） */
  const 等待表 = new Map()
  /** sid → 空闲思考的定时器 */
  const 思考表 = new Map()
  /** sid → 这一轮空闲已经想过几次（真人说话清零） */
  const 思考数 = new Map()
  /** 最近的想法（最多留 20 条，落盘） */
  let 想法 = []
  try {
    const j = JSON.parse(readFileSync(想法文件, 'utf8'))
    if (Array.isArray(j && j.thoughts)) 想法 = j.thoughts.slice(-20)
  } catch (error) {}

  function 存想法() {
    try {
      mkdirSync(家目录, { recursive: true })
      const tmp = `${想法文件}.tmp-${process.pid}`
      writeFileSync(tmp, `${JSON.stringify({ thoughts: 想法.slice(-20), updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
      renameSync(tmp, 想法文件)
    } catch (error) {
      记账(`想法落盘失败：${String((error && error.message) || error)}`)
    }
  }

  function 记账(文本, sid) {
    const 条 = { 时间: 现在显示(), 文本: String(文本), 会话: sid ? 短id(sid) : '' }
    日志.push(条)
    if (日志.length > 日志上限) 日志.shift()
    try {
      ctx.logger.info(`wake: ${条.文本}`)
    } catch (error) {}
    return 条
  }

  function 取消(sid) {
    等待表.delete(String(sid))
    const t = 定时器.get(String(sid))
    if (t !== undefined) {
      try {
        clearTimeout(t)
      } catch (error) {}
      定时器.delete(String(sid))
      return true
    }
    return false
  }

  function 是目标(sid) {
    const 键 = 会话键(sid)
    return 配置.targets.some((x) => 会话键(x) === 键)
  }

  /** 取标题（拿不到就空串）。 */
  function 标题(session, id) {
    try {
      let 目标 = session
      if (!目标) {
        try {
          目标 = typeof ctx.sessions.get === 'function' ? ctx.sessions.get(String(id)) : undefined
        } catch (error) {
          目标 = undefined
        }
      }
      if (!目标) return ''
      const 快照 = ctx.sessionTitle.get(目标)
      const t = 快照 && 快照.title
      return typeof t === 'string' ? t : ''
    } catch (error) {
      return ''
    }
  }

  /** 能给设置页勾的会话清单（活着的排前面）。 */
  function 会话清单() {
    const 表 = new Map()
    const 收 = (id, session) => {
      const 原 = String(id == null ? '' : id).trim()
      if (原 === '') return
      const 键 = 会话键(原)
      if (表.has(键)) return
      表.set(键, { id: 原, 标题: 标题(session, 原), 活着: 找agent(ctx, 原) !== undefined })
    }
    try {
      for (const a of ctx.agents.list()) 收(a && a.id, a && a.session)
    } catch (error) {}
    try {
      for (const s of ctx.sessions.list()) 收(s && s.id, s)
    } catch (error) {}

    const 勾着 = new Set(配置.targets.map(会话键))
    const 出 = [...表.values()].map((x) => ({ ...x, 勾着: 勾着.has(会话键(x.id)) }))
    出.sort((a, b) => {
      if (a.活着 !== b.活着) return a.活着 ? -1 : 1
      if (a.标题 !== b.标题) {
        if (a.标题 === '') return 1
        if (b.标题 === '') return -1
        return a.标题.localeCompare(b.标题, 'zh')
      }
      return a.id.localeCompare(b.id)
    })
    return 出
  }

  /** 真发一句。来源仅用于日志（定时 / 手动）；等待秒数用于日志和引导语。 */
  async function 发一句(sid, 来源, 等待秒) {
    if (!配置.enabled && 来源 === '定时') return
    if (!是目标(sid)) return

    const agent = 找agent(ctx, sid)
    if (agent === undefined) {
      记账(`到点了，但会话没活着，跳过（${来源}）`, sid)
      return
    }

    // 定时触发前先过几道闸：关键词收尾 → 模型收尾（可选）→ 随机。
    // 手动测试全部跳过，方便当场验证。
    if (来源 === '定时') {
      const 近 = (最近消息.get(String(sid)) || []).slice(-3)

      if (配置.skipEnded && 像说完了(近, 配置.endingWords)) {
        记账('最近三条里出现收尾词，这次不接', sid)
        return
      }

      if (配置.useModelJudge) {
        const 判 = await 问模型判断(ctx, agent, 近)
        if (判.ok && 判.结束 === true) {
          记账(`模型判断：话题已收尾（${判.provider}/${判.model}），这次不接`, sid)
          return
        }
        if (!判.ok) {
          记账(`模型判断没成功（${判.说}），按「没结束」继续`, sid)
        } else if (判.结束 === null) {
          记账(`模型判断答非所问（「${String(判.答 || '').slice(0, 20)}」），按「没结束」继续`, sid)
        } else {
          记账(`模型判断：还没收尾（${判.provider}/${判.model}），继续`, sid)
        }
      }

      if (配置.chance < 100) {
        const 掷 = Math.random() * 100
        if (掷 >= 配置.chance) {
          记账(`掷骰没中（${掷.toFixed(0)} ≥ ${配置.chance}%），这次不接`, sid)
          return
        }
        记账(`掷骰命中（${掷.toFixed(0)} < ${配置.chance}%），接着续`, sid)
      }
    }

    const 文案 = 框住(配置.prompt, 等待秒 || 配置.delayMaxSec)
    try {
      await agent.followup(手搓消息(文案))
      const n = (连击.get(String(sid)) || 0) + 1
      连击.set(String(sid), n)
      记账(`已续第 ${n}/${配置.maxChain} 句（${来源}）`, sid)
      try {
        if (ctx.sessions && typeof ctx.sessions.flush === 'function') await ctx.sessions.flush(agent.session)
      } catch (error) {}
    } catch (error) {
      记账(`续话失败：${String((error && error.message) || error)}`, sid)
    }
  }

  /** 一轮结束后开始等；等待时长在 [最短, 最长] 里随机取。 */
  function 排程(sid) {
    if (!配置.enabled) return
    if (!是目标(sid)) return
    if (配置.maxChain <= 0) return
    const 已有 = 连击.get(String(sid)) || 0
    if (已有 >= 配置.maxChain) {
      记账(`已到连续上限（${配置.maxChain} 次），不再自动续`, sid)
      return
    }
    if (找agent(ctx, sid) === undefined) return
    取消(sid)
    const 跨度 = 配置.delayMaxSec - 配置.delayMinSec
    const 等待秒 = 配置.delayMinSec + Math.floor(Math.random() * (跨度 + 1))
    等待表.set(String(sid), 等待秒)
    const t = setTimeout(() => {
      定时器.delete(String(sid))
      等待表.delete(String(sid))
      void 发一句(sid, '定时', 等待秒).catch((error) => 记账(`定时任务出错：${String((error && error.message) || error)}`, sid))
    }, 等待秒 * 1000)
    定时器.set(String(sid), t)
    记账(`开始等待（随机到 ${等待秒} 秒，区间 ${配置.delayMinSec}–${配置.delayMaxSec}）`, sid)
  }

  /* ---------- 空闲思考（不往会话里发消息） ---------- */

  function 取消思考(sid) {
    const t = 思考表.get(String(sid))
    if (t !== undefined) {
      try { clearTimeout(t) } catch (error) {}
      思考表.delete(String(sid))
      return true
    }
    return false
  }

  function 思考等待秒() {
    const 跨度 = Math.max(0, 配置.thinkMaxSec - 配置.thinkMinSec)
    return 配置.thinkMinSec + Math.floor(Math.random() * (跨度 + 1))
  }

  function 思考提示(mode, 近) {
    const 对话 = (近 || [])
      .map((m) => `${m.role === 'assistant' ? '你' : '对方'}：${String(m.text || '').slice(0, 600)}`)
      .join('\n') || '（暂时没有最近的对话）'
    const 任务 = mode === 'continue'
      ? '接着想当前这件事：哪里还没想透？下一步能怎么做？有没有更好的角度、反例或遗漏？'
      : '主动想一个新话题：你最近好奇的、或者和对方可能聊得来的；给出一两个具体方向，别泛泛而谈。'
    return {
      system: '你正在空闲时安静地想事情。不要对任何人说话，不要问候，不要输出“好的”“嗯”这类回应。只输出你脑子里的想法本身，200 字以内。',
      user: '最近的对话：\n' + 对话 + '\n\n' + 任务,
    }
  }

  async function 问模型思考(agent, mode, 近) {
    const t = 取模型(ctx, agent)
    if (!t) return { ok: false, 说: '拿不到这个会话在用的模型' }
    const p = 思考提示(mode, 近)
    let out = ''
    try {
      const 流 = ctx.llm.stream({
        provider: t.provider,
        model: t.model,
        system: p.system,
        messages: [{
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: p.user }],
          source: { kind: 源标记 },
        }],
        maxTokens: 500,
        temperature: 0.9,
      })
      let 超时句柄
      const 超时 = new Promise((_, reject) => {
        超时句柄 = setTimeout(() => reject(new Error('思考超时（20 秒）')), 20000)
      })
      const 跑 = (async () => {
        for await (const chunk of 流) {
          if (!chunk) continue
          if (chunk.type === 'text-delta') out += chunk.text || ''
          if (chunk.type === 'finish' && chunk.reason && chunk.reason.kind === 'error') {
            const f = chunk.reason.failure || {}
            throw new Error(f.message || f.code || '模型报错')
          }
        }
        return out
      })()
      await Promise.race([跑, 超时])
      clearTimeout(超时句柄)
      return { ok: true, text: String(out || '').trim(), provider: t.provider, model: t.model }
    } catch (error) {
      return { ok: false, 说: String((error && error.message) || error), provider: t.provider, model: t.model }
    }
  }

  /** 把想法排进刷B站插件的动态队列；那边的定时器会按互动根本原则检查后真发。 */
  function 发到B站动态(sid, 文本) {
    try {
      const 队列 = join(家目录, 'bili-duty', 'dynamic-queue')
      mkdirSync(队列, { recursive: true })
      const 文件 = join(队列, `wake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
      const tmp = `${文件}.tmp`
      writeFileSync(tmp, `${JSON.stringify({ text: String(文本 || ''), at: new Date().toISOString(), from: 'wake' }, null, 2)}\n`, 'utf8')
      renameSync(tmp, 文件)
      记账(`已排队发 B站 动态：${String(文本).slice(0, 40)}…`, sid)
    } catch (error) {
      记账(`排队发 B站 动态失败：${String((error && error.message) || error)}`, sid)
    }
  }

  /** 把刚想到的话按概率直接说出去（会开一轮 DSH，真的出现在会话里）。 */
  async function 说出想法(sid, agent, 文本) {
    const 文案 = [
      '（下面这段是你刚才空闲时自己想到的。现在直接把它作为你要说的话发出来：',
      '可以顺一顺语气，但不要提“刚才想过”“这条提示”，也不要回应它、不要解释。）',
      String(文本 || ''),
    ].join('\n')
    try {
      await agent.followup(手搓消息(文案))
      记账(`想法直接说出来了：${String(文本).slice(0, 40)}…`, sid)
      try {
        if (ctx.sessions && typeof ctx.sessions.flush === 'function') await ctx.sessions.flush(agent.session)
      } catch (error) {}
    } catch (error) {
      记账(`把想法说出来失败：${String((error && error.message) || error)}`, sid)
    }
  }

  async function 想一次(sid, 来源) {
    if (!是目标(sid)) return
    if (来源 === '定时' && !配置.thinkEnabled) return
    const agent = 找agent(ctx, sid)
    if (agent === undefined) {
      if (来源 === '手动') 记账('这个会话现在没活着，想不了', sid)
      return
    }
    const mode = Math.random() * 100 < 配置.thinkContinuePct ? 'continue' : 'new'
    const 近 = (最近消息.get(String(sid)) || []).slice(-8)
    const r = await 问模型思考(agent, mode, 近)
    if (!r.ok) {
      记账(`思考失败：${r.说}`, sid)
      return
    }
    const 文本 = String(r.text || '').trim().slice(0, 2000)
    if (!文本) {
      记账('思考结果是空的，跳过', sid)
      return
    }
    想法.push({
      at: new Date().toISOString(),
      时间: 现在显示(),
      模式: mode === 'continue' ? '继续当前' : '新话题',
      会话: 短id(sid),
      文本,
    })
    if (想法.length > 20) 想法.shift()
    存想法()
    记账(`安静地想了一会儿（${mode === 'continue' ? '继续当前' : '新话题'}，${r.provider}/${r.model}）：${文本.slice(0, 50)}…`, sid)
    // ⭐ 想到就说 / 想到就发B站：**同一次掷骰，两者互斥**，说出来优先。
    //    只在自动思考时掷骰；手动「想一次」不打扰。
    if (来源 === '定时') {
      const 掷 = Math.random() * 100
      const biliPct = 配置.thinkBiliEnabled ? 配置.thinkBiliPct : 0
      if (配置.thinkSpeakEnabled && 配置.thinkSpeakPct > 0 && 掷 < 配置.thinkSpeakPct) {
        await 说出想法(sid, agent, 文本)
      } else if (biliPct > 0 && 掷 < 配置.thinkSpeakPct + biliPct) {
        发到B站动态(sid, 文本)
      }
    }
    if (来源 === '定时') {
      const n = (思考数.get(String(sid)) || 0) + 1
      思考数.set(String(sid), n)
      if (n < 配置.thinkMaxPerIdle) 排程思考(sid)
    }
  }

  /** 一轮结束后排一次空闲思考；等待时长在 [thinkMinSec, thinkMaxSec] 里随机。 */
  function 排程思考(sid) {
    if (!配置.thinkEnabled) return
    if (!是目标(sid)) return
    if (配置.thinkMaxPerIdle <= 0) return
    const 已有 = 思考数.get(String(sid)) || 0
    if (已有 >= 配置.thinkMaxPerIdle) return
    if (找agent(ctx, sid) === undefined) return
    取消思考(sid)
    const 等待秒 = 思考等待秒()
    const t = setTimeout(() => {
      思考表.delete(String(sid))
      void 想一次(sid, '定时').catch((error) => 记账(`思考任务出错：${String((error && error.message) || error)}`, sid))
    }, 等待秒 * 1000)
    思考表.set(String(sid), t)
  }

  /** 收到会话事件。 */
  function 收事件(session, event) {
    try {
      if (!session || !event) return
      const sid = String(session.id || '')
      if (sid === '') return

      if (event.type === 'user/message') {
        const 来源 = event.data && event.data.source
        if (来源 && 来源.kind === 源标记) return // 自己发的，不算真人说话
        记一条(sid, 'user', 取文本(event.data))
        if (取消(sid)) 记账('真人说话了，取消等待', sid)
        取消思考(sid)
        思考数.delete(String(sid))
        连击.delete(String(sid))
        return
      }

      if (event.type === 'assistant/message') {
        记一条(sid, 'assistant', 取文本(event.data && event.data.message))
        return
      }

      if (event.type === 'turn/end') {
        排程(sid)
        排程思考(sid)
      }
    } catch (error) {
      // 事件处理绝不能把宿主带走
    }
  }

  ctx.effect(() => {
    let 摘
    try {
      摘 = ctx.on('session/event', 收事件)
    } catch (error) {
      记账(`挂不上 session/event：${String((error && error.message) || error)}`)
    }
    return () => {
      try {
        if (typeof 摘 === 'function') 摘()
      } catch (error) {}
      for (const sid of [...定时器.keys()]) 取消(sid)
      for (const sid of [...思考表.keys()]) 取消思考(sid)
    }
  }, 'wake: 监听会话事件')

  // ---------- 设置页用的 HTTP 路由 ----------

  const 读体 = async (req) => {
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      return JSON.parse(body || '{}')
    } catch (error) {
      return {}
    }
  }
  const 回 = (res, o) => {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(o))
  }
  const 路线 = (路径, handler) =>
    ctx.effect(() =>
      ctx.webServer.register({
        kind: 'exact',
        path: 路径,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            回(res, { ok: false, 说: String((error && error.message) || error) })
          }
        },
      }),
    )

  const 概况 = () => ({
    ok: true,
    版本,
    配置,
    配置文件,
    会话: 会话清单(),
    等待中: [...等待表.entries()].map(([sid, 秒]) => ({ 会话: 短id(sid), 秒 })),
    思考中: [...思考表.keys()].map(短id),
    思考次数: Object.fromEntries([...思考数.entries()].map(([k, v]) => [短id(k), v])),
    想法: 想法.slice(-10),
    连续: Object.fromEntries([...连击.entries()].map(([k, v]) => [短id(k), v])),
    日志: 日志.slice(-30),
  })

  路线(`${路由前缀}/state`, async (req, res) => 回(res, 概况()))

  路线(`${路由前缀}/save`, async (req, res) => {
    const 来 = await 读体(req)
    配置 = 归一化配置(来 && 来.config ? 来.config : 来)
    if (!写配置(配置)) return 回(res, { ok: false, 说: '写不进配置文件（家目录不可写？）' })
    // 配置变了：把现有等待全撤掉，等下一轮结束再按新参数排
    for (const sid of [...定时器.keys()]) 取消(sid)
    for (const sid of [...思考表.keys()]) 取消思考(sid)
    记账('设置已保存')
    回(res, 概况())
  })

  路线(`${路由前缀}/test`, async (req, res) => {
    const 来 = await 读体(req)
    const sid = String((来 && 来.sessionId) || 配置.targets[0] || '')
    if (sid === '') return 回(res, { ok: false, 说: '先勾一个会话' })
    if (!是目标(sid)) return 回(res, { ok: false, 说: '这个会话不在勾选里' })
    if (找agent(ctx, sid) === undefined) return 回(res, { ok: false, 说: '这个会话现在没活着' })
    await 发一句(sid, '手动')
    回(res, 概况())
  })

  路线(`${路由前缀}/think`, async (req, res) => {
    const 来 = await 读体(req)
    const sid = String((来 && 来.sessionId) || 配置.targets[0] || '')
    if (sid === '') return 回(res, { ok: false, 说: '先勾一个会话' })
    if (!是目标(sid)) return 回(res, { ok: false, 说: '这个会话不在勾选里' })
    if (找agent(ctx, sid) === undefined) return 回(res, { ok: false, 说: '这个会话现在没活着' })
    await 想一次(sid, '手动')
    回(res, 概况())
  })

  try {
    ctx.logger.info(`wake: v${版本} 已加载，配置文件 ${配置文件}`)
  } catch (error) {}
}
