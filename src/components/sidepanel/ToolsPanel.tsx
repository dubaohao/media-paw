/**
 * 工具面板（底栏 🧰）：抓取增强 / 录制 / 媒体遥控（MediaControl 整体迁入）
 * 按钮逻辑迁移自原 FeaturesPanel 的工具部分
 */
// @ts-nocheck
import React from "react"
import { G, i18n } from "~lib/init"
import { useMediaStore } from "./store"
import { sendMessage } from "./api"
import { MediaControl } from "./MediaControl"

/** 工具面板视图 */
export function ToolsPanel() {
  const { buttonState, updateButton, clearGroup } = useMediaStore()

  /** 注入发现脚本（search/catch/recorder/webrtc） */
  const injectScript = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = (e.currentTarget as HTMLElement).id + ".js"
    sendMessage({ Message: "script", tabId: G.tabId, script: name }).then(() => {
      if (G.autoClearMode > 0) { clearGroup() }
      updateButton()
    })
  }

  /** 模拟手机端 UA */
  const toggleMobile = () => {
    sendMessage({ Message: "mobileUserAgent", tabId: G.tabId }).then(() => {
      if (G.refreshClear) { clearGroup() }
      updateButton()
    })
  }

  /** 按按钮状态生成文案 */
  const scriptLabel = (id: string) => {
    const script = G.scriptList.get(id + ".js")
    return buttonState[id] ? script.off : script.name
  }
  const scriptHidden = G.version < 102

  return (
    <div id="toolsPanel" className="container TabShow">
      <div className="sectionTitle">抓取增强</div>
      <div className="toolboxTip">
        💡 自动嗅探没抓到想要的视频？按以下顺序依次尝试，越靠下越需要手动操作
      </div>
      <div className="toolbox">
        {!scriptHidden && (
          <button
            id="search"
            className="tbBtn tbBlue firefoxHideScript"
            type="button"
            data-tip="深度扫描页面内部请求（XHR / fetch / Worker），全程无感知，优先试它"
            onClick={injectScript}
          >
            {scriptLabel("search")}
          </button>
        )}
        {!scriptHidden && (
          <button
            id="catch"
            className="tbBtn tbBlue firefoxHideScript"
            type="button"
            data-tip="抓取 blob: / MSE 流媒体分片（B 站类播放器加载的视频流）"
            onClick={injectScript}
          >
            {scriptLabel("catch")}
          </button>
        )}
        <button
          id="MobileUserAgent"
          className="tbBtn tbBlue firefoxHideScript"
          data-tip="切换移动端 UA 重新嗅探，部分站点只对手机端返回真实地址"
          onClick={toggleMobile}
        >
          {buttonState.MobileUserAgent ? i18n.closeSimulation : i18n.simulateMobile}
        </button>
      </div>
      <div className="sectionTitle">录制</div>
      <div className="toolbox">
        {!scriptHidden && (
          <button
            id="recorder"
            className="tbBtn tbRec firefoxHideScript"
            type="button"
            data-tip="直接录制页面播放器中的画面（MediaRecorder）"
            onClick={injectScript}
          >
            {scriptLabel("recorder")}
          </button>
        )}
        <button
          id="recorder2"
          className="tbBtn tbRec"
          type="button"
          data-tip="录制你分享的整个屏幕或浏览器标签页"
          onClick={injectScript}
        >
          {scriptLabel("recorder2")}
        </button>
        {!scriptHidden && (
          <button
            id="webrtc"
            className="tbBtn tbRec firefoxHideScript"
            type="button"
            data-tip="录制视频会议、P2P 直播等 WebRTC 实时媒体流"
            onClick={injectScript}
          >
            {scriptLabel("webrtc")}
          </button>
        )}
      </div>
      <div className="sectionTitle">媒体遥控</div>
      <MediaControl />
    </div>
  )
}
