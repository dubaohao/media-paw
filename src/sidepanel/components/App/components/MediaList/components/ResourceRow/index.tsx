/**
 * 单条媒体资源行：复选框/图标/可编辑标题/下载/定位/导出网格/预览/卡片底色进度
 * 迁移自 popup.js AddMedia 中的 DOM 结构与约 20 个事件绑定
 */
// @ts-nocheck
import React, { useEffect, useRef, useState } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { G, i18n } from "~lib/init"
import { isEmpty, openParser, secToTime, send2local } from "~lib/function"
import type { MediaResource } from "~components/shared/types"
import { copyLink } from "~components/shared/format"
import {
  aria2AddUri,
  catDownload,
  downloadOne,
  invokeExternal,
  openExternalPlayer,
  sendToMQTT
} from "~components/shared/actions"
import { useMediaStore } from "~sidepanel/store"
import { showTips } from "~components/shared/toast-bus"
import { sendMessage, tabSendMessage } from "~components/shared/api"
import { InlinePreview, PreviewHandle } from "~components/shared/InlinePreview"

interface Props {
  data: MediaResource
  /** true=当前页分组，false=其他页分组 */
  isCurrent: boolean
}

/** 参数确认弹层（m3u8dl / invoke 共用） */
interface ConfirmBox {
  kind: "m3u8dl" | "invoke"
  text: string
}

/** 渲染一条资源 */
export function ResourceRow({ data, isCurrent }: Props) {
  const {
    toggleCheck,
    toggleExpand,
    applyTitle,
    progress,
    favicon,
    sideMode,
    removeMedia
  } = useMediaStore()

  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [mqttSending, setMqttSending] = useState(false)
  const [argDraft, setArgDraft] = useState("")

  const nameEditRef = useRef<HTMLSpanElement>(null)
  const pickTimer = useRef<number | null>(null)
  const previewRef = useRef<PreviewHandle>(null)
  const [mediaMeta, setMediaMeta] = useState<any>({})
  const [everExpanded, setEverExpanded] = useState(false)
  useEffect(() => {
    if (data.expanded) { setEverExpanded(true) }
  }, [data.expanded])

  /** 列表展示用名称（非侧栏模式下截断长文件名） */
  const displayName =
    data.name && data.name.length >= 50 && !sideMode
      ? data.name.substr(0, 20) + "..." + data.name.substr(-30)
      : data.name

  /** 进入标题编辑态：剥掉扩展名、聚焦全选 */
  const startEdit = () => {
    setEditing(true)
    setTimeout(() => {
      const el = nameEditRef.current
      if (!el) { return }
      const extSuffix = data.ext ? "." + data.ext : ""
      let baseName = data.name
      if (extSuffix && baseName.toLowerCase().endsWith(extSuffix.toLowerCase())) {
        baseName = baseName.slice(0, -extSuffix.length)
      }
      el.textContent = baseName
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })
  }

  /** 结束编辑，save 为 true 时保存新标题 */
  const finishEdit = (save: boolean) => {
    const el = nameEditRef.current
    if (!el) { return }
    if (save) {
      const newTitle = (el.textContent || "").trim()
      if (newTitle && newTitle !== data._title) {
        applyTitle(data.requestId, isCurrent, newTitle)
      }
    }
    setEditing(false)
  }

  // 编辑态下点击外部自动保存
  useEffect(() => {
    if (!editing) { return }
    const onDocDown = (e: MouseEvent) => {
      const el = nameEditRef.current
      if (el && !el.contains(e.target as Node) &&
        !(e.target as HTMLElement).classList.contains("nameEditBtn")) {
        finishEdit(true)
      }
    }
    document.addEventListener("mousedown", onDocDown)
    return () => document.removeEventListener("mousedown", onDocDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  /** 编辑按钮：第一下编辑，第二下保存 */
  const onEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (editing) { finishEdit(true) } else { startEdit() }
  }

  /** 定位按钮：通知 content-script 进入页面点选模式，再次点击取消 */
  const onPickClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const stop = () => {
      setPicking(false)
      if (pickTimer.current) {
        clearTimeout(pickTimer.current)
        pickTimer.current = null
      }
    }
    if (picking) {
      stop()
      tabSendMessage(G.tabId, { Message: "pickElementCancel" }, { frameId: 0 })
      return
    }
    setPicking(true)
    pickTimer.current = window.setTimeout(stop, 15000)
    tabSendMessage(
      G.tabId,
      { Message: "pickElement", requestId: data.requestId },
      { frameId: 0 }
    ).then((resp: any) => {
      stop()
      if (resp && resp.title) {
        applyTitle(data.requestId, isCurrent, resp.title)
        showTips(i18n.hasSent || "已选取", 800)
      }
    })
  }

  /** 主下载按钮：需要参数确认时弹框 */
  const onDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const arg = downloadOne(data)
    if (arg != null) {
      setArgDraft(arg)
      setConfirmBox({ kind: "m3u8dl", text: arg })
    }
  }

  /**
   * 下载中/已暂停状态：下载按钮点击 = 暂停/继续对应的 m3u8 下载任务
   * （向所有扩展页面广播，下载页按 requestId 匹配任务执行）
   */
  const onTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation()
    sendMessage({ Message: "m3u8TogglePause", requestId: data.requestId })
  }

  /** 外部调用按钮 */
  const onInvoke = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = invokeExternal(data)
    if (url != null) {
      setArgDraft(url)
      setConfirmBox({ kind: "invoke", text: url })
    }
  }

  /** 确认参数弹框：确定后带编辑值执行 */
  const onConfirm = () => {
    if (confirmBox!.kind === "m3u8dl") {
      downloadOne(data, true, argDraft)
    } else {
      invokeExternal(data, true, argDraft)
    }
    setConfirmBox(null)
  }

  /** 复制链接 */
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(copyLink(data))
    showTips(i18n.copiedToClipboard)
  }

  /** Aria2 RPC 发送 */
  const onAria2 = (e: React.MouseEvent) => {
    e.stopPropagation()
    aria2AddUri(
      data,
      (res: any) => showTips(i18n.hasSent + JSON.stringify(res), 2000),
      () => {
        showTips(i18n.sendFailed, 2000)
      }
    )
  }

  /** 猫抓下载器 */
  const onCatDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    catDownload(data)
  }
  const onCatDownFFmpeg = (e: React.MouseEvent) => {
    e.stopPropagation()
    catDownload(data, { ffmpeg: "addFile" })
  }

  /** 解析（m3u8/mpd/json） */
  const onParsing = (e: React.MouseEvent) => {
    e.stopPropagation()
    openParser(data)
  }

  /** 预览播放：有外部播放器走外部，否则行内播放 */
  const onPlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isEmpty(G.Player)) {
      if (!data.expanded) { toggleExpand(data.requestId, isCurrent) }
      setTimeout(() => previewRef.current?.play(), 50)
      return
    }
    openExternalPlayer(data)
  }

  /** 发送到本地 */
  const onSend2Local = (e: React.MouseEvent) => {
    e.stopPropagation()
    send2local("catch", data, data.tabId)
      .then((success: any) => {
        if (success?.ok) { showTips(i18n.hasSent, 1000) }
      })
      .catch((error: string) => showTips(error || i18n.sendFailed, 1000))
  }

  /** MQTT 发送（防重复点击） */
  const onMqtt = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (mqttSending) { return }
    setMqttSending(true)
    showTips(i18n.sendingToMQTT || "Sending to MQTT server...", 2000)
    sendToMQTT(data)
      .then(() => showTips(i18n.messageSentToMQTT || "Message sent", 2000))
      .catch((error: any) => {
        showTips(error ? String(error) : i18n.sendFailed, 10000)
      })
      .finally(() => setMqttSending(false))
  }

  /** 删除该条资源（前端列表 + background 缓存同时清除） */
  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeMedia(data.requestId, isCurrent)
    showTips(i18n.deleted || "已删除", 1000)
  }

  /** 点击行体：展开/折叠（按钮区域除外） */
  const onHeadingClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest(".nameEditBtn, .namePickBtn, .deleteBtn, .download, .DownCheck, .favicon")
    ) {
      return
    }
    toggleExpand(data.requestId, isCurrent)
  }

  const faviconUrl = data.favIconUrl || favicon.get(data.webUrl || "")
  const bold = data.parsing || data.isRegex || data.tabId == -1

  /** 本条资源的下载进度状态（m3u8/下载器/MPD 广播；普通浏览器下载无进度广播） */
  const dlState = progress.get(data.requestId)
  /** 下载中状态徽章文案：merging/saving/complete/error 显示文字，下载中显示百分比 */
  const dlBadge = (() => {
    if (!dlState) { return null }
    if (dlState.phase === "paused") { return i18n.paused || "已暂停" }
    if (dlState.phase === "merging") { return i18n.merging || "合并中" }
    if (dlState.phase === "saving") { return i18n.saving || "保存中" }
    if (dlState.phase === "complete") { return i18n.downloadComplete || "下载完成" }
    if (dlState.errors?.length && dlState.percent !== 100) {
      return `${i18n.downloadFailed || "下载失败"}:${dlState.errors.length}`
    }
    return `${dlState.percent ?? 0}%`
  })()

  return (
    <div
      className={
        "panel"
        + (dlState ? ` dl dl-${dlState.phase || "downloading"}` : "")
        + (dlState?.errors?.length && dlState.percent !== 100 ? " dl-error" : "")
        + ((data as any).state === "error" ? " dl-error" : "")
      }
      data-ext={(data.ext || "").toLowerCase()}
      style={
        dlState
          ? { ...(data.hidden ? { display: "none" } : null), "--dlp": `${dlState.percent ?? 0}%` }
          : data.hidden ? { display: "none" } : undefined
      }
    >
      <div className="panel-heading" onClick={onHeadingClick}>
        <input
          type="checkbox"
          className="DownCheck"
          checked={!!data.checked}
          disabled={data.state === "downloading" || data.state === "merging"}
          onChange={() => toggleCheck(data.requestId, isCurrent)}
          onClick={e => e.stopPropagation()}
        />
        {G.ShowWebIco && (
          <img
            className={"favicon" + (faviconUrl ? "" : " faviconFlag")}
            src={faviconUrl}
            alt=""
          />
        )}
        <img
          src="assets/img/regex.png"
          className={"favicon regex" + (data.isRegex ? "" : " hide")}
          title={i18n.regexTitle}
          alt=""
        />
        {editing ? (
          <span
            ref={nameEditRef}
            className="name nameEdit editing"
            contentEditable
            suppressContentEditableWarning
            title={i18n.editTitle || "标题"}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault()
                finishEdit(true)
              }
              if (e.key === "Escape") {
                finishEdit(false)
              }
            }}
          />
        ) : (
          <span
            className={"name nameEdit" + (bold ? " bold" : "")}
            title={i18n.editTitle || "标题"}
          >
            {displayName}
          </span>
        )}
        {/* 下载状态徽章：下载中显示百分比，合并/保存/完成/失败显示文字 */}
        {dlBadge && (
          <span className={`dlBadge ${dlState.phase || ""}${dlState.errors?.length && dlState.percent !== 100 ? " err" : ""}`}>
            {dlBadge}
          </span>
        )}
        <span className={"size" + (data.size ? "" : " hide")}>{data.size}</span>
        {/* 下载按钮三态：下载中=暂停、已暂停=继续、其余=发起下载 */}
        {dlState?.phase === "downloading" ? (
          <span
            className="icon download pauseBtn"
            title={i18n.pauseDownload}
            onClick={onTogglePause}
          >
            ⏸
          </span>
        ) : dlState?.phase === "paused" ? (
          <span
            className="icon download resumeBtn"
            title={i18n.resumeDownload}
            onClick={onTogglePause}
          >
            ▶
          </span>
        ) : (
          <img
            src="assets/img/download.svg"
            className="icon download"
            title={i18n.download}
            onClick={onDownload}
            alt=""
          />
        )}
        <span
          className={"rowBtn nameEditBtn" + (editing ? " editing" : "")}
          title={editing ? "点击保存" : i18n.editTitle || "编辑标题"}
          onClick={onEditClick}
        >
          ✎
        </span>
        <span
          className={"rowBtn namePickBtn" + (picking ? " picking" : "")}
          title={picking ? "再次点击可取消 · 请在页面上点击要作为标题的元素" : "从页面选取标题"}
          onClick={onPickClick}
        >
          📍
        </span>
        <span
          className="rowBtn deleteBtn"
          title={i18n.delete || "删除"}
          onClick={onRemove}
        >
          ✕
        </span>
        <span className="exportToggle" title={i18n.moreFeatures || "More features"}>
          ⋯
        </span>
      </div>

      <div className={"url" + (data.expanded ? "" : " hide")}>
        <div className="exportGrid">
          <button type="button" className="eg" id="copy" title={i18n.copy} onClick={onCopy}>
            {i18n.copy}
          </button>
          <button
            type="button"
            className={"eg parsing" + (data.parsing ? "" : " hide")}
            id="parsing"
            data-type={data.parsing}
            title={i18n.parser}
            onClick={onParsing}
          >
            {i18n.parser}
          </button>
          <button
            type="button"
            className={"eg" + (data.isPlay ? "" : " hide")}
            id="play"
            title={i18n.preview}
            onClick={onPlay}
          >
            {i18n.preview}
          </button>
          <button
            type="button"
            className={"eg" + (G.enableAria2Rpc ? "" : " hide")}
            id="aria2"
            title="Aria2 RPC"
            onClick={onAria2}
          >
            Aria2 RPC
          </button>
          <button type="button" className="eg" id="catDown" title={i18n.downloadWithRequestHeader} onClick={onCatDown}>
            {i18n.downloadWithRequestHeader}
          </button>
          <button type="button" className="eg" id="catDownFFmpeg" title={i18n.sendFfmpeg} onClick={onCatDownFFmpeg}>
            {i18n.sendFfmpeg}
          </button>
          <button
            type="button"
            className={"eg invoke" + (G.invoke ? "" : " hide")}
            id="invoke"
            title={i18n.invoke}
            onClick={onInvoke}
          >
            {i18n.invoke}
          </button>
          <button
            type="button"
            className={"eg" + (G.send2localManual || G.send2local ? "" : " hide")}
            id="send2local"
            title={i18n.send2local}
            onClick={onSend2Local}
          >
            {i18n.send2local}
          </button>
          <button
            type="button"
            className={"eg" + (G.mqttEnable ? "" : " hide")}
            id="mqtt"
            title={i18n.send2MQTT}
            disabled={mqttSending}
            onClick={onMqtt}
          >
            {i18n.send2MQTT}
          </button>
          <div
            className="eg egQr"
            id="qrcode"
            title="QR Code"
            onClick={e => {
              e.stopPropagation()
              setShowQr(v => !v)
            }}
          >
            {showQr ? (
              <QRCodeCanvas
                value={data.url}
                size={data.url.length >= 300 ? 400 : 256}
              />
            ) : (
              "QR Code"
            )}
          </div>
        </div>

        <div id="mediaInfo" data-state={data.expanded ? "true" : "false"}>
          {data._title && data._title !== "NULL" && (
            <>
              <b>{i18n.title}:</b> {data.title}
            </>
          )}
          {data.type && (
            <>
              <br />
              <b>MIME:</b> {data.type}
            </>
          )}
          {mediaMeta.noAudio && (
            <>
              <br />
              <b>{i18n.noAudio}</b>
            </>
          )}
          {mediaMeta.noVideo && (
            <>
              <br />
              <b>{i18n.noVideo}</b>
            </>
          )}
          {mediaMeta.playlist && (
            <>
              <br />
              <b>{i18n.m3u8Playlist}</b>
            </>
          )}
          {mediaMeta.duration ? (
            <>
              <br />
              <b>{i18n.duration}:</b> {secToTime(mediaMeta.duration)}
            </>
          ) : null}
          {mediaMeta.resolution ? (
            <>
              <br />
              <b>{i18n.resolution}:</b> {mediaMeta.resolution}
            </>
          ) : null}
        </div>
        <a href={data.url} target="_blank" rel="noreferrer" download={data.downFileName}>
          {data.url}
        </a>
        <br />
        {everExpanded && (
          <InlinePreview
            ref={previewRef}
            data={data}
            active={data.expanded}
            onMeta={m => setMediaMeta(prev => ({ ...prev, ...m }))}
          />
        )}
      </div>

      {confirmBox && (
        <div className="confirm">
          <textarea
            className="width100"
            rows={10}
            value={argDraft}
            onChange={e => setArgDraft(e.target.value)}
          />
          <button className="button2" onClick={onConfirm}>
            {i18n.confirm}
          </button>
          <button className="button2" onClick={() => setConfirmBox(null)}>
            {i18n.close}
          </button>
        </div>
      )}
    </div>
  )
}
