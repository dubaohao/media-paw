// @ts-nocheck
/**
 * 视频/图片预览浮层（迁移自 .play-container / .image-container）
 * 使用 Hls.js 处理 m3u8 播放
 */
import React, { useEffect, useRef } from "react"
import Hls from "hls.js"
import { i18n } from "~lib/init"
import { isM3U8 } from "~components/shared/format"
import { usePreviewStore } from "~components/tabs/preview/store"
import s from "../../preview.module.css"

/** 视频/图片预览浮层组件 */
export function VideoPreview() {
  const store = usePreviewStore()
  const { previewState, closePreview } = store
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  /** 播放视频或显示图片 */
  useEffect(() => {
    if (!previewState.item) return
    // 关闭上次播放
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (!video) return

    if (previewState.type === "video") {
      const item = previewState.item
      if (isM3U8(item)) {
        // m3u8 使用 Hls.js 播放
        if (!Hls.isSupported()) {
          video.src = item.url
        } else {
          const hls = new Hls({ enableWorker: false })
          hlsRef.current = hls
          hls.loadSource(item.url)
          hls.attachMedia(video)
          hls.on(Hls.Events.ERROR, () => {
            hls.stopLoad()
            hls.destroy()
            hlsRef.current = null
          })
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            video.play()
          })
        }
      } else {
        video.src = item.url
        video.play()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewState.item, previewState.type])

  /** 组件卸载时销毁 Hls 实例 */
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [])

  if (!previewState.type) return null

  /** 点击非视频/图片区域关闭预览 */
  const onContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("video, img")) return
    closePreview()
  }

  return (
    <>
      {/* 视频播放容器 */}
      {previewState.type === "video" && (
        <div
          className={`${s["play-container"]} ${s["preview-container"]}`}
          onClick={onContainerClick}
        >
          <video
            ref={videoRef}
            controls
            className={s["video-player"]}
          />
        </div>
      )}
      {/* 图片预览容器 */}
      {previewState.type === "image" && (
        <div
          className={`${s["image-container"]} ${s["preview-container"]}`}
          onClick={onContainerClick}
        >
          <img src={previewState.item?.url || ""} className={s["image-player"]} alt="" />
        </div>
      )}
    </>
  )
}
