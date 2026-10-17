/**
 * 资源展开区的行内预览：m3u8 走 hls.js，普通媒体走 video，图片走 img
 * 媒体附加信息通过 onMeta 回调上抛（时长/分辨率/音轨/码率）
 */
// @ts-nocheck
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react"
import Hls from "hls.js"
import { setRequestHeaders } from "~lib/function"
import { isM3U8, isPicture } from "./format"
import type { MediaResource } from "./types"

export interface PreviewHandle {
  /** 触发播放（展开后由「预览」按钮调用） */
  play: () => void
}

interface Props {
  data: MediaResource
  /** 是否处于展开状态（折叠时暂停播放） */
  active: boolean
  /** 附加媒体信息回调 */
  onMeta?: (meta: {
    noAudio?: boolean
    noVideo?: boolean
    playlist?: boolean
    duration?: number
    resolution?: string
  }) => void
}

/** 行内预览元素（img#screenshots + video#preview），挂载后常驻 */
export const InlinePreview = forwardRef<PreviewHandle, Props>(
  function InlinePreview({ data, active, onMeta }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const imgRef = useRef<HTMLImageElement>(null)
    const hlsRef = useRef<Hls | null>(null)
    const [showVideo, setShowVideo] = useState(false)
    const [showImg, setShowImg] = useState(false)
    const wantPlayRef = useRef(false)

    useImperativeHandle(ref, () => ({
      play: () => {
        wantPlayRef.current = true
        setShowVideo(true)
        videoRef.current?.play().catch(() => {})
      }
    }))

    useEffect(() => {
      const video = videoRef.current
      if (!video) { return }
      let destroyed = false

      /** 挂载源（m3u8 用 hls.js，其余直接给 src） */
      const attach = () => {
        if (destroyed) { return }
        if (isM3U8(data)) {
          const hls = new Hls({ enableWorker: false })
          hlsRef.current = hls
          setRequestHeaders(data.requestHeaders, () => {
            if (destroyed) { return }
            hls.loadSource(data.url)
            hls.attachMedia(video)
          })
          hls.on(Hls.Events.BUFFER_CREATED, (_e: any, d: any) => {
            if (d.tracks && !d.tracks.audiovideo) {
              onMeta?.({ noAudio: !d.tracks.audio, noVideo: !d.tracks.video })
            }
          })
          hls.on(Hls.Events.ERROR, () => hls.stopLoad())
          hls.on(Hls.Events.MANIFEST_PARSED, (_e: any, d: any) => {
            if (d.levels?.length > 1) { onMeta?.({ playlist: true }) }
          })
        } else if (data.isPlay) {
          setRequestHeaders(data.requestHeaders, () => {
            if (!destroyed) { video.src = data.url }
          })
        } else if (isPicture(data)) {
          setRequestHeaders(data.requestHeaders, () => {
            if (!destroyed && imgRef.current) {
              imgRef.current.src = data.url
              setShowImg(true)
            }
          })
        }
      }
      attach()

      /** 读取元数据后显示播放器并上抛时长/分辨率 */
      const onLoaded = function (this: HTMLVideoElement) {
        setShowVideo(true)
        const meta: any = {}
        if (this.duration && this.duration !== Infinity) {
          meta.duration = this.duration
        }
        if (this.videoHeight && this.videoWidth) {
          meta.resolution = `${this.videoWidth}x${this.videoHeight}`
        }
        onMeta?.(meta)
        if (wantPlayRef.current) { this.play().catch(() => {}) }
      }
      video.addEventListener("loadedmetadata", onLoaded)

      return () => {
        destroyed = true
        video.removeEventListener("loadedmetadata", onLoaded)
        hlsRef.current?.destroy()
        hlsRef.current = null
      }
      // 仅在首次展开时挂载一次（对应原版 mediaInfo data-state 单次初始化）
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 折叠时暂停播放
    useEffect(() => {
      if (!active && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause()
      }
    }, [active])

    return (
      <>
        <img
          ref={imgRef}
          id="screenshots"
          className={showImg ? "" : "hide"}
          alt="preview"
        />
        <video
          ref={videoRef}
          id="preview"
          className={showVideo ? "" : "hide"}
          controls
        />
      </>
    )
  }
)
