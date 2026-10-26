// 「尾波」 鱼游过去了，水还在动——那点没散的动静，就是本鱼没说完的话  by.蔚蓝家的阿溟
//
// dsh-wake · 网页半边
//
// 在 DSH 设置左侧栏加一项「尾波」，配置：开关、目标会话、等待秒数、最多连续几次、提示词。
// 只读写宿主的 /dsh-wake/* 路由，真正的定时与 followup 都在 lib/index.js。

window.__ModuleLoader__.load({
  id: 'dsh-wake',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']

    const B = '/dsh-wake'
    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const post = (p, body) =>
      fetch(B + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
        .then((r) => r.json())
        .catch(() => null)

    const h = React.createElement

    const S = {
      wrap: {
        padding: '16px 18px 96px',
        maxWidth: 760,
        margin: '0 auto',
        fontSize: 13,
        lineHeight: 1.7,
        color: 'var(--dsw-alias-label-primary, #1f1f1f)',
      },
      quote: {
        fontStyle: 'italic',
        fontSize: 12,
        lineHeight: 1.85,
        color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
        padding: '2px 0 2px 10px',
        borderLeft: '2px solid var(--dsw-alias-brand-primary, #4fd1c5)',
      },
      h1: { fontSize: 20, fontWeight: 700, margin: '10px 0 2px', letterSpacing: '-.01em' },
      sub: { color: 'var(--dsw-alias-label-tertiary, #8a8a8a)', fontSize: 12 },
      pills: { display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' },
      pill: {
        fontSize: 11,
        padding: '1px 8px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.3))',
        color: 'var(--dsw-alias-label-secondary, #b9b9b9)',
      },
      pillOn: {
        fontSize: 11,
        padding: '1px 8px',
        borderRadius: 999,
        border: '1px solid rgba(79,209,197,.5)',
        background: 'rgba(79,209,197,.12)',
        color: 'var(--dsw-alias-label-primary, #e8e8e8)',
      },
      section: {
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.08em',
        color: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
        margin: '24px 0 6px',
      },
      dim: { color: 'var(--dsw-alias-label-tertiary, #8a8a8a)', fontSize: 12 },
      hint: { color: 'var(--dsw-alias-label-tertiary, #8a8a8a)', fontSize: 11, lineHeight: '17px' },
      card: {
        border: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.22))',
        borderRadius: 12,
        padding: '12px 14px',
        margin: '8px 0',
        background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.05))',
      },
      label: { fontWeight: 600, marginBottom: 4, display: 'block' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.28))',
        background: 'var(--dsw-alias-bg-layer-4, rgba(127,127,127,.08))',
        color: 'inherit',
        fontSize: 13,
      },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      num: { width: 88, textAlign: 'center' },
      btn: {
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.3))',
        background: 'var(--dsw-alias-bg-layer-4, rgba(127,127,127,.1))',
        color: 'inherit',
        cursor: 'pointer',
        fontSize: 12,
      },
      primary: {
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid #3b82f6',
        background: '#3b82f6',
        color: '#fff',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
      },
      savebar: {
        position: 'sticky',
        bottom: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        margin: '18px 0 0',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.25))',
        background: 'var(--dsw-alias-bg-layer-1, rgba(20,20,24,.92))',
        boxShadow: '0 -8px 22px rgba(0,0,0,.10)',
      },
      thought: {
        padding: '9px 0',
        borderTop: '1px solid var(--dsw-alias-bg-layer-3, rgba(127,127,127,.16))',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.7,
      },
      log: {
        fontFamily: 'ui-monospace,Consolas,monospace',
        fontSize: 11,
        maxHeight: 220,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        color: 'var(--dsw-alias-label-secondary, #555)',
        background: 'var(--dsw-alias-bg-layer-4, rgba(127,127,127,.06))',
        borderRadius: 8,
        padding: '8px 10px',
      },
      sess: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 6px',
        margin: '0 -6px',
        borderRadius: 6,
        fontSize: 13,
      },
    }

    function 复选(勾, 改) {
      return h('input', { type: 'checkbox', checked: !!勾, onChange: (e) => 改(e.target.checked) })
    }

    function 开关({ on, onChange, disabled }) {
      return h(
        'button',
        {
          type: 'button',
          disabled: !!disabled,
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => { if (!disabled) onChange(!on) },
          style: {
            width: 38,
            height: 22,
            borderRadius: 11,
            border: 0,
            padding: 0,
            position: 'relative',
            flex: '0 0 auto',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.45 : 1,
            background: on ? '#3b82f6' : 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.35))',
            transition: 'background .15s',
          },
        },
        h('span', {
          style: {
            position: 'absolute',
            top: 3,
            left: on ? 19 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            display: 'block',
            transition: 'left .15s',
          },
        }),
      )
    }

    function Section() {
      const [态, 设态] = React.useState(null)
      const [草稿, 设草稿] = React.useState(null)
      const [脏, 设脏] = React.useState(false)
      const [忙, 设忙] = React.useState(false)
      const [说, 设说] = React.useState('')

      const 载入 = async () => {
        const r = await get('/state')
        if (!r || !r.ok) {
          设说('读不到状态：宿主路由没起来？')
          return
        }
        设态(r)
        设草稿(JSON.parse(JSON.stringify(r.配置)))
        设脏(false)
      }

      React.useEffect(() => {
        void 载入()
      }, [])

      const 改 = (键, 值) => {
        设草稿((旧) => {
          const 新 = { ...(旧 || {}), [键]: 值 }
          return 新
        })
        设脏(true)
        设说('')
      }

      const 切会话 = (id) => {
        设草稿((旧) => {
          const 列 = (旧 && 旧.targets) || []
          const 有 = 列.includes(id)
          return { ...(旧 || {}), targets: 有 ? 列.filter((x) => x !== id) : [...列, id] }
        })
        设脏(true)
        设说('')
      }

      const 存 = async () => {
        设忙(true)
        const r = await post('/save', { config: 草稿 })
        设忙(false)
        if (!r || !r.ok) {
          设说((r && r.说) || '保存失败')
          return
        }
        设态(r)
        设草稿(JSON.parse(JSON.stringify(r.配置)))
        设脏(false)
        设说('已保存')
      }

      const 试 = async () => {
        const 目标 = (草稿.targets || [])[0]
        if (!目标) {
          设说('先勾一个会话，再试')
          return
        }
        设忙(true)
        const r = await post('/test', { sessionId: 目标 })
        设忙(false)
        if (r && r.ok) {
          设态(r)
          设说('已发一句，去那个会话看看')
        } else {
          设说((r && r.说) || '发送失败')
        }
      }

      const 试想 = async () => {
        const 目标 = (草稿.targets || [])[0]
        if (!目标) {
          设说('先勾一个会话，再试')
          return
        }
        设忙(true)
        const r = await post('/think', { sessionId: 目标 })
        设忙(false)
        if (r && r.ok) {
          设态(r)
          设说('想完了，下面能看到这段想法')
        } else {
          设说((r && r.说) || '思考失败')
        }
      }

      const 查更新 = async () => {
        设忙(true)
        const r = await post('/update/check')
        设忙(false)
        if (r && r.ok) {
          设态(r)
          设说(r.更新 && r.更新.有新版 ? `发现新版本 v${r.更新.最新版本}` : '已检查')
        } else {
          设说('检查更新失败')
        }
      }

      const 应用更新 = async () => {
        设忙(true)
        const r = await post('/update/apply')
        设忙(false)
        if (r && r.ok) {
          设态(r)
          设说(r.更新 && r.更新.待重启 ? '已更新，重启 DSH 后生效' : '没有可更新的版本')
        } else {
          设说('更新失败')
        }
      }

      if (!草稿) {
        return h('div', { style: S.wrap }, h('div', { style: S.dim }, '读取中…'))
      }

      const 会话 = (态 && 态.会话) || []
      const 想法 = (态 && 态.想法) || []
      const 更新 = (态 && 态.更新) || {}
      const 日志 = (态 && 态.日志) || []

      return h(
        'div',
        { style: S.wrap },
        h('div', { style: S.quote }, '「尾波」 鱼游过去了，水还在动——那点没散的动静，就是本鱼没说完的话  by.蔚蓝家的阿溟'),
        h('div', { style: S.h1 }, '尾波'),
        h('div', { style: S.sub }, '一轮说完后开始计时；没人回复就顺着语境再续一小段，闲下来时还会自己想想事情。'),
        h(
          'div',
          { style: S.pills },
          h('span', { style: 草稿.enabled ? S.pillOn : S.pill }, 草稿.enabled ? '● 已启用' : '○ 未启用'),
          h('span', { style: S.pill }, `目标会话 ${(草稿.targets || []).length}`),
          h('span', { style: S.pill }, `等待中 ${((态 && 态.等待中) || []).length}`),
          h('span', { style: S.pill }, `思考中 ${((态 && 态.思考中) || []).length}`),
        ),

        h('div', { style: S.section }, '续话'),
        h(
          'div',
          { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('b', null, '启用尾波'),
            h(开关, { on: !!草稿.enabled, onChange: (v) => 改('enabled', v) })),
          h('div', { style: S.hint }, '默认关闭。打开后只对下面勾选的会话生效。'),
        ),

        h(
          'div',
          { style: S.card },
          h('div', { style: S.label }, '等待区间（秒）：每次在这两个数之间随机'),
          h(
            'div',
            { style: S.row },
            h('input', {
              type: 'number',
              min: 10,
              max: 3600,
              value: 草稿.delayMinSec,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('delayMinSec', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, '至'),
            h('input', {
              type: 'number',
              min: 10,
              max: 3600,
              value: 草稿.delayMaxSec,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('delayMaxSec', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, '秒（10–3600；两端写一样就是固定值）'),
          ),

          h('div', { style: { ...S.label, marginTop: 12 } }, '最多连续续几次'),
          h('input', {
            type: 'number',
            min: 0,
            max: 20,
            value: 草稿.maxChain,
            style: { ...S.input, ...S.num },
            onChange: (e) => 改('maxChain', Number(e.target.value)),
          }),
          h('span', { style: { ...S.dim, marginLeft: 8 } }, '0 = 不续；真人说话后重新计数'),

          h('div', { style: { ...S.label, marginTop: 12 } }, '每次续话的概率（%）'),
          h('input', {
            type: 'number',
            min: 0,
            max: 100,
            value: 草稿.chance,
            style: { ...S.input, ...S.num },
            onChange: (e) => 改('chance', Number(e.target.value)),
          }),
          h('span', { style: { ...S.dim, marginLeft: 8 } }, '100 = 每次都续；掷骰在本地，不花 token'),
        ),

        h('div', { style: S.section }, '收尾判断'),
        h(
          'div',
          { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('b', null, '话题收尾就不接'),
            h(开关, { on: !!草稿.skipEnded, onChange: (v) => 改('skipEnded', v) })),
          h('div', { style: S.dim }, '本地判断最后一句有没有收尾词，不调模型、不花 token。'),
          h('div', { style: { ...S.label, marginTop: 10 } }, '额外结束词（逗号分隔）'),
          h('input', {
            type: 'text',
            value: 草稿.endingWords,
            placeholder: '例如：晚安, 先这样, 明天见',
            style: S.input,
            onChange: (e) => 改('endingWords', e.target.value),
          }),
          h('div', { style: S.dim }, '内置了一批常见收尾词；这里再加你习惯的说法。'),
        ),

        h(
          'div',
          { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('b', null, '用模型判断收尾（会花 token）'),
            h(开关, { on: !!草稿.useModelJudge, onChange: (v) => 改('useModelJudge', v) })),
          h('div', { style: S.dim }, '开启后：关键词没判出收尾时，再问一次这个会话正在用的模型「这条回复是否已自然收尾」，只让它答「是 / 否」。'),
          h('div', { style: S.dim }, '关着 = 完全用关键词，不调模型。判断失败或答非所问时按「没结束」继续。'),
        ),

        h('div', { style: S.section }, '空闲思考'),
        h(
          'div',
          { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('b', null, '空闲思考'),
            h(开关, { on: !!草稿.thinkEnabled, onChange: (v) => 改('thinkEnabled', v) })),
          h('div', { style: S.dim }, '没人说话时安静地想一会儿：不往会话里发消息，只在本地记下来。会花 token。'),

          h('div', { style: { ...S.label, marginTop: 10 } }, '多久后开始想（随机区间，秒）'),
          h(
            'div',
            { style: S.row },
            h('input', {
              type: 'number', min: 10, max: 3600, value: 草稿.thinkMinSec,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('thinkMinSec', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, '至'),
            h('input', {
              type: 'number', min: 10, max: 3600, value: 草稿.thinkMaxSec,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('thinkMaxSec', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, '秒（每次重新随机）'),
          ),

          h('div', { style: { ...S.label, marginTop: 10 } }, '继续想当前事情的概率（%）'),
          h('input', {
            type: 'number', min: 0, max: 100, value: 草稿.thinkContinuePct,
            style: { ...S.input, ...S.num },
            onChange: (e) => 改('thinkContinuePct', Number(e.target.value)),
          }),
          h('span', { style: { ...S.dim, marginLeft: 8 } }, `新话题 ${Math.max(0, 100 - Number(草稿.thinkContinuePct || 0))}%`),

          h('div', { style: { ...S.label, marginTop: 10 } }, '每次空闲最多想几次'),
          h('input', {
            type: 'number', min: 0, max: 20, value: 草稿.thinkMaxPerIdle,
            style: { ...S.input, ...S.num },
            onChange: (e) => 改('thinkMaxPerIdle', Number(e.target.value)),
          }),
          h('span', { style: { ...S.dim, marginLeft: 8 } }, '真人说话后重新计数'),

          h('div', { style: { ...S.row, justifyContent: 'space-between', marginTop: 4 } },
            h('b', null, '想到就说出来'),
            h(开关, { on: !!草稿.thinkSpeakEnabled, onChange: (v) => 改('thinkSpeakEnabled', v) })),
          h('div', { style: S.dim }, '按概率把刚想到的话直接发到会话里 —— 会真的开一轮、出现在聊天里，不只是记在本地。'),
          h('div', { style: { ...S.row, marginTop: 6 } },
            h('span', { style: S.dim }, '发出来的概率（%）'),
            h('input', {
              type: 'number', min: 0, max: 100, value: 草稿.thinkSpeakPct,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('thinkSpeakPct', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, '0 = 只想不说；100 = 每次都想说'),
          ),

          h('div', { style: { ...S.row, justifyContent: 'space-between', marginTop: 4 } },
            h('b', null, '想到就发 B站动态'),
            h(开关, { on: !!草稿.thinkBiliEnabled, onChange: (v) => 改('thinkBiliEnabled', v) })),
          h('div', { style: S.dim }, '把想法排进「刷B站」插件的动态队列，由它按互动根本原则检查后真发。与「说出来」互斥：同一次掷骰，说出来优先。'),
          h('div', { style: { ...S.row, marginTop: 6 } },
            h('span', { style: S.dim }, '发 B站 的概率（%）'),
            h('input', {
              type: 'number', min: 0, max: 100, value: 草稿.thinkBiliPct,
              style: { ...S.input, ...S.num },
              onChange: (e) => 改('thinkBiliPct', Number(e.target.value)),
            }),
            h('span', { style: S.dim }, `说出来 + B站 合计 ${Number(草稿.thinkSpeakPct || 0) + Number(草稿.thinkBiliPct || 0)}%（超过 100 时 B站 会被挤掉）`),
          ),
        ),

        h('div', { style: S.section }, '提示词'),
        h(
          'div',
          { style: S.card },
          h('div', { style: S.label }, '续话提示词'),
          h('textarea', {
            rows: 4,
            value: 草稿.prompt,
            style: { ...S.input, resize: 'vertical', lineHeight: 1.6 },
            onChange: (e) => 改('prompt', e.target.value),
          }),
          h('div', { style: S.dim }, '宿主会自动加一层说明，告诉模型这是它自己的念头、不是用户发来的消息。'),
        ),

        h('div', { style: S.section }, '生效范围'),
        h(
          'div',
          { style: S.card },
          h('div', { style: S.label }, '对哪些会话生效'),
          h('div', { style: S.dim }, '只列出当前能看到的会话；活着的排前面。没勾的不会自动续。'),
          会话.length === 0
            ? h('div', { style: S.dim }, '（现在没有可选的会话）')
            : h(
                'div',
                { style: { marginTop: 6 } },
                会话.map((s) =>
                  h(
                    'label',
                    { key: s.id, style: S.sess },
                    复选((草稿.targets || []).includes(s.id), () => 切会话(s.id)),
                    h('span', { style: { width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto', background: s.活着 ? '#3fb950' : 'rgba(127,127,127,.5)' } }),
                    h('span', null, s.标题 || '（还没起名）'),
                    h('span', { style: S.dim }, s.活着 ? '活着' : '没活着'),
                    h('span', { style: { ...S.dim, marginLeft: 'auto' } }, s.id.slice(0, 18)),
                  ),
                ),
              ),
        ),

        h('div', { style: S.section }, '更新'),
        h(
          'div',
          { style: S.card },
          h('div', { style: { ...S.row, justifyContent: 'space-between' } },
            h('b', null, '自动更新'),
            h(开关, { on: !!草稿.autoUpdate, onChange: (v) => 改('autoUpdate', v) })),
          h('div', { style: S.hint }, '开着时：每 6 小时查一次 GitHub，有新版本就自动下载替换，重启 DSH 后生效。'),
          h('div', { style: { ...S.row, marginTop: 8 } },
            h('span', { style: S.dim }, '仓库'),
            h('input', {
              type: 'text',
              value: 草稿.updateRepo || '',
              style: { ...S.input, flex: 1, minWidth: 200 },
              onChange: (e) => 改('updateRepo', e.target.value),
            }),
          ),
          h('div', { style: { ...S.row, marginTop: 8 } },
            h('span', { style: S.dim }, '方式'),
            h('select', {
              'data-bd-input': '',
              value: 草稿.updateMode || 'api',
              style: { ...S.input, width: 'auto', flex: '0 0 auto', minWidth: 220 },
              onChange: (e) => 改('updateMode', e.target.value),
            },
              h('option', { value: 'api' }, 'GitHub API（不需要 Git）'),
              h('option', { value: 'git' }, 'git clone（需要本机装 Git）'),
            ),
          ),
          h('div', { style: S.hint }, 'Git 模式会整包克隆（仓库里新增的文件也能拿到），但需要本机有 git；API 模式只更新固定文件清单。'),
          h('div', { style: { ...S.hint, marginTop: 8 } },
            `当前 v${更新.当前版本 || ''} · ${更新.待重启
              ? `已更新到 v${更新.已更新到}，重启生效`
              : 更新.有新版
                ? `有新版本 v${更新.最新版本}`
                : 更新.错误
                  ? `检查失败：${更新.错误}`
                  : 更新.检查时间 ? '已是最新' : '还没检查'}`),
          h('div', { style: { ...S.row, marginTop: 8 } },
            h('button', { style: S.btn, disabled: 忙, onClick: 查更新 }, '检查更新'),
            h('button', { style: S.btn, disabled: 忙 || !更新.有新版, onClick: 应用更新 }, '立即更新'),
          ),
        ),

        h('div', { style: S.section }, '记录'),
        h(
          'div',
          { style: S.savebar },
          h('button', { style: { ...S.primary, opacity: 忙 || !脏 ? 0.5 : 1 }, disabled: 忙 || !脏, onClick: 存 }, 忙 ? '保存中…' : 脏 ? '保存设置' : '已保存'),
          h('button', { style: S.btn, disabled: 忙, onClick: 试 }, '现在续一句'),
          h('button', { style: S.btn, disabled: 忙, onClick: 试想 }, '现在想一次'),
          说 ? h('span', { style: S.dim }, 说) : h('span', { style: S.hint }, '第一个勾选的会话'),
        ),

        h(
          'div',
          { style: S.card },
          h('div', { style: S.label }, '最近的想法'),
          想法.length === 0
            ? h('div', { style: S.hint }, '还没有。开启空闲思考等一会儿，或点下面的「现在想一次」。')
            : h(
                'div',
                null,
                想法
                  .slice()
                  .reverse()
                  .map((x, i) =>
                    h(
                      'div',
                      { key: i, style: { ...S.thought, ...(i === 0 ? { borderTop: 'none' } : {}) } },
                      h(
                        'div',
                        { style: { ...S.row, justifyContent: 'space-between' } },
                        h('span', { style: S.pill }, x.模式 || '想法'),
                        h('span', { style: S.dim }, x.时间 || ''),
                      ),
                      h('div', { style: { marginTop: 4 } }, x.文本 || ''),
                    ),
                  ),
              ),
        ),

        h(
          'div',
          { style: S.card },
          h('div', { style: S.label }, '最近记录'),
          日志.length === 0
            ? h('div', { style: S.dim }, '还没有记录。等一轮结束、没人回复，到点后这里会出现一条。')
            : h(
                'div',
                { style: S.log },
                日志
                  .slice()
                  .reverse()
                  .map((x) => `${x.时间}${x.会话 ? ' [' + x.会话 + ']' : ''}  ${x.文本}`)
                  .join('\n'),
              ),
        ),

        h(
          'div',
          { style: { ...S.hint, marginTop: 10 } },
          '工作方式：监听 turn/end → 随机等待 → 没有真人消息就用 agent.followup 起一轮；空闲时也会安静地想事情。都会花 token，默认关闭。',
        ),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'wake', order: 54, label: () => '尾波' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
