/**
 * 本站设置面板（底栏 🎛）：自动下载开关 / 名称规则（点选设置+本站规则管理）
 * TitleRuleButton 迁移自原 FeaturesPanel；规则存 chrome.storage.sync 的 titleRules
 * （发送到本地已按需求隐藏，功能本身保留在设置页与消息链路中）
 */
// @ts-nocheck
import React, { useEffect, useRef, useState } from "react"
import { G, i18n } from "~lib/init"
import { useMediaStore } from "~sidepanel/store"
import { sendMessage, tabSendMessage } from "~components/shared/api"
import { showTips } from "~components/shared/toast-bus"

/** 本站设置视图 */
export function SettingsPanel() {
  const { buttonState, updateButton } = useMediaStore()

  /** 自动下载开关（开启后底栏 🎛 亮绿点） */
  const toggleAutoDown = () => {
    sendMessage({ Message: "autoDown", tabId: G.tabId }).then(updateButton)
  }

  return (
    <div id="sitePanel" className="container TabShow">
      <div className="sectionTitle">自动下载</div>
      <div className="toggleRow">
        <span className="toggleLabel">嗅探到资源后自动下载到本地</span>
        <button
          id="AutoDown"
          className={"switch" + (buttonState.AutoDown ? " on" : "")}
          title={buttonState.AutoDown ? i18n.closeDownload : i18n.autoDownload}
          onClick={toggleAutoDown}
        >
          <span className="thumb" />
        </button>
      </div>
      <div className="sectionTitle">名称规则</div>
      <TitleRuleButton />
      <SiteTitleRules />
    </div>
  )
}

/**
 * 名称规则按钮：进入页面点选模式保存当前域名的自动标题规则
 * （原 FeaturesPanel.TitleRuleButton 原样迁移）
 */
function TitleRuleButton() {
  const [picking, setPicking] = useState(false)
  const [hint, setHint] = useState<React.ReactNode>(null)
  const timer = useRef<number | null>(null)

  /** 读取当前域名已保存的规则并展示 */
  const refreshHint = () => {
    chrome.tabs.get(G.tabId, tab => {
      if (chrome.runtime.lastError || !tab?.url) { return }
      let hostname = ""
      try { hostname = new URL(tab.url).hostname } catch { return }
      if (!hostname) { return }
      chrome.storage.sync.get({ titleRules: [] }, (items: any) => {
        const rules = items.titleRules || []
        const matchDomain = (h: string, p: string) => {
          if (!p) { return false }
          if (p === "*") { return true }
          try {
            return new RegExp(
              "^" +
                p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*?") +
                "$",
              "i"
            ).test(h)
          } catch {
            return false
          }
        }
        const rule =
          rules.find((r: any) => r && r.state && r.domain === hostname) ||
          rules.find(
            (r: any) => r && r.state && r.domain && matchDomain(hostname, r.domain)
          )
        if (rule) {
          const attrText = rule.attr ? `[${rule.attr}]` : "textContent"
          setHint(
            <>
              <b>{rule.domain}</b> → <code>{rule.selector}</code> {attrText}
            </>
          )
        } else {
          setHint(
            <span style={{ opacity: 0.6 }}>{hostname} 尚未设置名称规则</span>
          )
        }
      })
    })
  }

  useEffect(() => {
    refreshHint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 停止点选态 */
  const stop = () => {
    setPicking(false)
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  /** 点击进入/退出页面点选 */
  const onClick = () => {
    if (picking) {
      stop()
      tabSendMessage(G.tabId, { Message: "pickElementCancel" }, { frameId: 0 })
      return
    }
    setPicking(true)
    timer.current = window.setTimeout(stop, 15000)
    tabSendMessage(
      G.tabId,
      { Message: "pickElement", saveRule: true },
      { frameId: 0 }
    ).then((resp: any) => {
      stop()
      if (resp && resp.savedRule) {
        showTips("已保存该网站的名称规则", 1200)
        refreshHint()
      }
    })
  }

  return (
    <>
      <button
        id="setTitleRule"
        className={"button2" + (picking ? " picking" : "")}
        title="为当前网站设置自动取标题的规则"
        onClick={onClick}
      >
        {picking ? "⏳ 请在页面点击标题元素…" : "🎯 设置名称规则"}
      </button>
      <div className="titleRuleHint">{hint}</div>
    </>
  )
}

/**
 * 本站已存名称规则列表：展示匹配当前 hostname 的规则（精确或通配），
 * 支持停用/启用与删除，写回 chrome.storage.sync
 */
function SiteTitleRules() {
  /** 全部规则（带原始索引 _index 便于写回） */
  const [rules, setRules] = useState<any[] | null>(null)
  const [hostname, setHostname] = useState("")

  /** 域名通配匹配（与原 TitleRuleButton 规则一致） */
  const matchDomain = (h: string, p: string) => {
    if (!p) { return false }
    if (p === "*") { return true }
    try {
      return new RegExp(
        "^" +
          p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*?") +
          "$",
        "i"
      ).test(h)
    } catch {
      return false
    }
  }

  /** 读取当前标签页 hostname 与本站匹配规则 */
  const refresh = () => {
    chrome.tabs.get(G.tabId, tab => {
      if (chrome.runtime.lastError || !tab?.url) { return }
      let host = ""
      try { host = new URL(tab.url).hostname } catch { return }
      setHostname(host)
      if (!host) { return }
      chrome.storage.sync.get({ titleRules: [] }, (items: any) => {
        const all = (items.titleRules || []).map((r: any, i: number) => ({
          ...r,
          _index: i
        }))
        setRules(
          all.filter(
            (r: any) => r.domain && matchDomain(host, r.domain)
          )
        )
      })
    })
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 写回规则数组（剥掉辅助索引字段）后刷新 */
  const save = (all: any[]) => {
    chrome.storage.sync.set(
      { titleRules: all.map(({ _index, ...r }) => r) },
      refresh
    )
  }

  /** 停用/启用规则（保留配置仅切换 state） */
  const toggleRule = (rule: any) => {
    chrome.storage.sync.get({ titleRules: [] }, (items: any) => {
      const all = [...(items.titleRules || [])]
      if (all[rule._index]) {
        all[rule._index] = { ...all[rule._index], state: !rule.state }
      }
      save(all)
    })
  }

  /** 删除规则（二次确认） */
  const removeRule = (rule: any) => {
    if (!confirm(`删除规则 ${rule.domain} → ${rule.selector}？`)) { return }
    chrome.storage.sync.get({ titleRules: [] }, (items: any) => {
      const all = [...(items.titleRules || [])]
      all.splice(rule._index, 1)
      save(all)
    })
  }

  if (!hostname) { return null }
  return (
    <div className="siteRules">
      {rules !== null && rules.length === 0 && (
        <div className="titleRuleHint">{hostname} 暂无已保存的名称规则</div>
      )}
      {(rules || []).map(rule => (
        <div className="ruleItem" key={rule._index}>
          <input
            type="checkbox"
            checked={!!rule.state}
            title={rule.state ? "停用该规则" : "启用该规则"}
            onChange={() => toggleRule(rule)}
          />
          <span className="ruleText">
            <b>{rule.domain}</b> → <code>{rule.selector}</code>{" "}
            {rule.attr ? `[${rule.attr}]` : "textContent"}
          </span>
          <button
            className="ruleDel"
            title={i18n.delete}
            onClick={() => removeRule(rule)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
