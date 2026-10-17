/**
 * 媒体遥控面板：选择标签页/媒体，控制播放/倍速/画中画/全屏/截图/循环/静音/音量/进度
 * 由 ToolsPanel 内嵌使用；迁移自 js/media-control.js
 */
// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from "react"
import { G, i18n } from "~lib/init"
import { secToTime, stringModify } from "~lib/function"
import { tabSendMessage } from "./api"

interface VideoState {
  paused: boolean
  speed: number
  loop: boolean
  muted: boolean
  volume: number
  time: number
  currentTime: number
  duration: number
  type: string
}

/** 媒体遥控面板（仅在该 Tab 激活时挂载） */
export function MediaControl() {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])
  const [selectedTab, setSelectedTab] = useState(-1)
  const [videos, setVideos] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [state, setState] = useState<Partial<VideoState>>({})
  const [hasPip, setHasPip] = useState(true)
  const [hasScreenshot, setHasScreenshot] = useState(true)
  const [playbackRate, setPlaybackRate] = useState<number>(G.playbackRate ?? 2)

  const tabIdRef = useRef(selectedTab)
  tabIdRef.current = selectedTab
  const indexRef = useRef(selectedIndex)
  indexRef.current = selectedIndex

  /** 读取选中标签页的视频状态并同步 UI */
  const getVideoState = useCallback(() => {
    const tid = tabIdRef.current
    const idx = indexRef.current
    if (tid == -1) { return }
    tabSendMessage(
      tid,
      { Message: "getVideoState", index: idx },
      { frameId: 0 }
    ).then((res: any) => {
      if (!res || res.count == 0) { return }
      setState({
        paused: res.paused,
        speed: res.speed,
        loop: res.loop,
        muted: res.muted,
        volume: res.volume,
        time: res.time,
        currentTime: res.currentTime,
        duration: res.duration,
        type: res.type
      })
      if (res.type == "audio") {
        setHasPip(false)
        setHasScreenshot(false)
      } else {
        setHasPip(!G.isFirefox)
        setHasScreenshot(true)
      }
      if (res.speed != 1) { setPlaybackRate(res.speed) }
      setVideos(prev => {
        if (prev.toString() === (res.src || []).toString()) { return prev }
        return res.src
      })
      if (indexRef.current == -1) {
        setSelectedIndex(0)
      }
    })
  }, [])

  /** 枚举普通窗口中含媒体的标签页 */
  const getVideoTag = useCallback(() => {
    chrome.tabs.query({ windowType: "normal" }, (list: chrome.tabs.Tab[]) => {
      setTabs(prev => {
        const prevIds = prev.map(t => t.id)
        const nextIds = list.map(t => t.id)
        if (prevIds.toString() === nextIds.toString()) { return prev }
        return list
      })
      // 检查每个标签页是否有媒体，无则从下拉中剔除；当前页有媒体则默认选中
      for (const tab of list) {
        tabSendMessage(
          tab.id!,
          { Message: "getVideoState", index: 0 },
          { frameId: 0 }
        ).then((res: any) => {
          if (!res || res.count == 0) {
            setTabs(prev => prev.filter(t => t.id !== tab.id))
            return
          }
          if (tab.id == G.tabId && tabIdRef.current == -1) {
            setSelectedTab(tab.id!)
          }
        })
      }
    })
  }, [])

  /** 挂载：恢复上次控制目标，启动轮询 */
  useEffect(() => {
    setPlaybackRate(G.playbackRate ?? 2)
    getVideoTag()
    const tagTimer = window.setInterval(getVideoTag, 1000)
    const stateTimer = window.setInterval(getVideoState, 500)
    ;(chrome.storage.session ?? chrome.storage.local)
      .get({ mediaControl: { tabid: -1, index: -1 } })
      .then((items: any) => {
        const saved = items.mediaControl
        if (!saved || saved.tabid == -1) { return }
        chrome.tabs.get(saved.tabid, tab => {
          if (chrome.runtime.lastError) { return }
          tabSendMessage(
            saved.tabid,
            { Message: "getVideoState", index: 0 },
            { frameId: 0 }
          ).then((res: any) => {
            if (!res || res.count == 0) { return }
            setSelectedTab(saved.tabid)
            if (res.count > saved.index) { setSelectedIndex(saved.index) }
          })
        })
      })
    return () => {
      clearInterval(tagTimer)
      clearInterval(stateTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 记住控制目标，供下次打开恢复 */
  const persist = (tid: number, idx: number) => {
    ;(chrome.storage.session ?? chrome.storage.local).set({
      mediaControl: { tabid: tid, index: idx }
    })
  }

  /** 切换标签页 */
  const onTabChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tid = parseInt(e.target.value)
    setSelectedTab(tid)
    setHasPip(!G.isFirefox)
    setHasScreenshot(true)
    persist(tid, indexRef.current)
    setTimeout(getVideoState, 0)
  }

  /** 切换媒体序号 */
  const onVideoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value)
    setSelectedIndex(idx)
    persist(tabIdRef.current, idx)
    setTimeout(getVideoState, 0)
  }

  /** 倍速数字框滚轮调节 */
  const onRateWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    let speed = parseFloat(String(playbackRate))
    speed = e.deltaY < 0 ? speed + 1 : speed - 1
    speed = Math.round(speed)
    if (speed < 1 || speed > 16) { return }
    setPlaybackRate(speed)
    window.setTimeout(() => {
      chrome.storage.sync.set({ playbackRate: speed })
      tabSendMessage(tabIdRef.current, {
        Message: "speed",
        speed,
        index: indexRef.current
      })
    }, 200)
  }

  /** 倍速/常速切换 */
  const onSpeed = () => {
    if (selectedIndex < 0 || selectedTab < 0) { return }
    if (state.speed == 1) {
      const speed = parseFloat(String(playbackRate))
      tabSendMessage(selectedTab, { Message: "speed", speed, index: selectedIndex })
      chrome.storage.sync.set({ playbackRate: speed })
    } else {
      tabSendMessage(selectedTab, { Message: "speed", speed: 1, index: selectedIndex })
    }
  }

  /** 播放/暂停 */
  const onControl = () => {
    if (selectedIndex < 0 || selectedTab < 0) { return }
    tabSendMessage(selectedTab, {
      Message: state.paused ? "play" : "pause",
      index: selectedIndex
    })
  }

  /** 画中画 */
  const onPip = () => {
    tabSendMessage(selectedTab, { Message: "pip", index: selectedIndex })
  }

  /** 全屏：切到目标标签页再触发 */
  const onFullScreen = () => {
    chrome.tabs.get(selectedTab, tab => {
      chrome.tabs.highlight({ tabs: tab.index }, () => {
        tabSendMessage(selectedTab, { Message: "fullScreen", index: selectedIndex })
      })
    })
  }

  /** 循环/静音 */
  const onToggle = (e: React.MouseEvent<HTMLInputElement>) => {
    const action = (e.target as HTMLInputElement).checked
    tabSendMessage(selectedTab, {
      Message: (e.target as HTMLInputElement).id,
      action,
      index: selectedIndex
    })
  }

  /** 音量（松开时发送） */
  const onVolume = (e: React.MouseEvent<HTMLInputElement>) => {
    tabSendMessage(selectedTab, {
      Message: "setVolume",
      volume: (e.target as HTMLInputElement).value,
      index: selectedIndex
    })
  }

  /** 进度（松开时发送） */
  const onTime = (e: React.MouseEvent<HTMLInputElement>) => {
    tabSendMessage(selectedTab, {
      Message: "setTime",
      time: (e.target as HTMLInputElement).value,
      index: selectedIndex
    })
  }

  /** 跳转扩展页面 */
  const go = (url: string) => {
    if (url == "ffmpegURL") {
      chrome.tabs.create({ url: G.ffmpegConfig.url })
      return
    }
    chrome.tabs.create({ url })
  }

  return (
    <div id="otherOptions" className="mediaControlBox">
      <div className="flexRow">
        <b className="nowrap">{i18n.selectWebpage}</b>
        <select id="videoTabIndex" value={selectedTab} onChange={onTabChange}>
          {selectedTab == -1 && <option value={-1}>{i18n.noMediaDetected}</option>}
          {tabs.map(tab => (
            <option key={tab.id} value={tab.id}>
              {stringModify(tab.title)}
            </option>
          ))}
        </select>
      </div>
      <div className="flexRow">
        <b className="nowrap">{i18n.selectMedia}</b>
        <select id="videoIndex" value={selectedIndex} onChange={onVideoChange}>
          {selectedIndex == -1 && <option value={-1}>{i18n.noControllableMediaDetected}</option>}
          {videos.map((src, i) => {
            let label = src.split("/").pop()
            if (label.length >= 60) {
              label = label.substr(0, 35) + "..." + label.substr(-35)
            }
            return (
              <option key={i} value={i}>
                {label}
              </option>
            )
          })}
        </select>
      </div>

      <div id="PlayControl" className="textColor">
        <span>{i18n.multiplier}</span>
        <input
          id="playbackRate"
          type="number"
          value={playbackRate}
          min={0.1}
          max={16}
          step={1}
          onChange={e => setPlaybackRate(e.target.value)}
          onWheel={onRateWheel}
        />
        <button id="speed" className="button2" onClick={onSpeed}>
          {state.speed == 1 ? i18n.speedPlayback : i18n.normalPlay}
        </button>
        <button id="control" onClick={onControl}>
          {state.paused ? i18n.play : i18n.pause}
        </button>
        {hasPip && (
          <button id="pip" className="firefoxHide" onClick={onPip}>
            {i18n.pictureInPicture}
          </button>
        )}
        {hasScreenshot && (
          <button id="fullScreen" className="firefoxHide" onClick={onFullScreen}>
            {i18n.fullscreen}
          </button>
        )}
        {hasScreenshot && (
          <button
            id="screenshot"
            onClick={() =>
              tabSendMessage(selectedTab, { Message: "screenshot", index: selectedIndex })
            }
          >
            {i18n.screenshot}
          </button>
        )}
        <label className="flexColumn loop" title="Loop">
          <div>{i18n.loop}</div>
          <input type="checkbox" id="loop" checked={!!state.loop} onClick={onToggle} readOnly />
        </label>
        <label className="flexColumn muted" title="Mute">
          <div>{i18n.mute}</div>
          <input type="checkbox" id="muted" checked={!!state.muted} onClick={onToggle} readOnly />
        </label>
        <div className="flexColumn">
          <div>{i18n.volume}</div>
          <input
            type="range"
            id="volume"
            className="volume"
            min={0}
            max={1}
            value={state.volume ?? 1}
            step={0.01}
            onMouseUp={onVolume}
            onChange={() => {}}
          />
        </div>
        <div className="flexColumn width100">
          <div id="timeShow">
            {state.duration && state.duration !== Infinity
              ? secToTime(state.currentTime) + " / " + secToTime(state.duration)
              : ""}
          </div>
          <input
            type="range"
            id="time"
            className="width100"
            min={0}
            max={100}
            value={state.time ?? 0}
            step={1}
            onMouseUp={onTime}
            onChange={() => {}}
          />
        </div>
      </div>

      <div className="line" />
      <div className="otherTips">{i18n.functionEntry}</div>
      <div className="otherFeat flexRow">
        <button className="button2" onClick={() => go("tabs/downloader.html")}>{i18n.downloader}</button>
        <button className="button2" onClick={() => go("tabs/m3u8.html")}>{i18n.m3u8Parser}</button>
        <button className="button2" onClick={() => go("tabs/mpd.html")}>{i18n.mpdParser}</button>
        <button className="button2" onClick={() => go("tabs/json.html")}>{i18n.jsonFormatter}</button>
        <button className="button2" onClick={() => go("ffmpegURL")}>FFmpeg</button>
      </div>
    </div>
  )
}
