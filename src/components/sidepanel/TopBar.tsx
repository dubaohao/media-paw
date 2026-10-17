/**
 * 顶栏：品牌+资源计数 / 密钥入口 / 嗅探开关 / 弹窗入口 / 全局设置 / 切换当前页
 * 重构：移除三个页签（资源/其他功能媒体控制/可能密钥），密钥改为嗅探到时亮图标
 */
// @ts-nocheck
import React from "react"
import { G, i18n } from "~lib/init"
import { useMediaStore } from "./store"
import { sendMessage } from "./api"

interface Props {
  /** 密钥浮层是否展开 */
  keysOpen: boolean
  /** 切换密钥浮层 */
  onToggleKeys: () => void
  /** 侧栏模式（URL 带 tabId） */
  sideMode: boolean
  /** type=window 的侧栏窗口 */
  showCurrentPage: boolean
  /** 侧栏窗口类型（window/tab），切换当前页时透传 */
  sideType: string | null
}

/** 顶部导航栏 */
export function TopBar({ keysOpen, onToggleKeys, sideMode, showCurrentPage, sideType }: Props) {
  const { current, other, keys, buttonState, updateButton } = useMediaStore()

  const total = current.size + other.size

  /** 暂停/恢复嗅探 */
  const toggleEnable = () => {
    sendMessage({ Message: "enable" }).then(() => updateButton())
  }

  /** 按 popupMode 在新标签/窗口中打开独立面板 */
  const openPopup = () => {
    switch (G.popupMode) {
      case 0:
        chrome.tabs.create({ url: `tabs/preview.html?tabId=${G.tabId}` })
        break
      case 1:
        chrome.tabs.create({ url: `sidepanel.html?tabId=${G.tabId}&type=tab` })
        break
      case 2:
        chrome.windows.create({
          url: `tabs/preview.html?tabId=${G.tabId}`,
          type: "popup",
          height: 1080,
          width: 1920
        })
        break
      case 3:
        chrome.windows.create({
          url: `sidepanel.html?tabId=${G.tabId}&type=window`,
          type: "popup",
          height: 1080,
          width: 1920
        })
        break
      default:
        chrome.tabs.create({ url: `tabs/preview.html?tabId=${G.tabId}` })
    }
  }

  /** 切换到浏览器当前活动标签页的资源 */
  const openCurrentPage = () => {
    chrome.tabs.query({ active: true, currentWindow: false }, tabs => {
      const suffix = sideType ? "&type=" + sideType : ""
      chrome.tabs.update({
        url: `sidepanel.html?tabId=${tabs[0].id}${suffix}`
      })
    })
  }

  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-paw">🐾</span>
        <span className="brand-name">猫爪</span>
        {/* 资源总数徽章：嗅探到越多越显眼 */}
        {total > 0 && <span className="brandCount">[{total}]</span>}
      </div>
      <div className="topActions">
        {/* 嗅探到疑似密钥时亮起，点开浮层查看 */}
        {keys.length > 0 && (
          <button
            id="maybeKeyBtn"
            className={"tbtn keyBtn" + (keysOpen ? " Active" : "")}
            title={i18n.possibleKey}
            onClick={onToggleKeys}
          >
            🔑
          </button>
        )}
        {/* 嗅探开关：iOS 风格 toggle，绿色=抓取中 */}
        <label className="switch" title="Pause/Resume capturing">
          <input
            id="enable"
            type="checkbox"
            checked={!!buttonState.enable}
            onChange={toggleEnable}
          />
          <span className="slider" />
        </label>
        {!sideMode && (
          <button id="popup" className="tbtn" title="Open in popup window" onClick={openPopup}>
            ⧉
          </button>
        )}
        <button
          id="Options"
          className="tbtn"
          title="Settings"
          onClick={() => chrome.tabs.create({ url: "options.html" })}
        >
          ⚙
        </button>
        {showCurrentPage && (
          <button id="currentPage" className="tbtn" onClick={openCurrentPage}>
            {i18n.currentPage}
          </button>
        )}
      </div>
    </div>
  )
}
