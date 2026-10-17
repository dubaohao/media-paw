/**
 * 资源类型判断与格式化工具（迁移自 js/pupup-utils.js）
 */
import type { MediaResource } from "./types"
import { G } from "~lib/init"
import { templates } from "~lib/function"

/** 判断是否 m3u8 资源 */
export function isM3U8(data: MediaResource): boolean {
  return (
    data.ext == "m3u8" ||
    data.ext == "m3u" ||
    data.type?.endsWith("/vnd.apple.mpegurl") ||
    data.type?.endsWith("/x-mpegurl") ||
    data.type?.endsWith("/mpegurl") ||
    data.type?.endsWith("/octet-stream-m3u8")
  )
}

/** 判断是否 MPD/DASH 资源 */
export function isMPD(data: MediaResource): boolean {
  return data.ext == "mpd" || data.type == "application/dash+xml"
}

/** 判断是否 JSON 资源 */
export function isJSON(data: MediaResource): boolean {
  return (
    data.ext == "json" ||
    data.type == "application/json" ||
    data.type == "text/json"
  )
}

/** 判断是否图片资源 */
export function isPicture(data: MediaResource): boolean {
  return (
    data.type?.startsWith("image/") ||
    ["jpg", "png", "jpeg", "bmp", "gif", "webp", "svg"].includes(
      data.ext ?? ""
    )
  )
}

/** 是否可直接播放的媒体扩展名 */
export function isMediaExt(ext?: string): boolean {
  return [
    "ogg", "ogv", "mp4", "webm", "mp3", "wav", "m4a",
    "3gp", "mpeg", "mov", "m4s", "aac"
  ].includes(ext ?? "")
}

/** 判断是否媒体资源 */
export function isMedia(data: MediaResource): boolean {
  return (
    isMediaExt(data.ext) ||
    data.type?.startsWith("video/") ||
    data.type?.startsWith("audio/")
  )
}

/** 判断资源是否可在弹出面板内预览播放 */
export function isPlayable(data: MediaResource): boolean {
  if (G.Player && !isJSON(data) && !isPicture(data)) {
    return true
  }
  const typeArray = [
    "video/ogg", "video/mp4", "video/webm", "audio/ogg", "audio/mp3",
    "audio/wav", "audio/m4a", "video/3gp", "video/mpeg", "video/mov"
  ]
  return isMediaExt(data.ext) || typeArray.includes(data.type ?? "") || isM3U8(data)
}

/** 按配置模板生成复制链接文本 */
export function copyLink(data: MediaResource): string {
  let text: string
  if (data.parsing == "m3u8") {
    text = G.copyM3U8
  } else if (data.parsing == "mpd") {
    text = G.copyMPD
  } else {
    text = G.copyOther
  }
  return templates(text, data)
}

/** Base64 字符串转 Hex（迁移自 popup.js base64ToHex），非法返回 false */
export function base64ToHex(base64: string): string | false {
  let binaryString: string
  try {
    binaryString = atob(base64)
  } catch {
    return false
  }
  let hexString = ""
  for (let i = 0; i < binaryString.length; i++) {
    let hex = binaryString.charCodeAt(i).toString(16)
    if (hex.length === 1) {
      hex = "0" + hex
    }
    hexString += hex
  }
  return hexString
}

/** UTF-8 安全的 Base64 编码（替代 lib/base64.js 的 Base64.encode） */
export function base64Encode(str: string): string {
  const data = new TextEncoder().encode(str)
  let binary = ""
  data.forEach(byte => (binary += String.fromCharCode(byte)))
  return btoa(binary)
}
