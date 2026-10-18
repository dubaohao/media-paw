/**
 * 侧边栏根组件：吸顶区（顶栏+筛选条+密钥浮层）+ 主视图（列表/工具/本站设置）+ 底栏 + Toast
 * 重构：移除三页签结构，工具与本站设置改为底栏 🧰/🎛 切换
 */
// @ts-nocheck
import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { G } from "~lib/init"
import { TopBar } from "./components/TopBar"
import { MediaList } from "./components/MediaList"
import { FilterBar } from "./components/FilterBar"
import { ToolsPanel } from "./components/ToolsPanel"
import { SettingsPanel } from "./components/SettingsPanel"
import { MaybeKeys } from "./components/MaybeKeys"
import { BottomBar, MainView } from "./components/BottomBar"
import { Toast } from "./components/Toast"

interface Props {
  /** 侧栏模式（URL 带 tabId 参数） */
  sideMode: boolean
  /** 侧栏窗口类型 type=window */
  windowType: boolean
  /** 侧栏窗口类型原始值（window/tab） */
  sideType: string | null
}

/** 根布局与主视图调度 */
export function App({ sideMode, windowType, sideType }: Props) {
  /** 主视图：资源列表 / 工具箱 / 本站设置 */
  const [view, setView] = useState<MainView>("media")
  /** 密钥浮层开关 */
  const [showKeys, setShowKeys] = useState(false)
  const [barHeight, setBarHeight] = useState(40)
  const downRef = useRef<HTMLDivElement>(null)

  // 动态测量底栏高度：容器底部留白（底栏三视图常驻）
  useLayoutEffect(() => {
    const measure = () => {
      if (downRef.current) { setBarHeight(downRef.current.offsetHeight) }
    }
    measure()
    const timer = window.setInterval(measure, 233)
    window.addEventListener("resize", measure)
    return () => {
      clearInterval(timer)
      window.removeEventListener("resize", measure)
    }
  }, [view])

  // 注入自定义 CSS（G.css 与移动端样式由 init/loadCSS 提供）
  useEffect(() => {
    const style = document.createElement("style")
    style.textContent = G.css || ""
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  // body 类名：侧栏布局 / Firefox 兼容
  useEffect(() => {
    document.body.classList.add("sidepanelBody")
    if (sideMode) {
      document.body.classList.add("body-side")
    }
    if (G.isFirefox) {
      document.body.classList.add("fixFirefoxRight")
    }
  }, [sideMode])

  return (
    <>
      <div className="topStack">
        <TopBar
          keysOpen={showKeys}
          onToggleKeys={() => setShowKeys(v => !v)}
          sideMode={sideMode}
          showCurrentPage={sideMode && windowType}
          sideType={sideType}
        />
        {/* 筛选条常驻资源列表上方 */}
        {view === "media" && <FilterBar />}
        {/* 密钥浮层：透明遮罩点击关闭，面板在吸顶区下方展开 */}
        {showKeys && (
          <div className="keysMask" onClick={() => setShowKeys(false)} />
        )}
        {showKeys && (
          <div className="keysOverlay" onClick={e => e.stopPropagation()}>
            <MaybeKeys />
          </div>
        )}
      </div>
      <Toast />

      <div
        className={sideMode ? "sidepanel-content" : ""}
        style={{ marginBottom: barHeight + 2 }}
      >
        {view === "media" && <MediaList />}
        {view === "tools" && <ToolsPanel />}
        {view === "site" && <SettingsPanel />}
      </div>

      <BottomBar
        ref={downRef}
        view={view}
        onTools={() => setView(v => (v === "tools" ? "media" : "tools"))}
        onSite={() => setView(v => (v === "site" ? "media" : "site"))}
      />
    </>
  )
}
