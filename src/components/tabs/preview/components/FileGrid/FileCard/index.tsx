// @ts-nocheck
/**
 * 单个文件卡片（迁移自 FilePreview.createFileElement）
 * 包含缩略图/预览、勾选框、文件信息、操作图标
 */
import React, { useEffect, useRef, useState } from "react"
import { G, i18n } from "~lib/init"
import { byteToSize, secToTime } from "~lib/function"
import {
  isM3U8,
  isPicture,
  isMedia,
  isMediaExt
} from "~components/shared/format"
import { usePreviewStore } from "~components/tabs/preview/store"
import s from "../../../preview.module.css"

interface FileCardProps {
  item: any
  index: number
}

/** 单个文件卡片组件 */
export function FileCard({ item, index }: FileCardProps) {
  const store = usePreviewStore()
  const {
    filters,
    selectedItems,
    toggleSelect,
    openPreview,
    downloadOne,
    copyOne,
    deleteOne,
    aria2One,
    sendOne,
    mqttOne,
    invokeOne,
    openM3U8
  } = store

  const videoRef = useRef<HTMLVideoElement>(null)
  const [info, setInfo] = useState({
    width: 0,
    height: 0,
    duration: 0
  })

  const isImg = isPicture(item)
  const isM3U8Item = isM3U8(item)
  const isAudio =
    item.type?.startsWith("audio/") ||
    ["mp3", "wav", "m4a", "aac", "ogg"].includes(item.ext)
  const isVideoItem =
    (isMedia(item) || isMediaExt(item.ext)) && !isM3U8Item && !isAudio
  const selected = selectedItems.has(item.requestId)

  /** 图片加载完成后获取尺寸 */
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement
    if (img.naturalWidth) {
      setInfo(prev => ({
        ...prev,
        width: img.naturalWidth,
        height: img.naturalHeight
      }))
    }
  }

  /** 视频元数据加载完成后获取尺寸和时长 */
  const onVideoLoadedMetadata = () => {
    const v = videoRef.current
    if (!v) return
    setInfo({
      width: v.videoWidth || 0,
      height: v.videoHeight || 0,
      duration: v.duration && v.duration !== Infinity ? v.duration : 0
    })
  }

  /** 鼠标悬停播放视频预览 */
  const onMouseEnter = () => {
    const v = videoRef.current
    if (v) v.play()
  }

  /** 鼠标离开暂停视频预览 */
  const onMouseLeave = () => {
    const v = videoRef.current
    if (v) v.pause()
  }

  /** 卡片点击：勾选/取消勾选（点击图标不触发） */
  const onCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest(".icon")) return
    toggleSelect(item.requestId)
  }

  /** 构建文件信息文本 */
  const fileInfo = (() => {
    let text = item.ext || ""
    if (item._size && item._size >= 1024) {
      text += ` / ${byteToSize(item._size)}`
    }
    if (info.width && info.height) {
      text += ` / ${info.width}*${info.height}`
    }
    if (info.duration) {
      text += ` / ${secToTime(info.duration)}`
    }
    return text
  })()

  return (
    <div
      className={`${s["file-item"]} ${selected ? s.selected : ""}`}
      data-index={index}
      onClick={onCardClick}
    >
      {/* 标题 */}
      <div className={`${s["file-title"]} ${filters.showTitle ? "" : "hide"}`}>
        {item.title}
      </div>
      {/* 文件名 */}
      <div className={s["file-name"]}>{item.name}</div>
      {/* 预览容器 */}
      <div className={`${s["preview-container"]} ${isVideoItem ? s["video-preview"] : ""}`}>
        {isImg && (
          <img
            src={item.url}
            className="preview-image icon"
            alt=""
            onLoad={onImageLoad}
            onClick={e => {
              e.stopPropagation()
              openPreview(item)
            }}
          />
        )}
        {isVideoItem && (
          <video
            ref={videoRef}
            src={item.url}
            muted
            playsInline
            loop
            preload="metadata"
            onLoadedMetadata={onVideoLoadedMetadata}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onClick={e => {
              e.stopPropagation()
              openPreview(item)
            }}
          />
        )}
        {isAudio && (
          <img
            src="assets/img/music.svg"
            className="preview-music icon"
            alt=""
            onClick={e => {
              e.stopPropagation()
              openPreview(item)
            }}
          />
        )}
        {isM3U8Item && (
          <img
            src="assets/img/parsing.png"
            className="icon"
            alt=""
            title={i18n.parser}
            onClick={e => {
              e.stopPropagation()
              openPreview(item)
            }}
          />
        )}
        {!isImg && !isVideoItem && !isAudio && !isM3U8Item && (
          <img
            src={item.favIconUrl || "assets/img/icon.png"}
            className="preview-image icon"
            alt=""
          />
        )}
      </div>
      {/* 底部信息行 */}
      <div className={s["bottom-row"]}>
        <img
          src="assets/img/regex.png"
          className={item.isRegex ? "" : "hide"}
          title={i18n.regexTitle}
          style={{ width: 23 }}
          alt=""
        />
        <div className={s["file-info"]}>{fileInfo}</div>
      </div>
      {/* 操作图标 */}
      <div className={s.actions}>
        <img
          src="assets/img/copy.png"
          className="icon copy"
          title={i18n.copy}
          onClick={() => copyOne(item)}
          alt=""
        />
        <img
          src="assets/img/delete.svg"
          className="icon delete"
          title={i18n.delete}
          onClick={() => deleteOne(item)}
          alt=""
        />
        <img
          src="assets/img/download.svg"
          className="icon download"
          title={i18n.download}
          onClick={() => downloadOne(item)}
          alt=""
        />
        {G.mqttEnable && (
          <img
            src="assets/img/mqtt.svg"
            className="icon mqtt"
            title={i18n.send2MQTT}
            onClick={() => mqttOne(item)}
            alt=""
          />
        )}
        {isM3U8Item && (
          <img
            src="assets/img/parsing.png"
            className="icon m3u8"
            title={i18n.parser}
            onClick={() => openM3U8(item)}
            alt=""
          />
        )}
        {G.enableAria2Rpc && (
          <img
            src="assets/img/aria2.png"
            className="icon aria2"
            title="aria2"
            onClick={() => aria2One(item)}
            alt=""
          />
        )}
        {G.invoke && (
          <img
            src="assets/img/invoke.svg"
            className="icon invoke"
            title={i18n.invoke}
            onClick={() => invokeOne(item)}
            alt=""
          />
        )}
        {G.send2localManual && (
          <img
            src="assets/img/send.svg"
            className="icon send"
            title={i18n.send2local}
            onClick={() => sendOne(item)}
            alt=""
          />
        )}
      </div>
    </div>
  )
}
