/**
 * 资源下载与导出操作（迁移自 popup.js / pupup-utils.js 的操作函数）
 * 包含：普通下载、m3u8dl 外部程序、猫抓下载器、Aria2、MQTT、send2local、外部播放器/调用程序
 */
// @ts-nocheck
import mqtt from "mqtt"
import { G } from "~lib/init"
import {
  templates,
  send2local,
  trimData,
  openParser
} from "~lib/function"
import type { MediaResource } from "./types"
import { base64Encode, isM3U8, isMPD } from "./format"
import { sendMessage } from "./api"
import { showTips } from "./toast-bus"
import { i18n } from "~lib/init"

/** 普通下载 id → 资源的映射表（onChanged 回调使用，由 store 注册） */
export const downloadIdMap = new Map<number, MediaResource>()

/**
 * Aria2 RPC 推送一条资源
 */
export function aria2AddUri(
  data: MediaResource,
  success?: (data: any) => void,
  error?: (msg: string) => void
): void {
  const json: any = {
    jsonrpc: "2.0",
    id: "cat-catch-" + data.requestId,
    method: "aria2.addUri",
    params: []
  }
  if (G.aria2RpcToken) {
    json.params.push(`token:${G.aria2RpcToken}`)
  }
  const params: any = { out: data.downFileName }
  if (G.enableAria2RpcReferer) {
    params.header = []
    params.header.push("User-Agent: " + (G.userAgent ? G.userAgent : navigator.userAgent))
    if (data.requestHeaders?.referer) {
      params.header.push("Referer: " + data.requestHeaders.referer)
    }
    if (data.cookie) {
      params.header.push("Cookie: " + data.cookie)
    }
    if (data.requestHeaders?.authorization) {
      params.header.push("Authorization: " + data.requestHeaders.authorization)
    }
  }
  json.params.push([data.url], params)
  fetch(G.aria2Rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(json)
  })
    .then(response => response.json())
    .then(result => success && success(result))
    .catch(errMsg => error && error(errMsg))
}

/**
 * 发送资源到 MQTT 服务器
 */
export function sendToMQTT(data: MediaResource): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!G.mqttEnable) {
      reject(new Error("MQTT is not enabled"))
      return
    }
    const titleLength = G.mqttTitleLength || 100
    const payload: any = { ...data }
    payload.title = (payload.title || "").slice(0, titleLength)
    payload.action = "media_found"
    trimData(payload)

    try {
      const protocol = G.mqttProtocol
      const broker = G.mqttBroker
      const port = G.mqttPort
      const path = G.mqttPath
      if (!protocol || !broker || !port || !path) {
        throw new Error("MQTT connection parameters are missing")
      }
      const mqttUrl = `${protocol}://${broker}:${port}${path}`
      const options: any = {
        clientId: `${G.mqttClientId || "cat-catch-client"}-${Math.random().toString(16).slice(2)}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 0
      }
      if (G.mqttUser) { options.username = G.mqttUser }
      if (G.mqttPassword) { options.password = G.mqttPassword }

      showTips(i18n.connectingToMQTT || "Connecting to MQTT server...", 2000)
      const client = mqtt.connect(mqttUrl, options)

      client.on("connect", () => {
        const topic = G.mqttTopic || "cat-catch/media"
        const qos = parseInt(G.mqttQos) || 2
        let message: string
        if (G.mqttDataFormat?.trim()) {
          message = templates(G.mqttDataFormat, payload)
        } else {
          message = JSON.stringify(payload)
        }
        showTips(i18n.sendingMessageToMQTT || "Sending message to MQTT server...", 2000)
        client.publish(topic, message, { qos }, err => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
      client.on("error", err => reject(err))
      setTimeout(() => {
        if (!client.connected) {
          client.end()
          reject(new Error("MQTT connection timeout"))
        }
      }, 6000)
    } catch (err: any) {
      reject(err)
    }
  })
}

/** 发送单条资源到本地（send2local） */
export function sendResourceLocal(data: MediaResource): void {
  send2local("catch", data, data.tabId)
    .then((success: any) => {
      if (success?.ok) { showTips(i18n.hasSent, 1000) }
    })
    .catch((error: string) => {
      showTips(error || i18n.sendFailed, 1000)
    })
}

/**
 * 计算 m3u8dl 参数文本（供确认框展示）
 */
export function buildM3u8dlArg(data: MediaResource): string {
  return data.m3u8dlArg ?? templates(G.m3u8dlArg, data)
}

/**
 * 单条资源的主下载按钮逻辑（对应原版 #download click）
 * @param confirmed 外部程序参数是否已由确认框确认
 * @param argOverride 确认框中用户编辑过的参数
 * @returns 需要弹确认框时返回参数文本，否则返回 null
 */
export function downloadOne(
  data: MediaResource,
  confirmed = false,
  argOverride?: string
): string | null {
  // m3u8dl 外部程序（需要参数确认时先返回参数给 UI）
  if (G.m3u8dl && (isM3U8(data) || isMPD(data)) && !data.url.startsWith("blob:")) {
    const m3u8dlArg = argOverride ?? data.m3u8dlArg ?? templates(G.m3u8dlArg, data)
    if (G.m3u8dlConfirm && !confirmed) {
      return m3u8dlArg
    }
    const url = "m3u8dl:" + (G.m3u8dl == 1 ? base64Encode(m3u8dlArg) : m3u8dlArg)
    if (url.length >= 2046) {
      navigator.clipboard.writeText(m3u8dlArg)
      showTips(i18n.M3U8DLparameterLong, 2000)
      return null
    }
    if (G.isFirefox) {
      window.location.href = url
    } else {
      chrome.tabs.update({ url })
    }
    return null
  }
  if (G.m3u8dl && (isM3U8(data) || isMPD(data)) && data.url.startsWith("blob:")) {
    showTips(i18n.blobM3u8DLError, 1500)
    return null
  }
  // m3u8 自动解析下载
  if (G.m3u8AutoDown && data.parsing == "m3u8") {
    openParser(data, { autoDown: true })
    return null
  }
  // 浏览器普通下载
  chrome.downloads.download(
    { url: data.url, filename: data.downFileName, saveAs: G.saveAs },
    id => {
      if (id != null) { downloadIdMap.set(id, data) }
    }
  )
  return null
}

/**
 * 调用外部程序（invoke 模板）
 * @returns 需要确认时返回 URL 文本，否则返回 null
 */
export function invokeExternal(
  data: MediaResource,
  confirmed = false,
  argOverride?: string
): string | null {
  const url = argOverride ?? data.invoke ?? templates(G.invokeText, data)
  if (G.invokeConfirm && !confirmed) {
    return url
  }
  if (G.isFirefox) {
    window.location.href = url
  } else {
    chrome.tabs.update({ url })
  }
  return null
}

/**
 * 批量下载选中资源（对应原版 #DownFile click）
 */
export function downloadChecked(list: MediaResource[]): void {
  if (G.enableAria2Rpc) {
    showTips(i18n.hasSent, 2000)
    list.forEach(data => aria2AddUri(data))
    return
  }
  let index = 0
  for (const data of list) {
    if (
      G.m3u8dl &&
      (data.parsing == "m3u8" || data.parsing == "mpd") &&
      !data.url.startsWith("blob:")
    ) {
      const m3u8dlArg = templates(G.m3u8dlArg, data)
      const url = "m3u8dl:" + (G.m3u8dl == 1 ? base64Encode(m3u8dlArg) : m3u8dlArg)
      chrome.tabs.create({ url })
      continue
    }
    if (G.m3u8AutoDown && data.parsing == "m3u8") {
      openParser(data, { autoDown: true, autoClose: true })
      continue
    }
    G.downActive = true
    index++
    const item = data
    setTimeout(() => {
      chrome.downloads.download(
        { url: item.url, filename: item.downFileName },
        id => {
          if (id != null) { downloadIdMap.set(id, item) }
        }
      )
    }, index * 100)
  }
}

/** 合并下载：全部 m3u8 走解析页合并，否则走猫抓下载器 */
export function mergeDownload(list: MediaResource[]): void {
  const taskId = Date.parse(new Date())
  if (list.every(data => isM3U8(data))) {
    list.forEach(data => {
      openParser(data, {
        ffmpeg: "merge",
        quantity: list.length,
        taskId,
        autoDown: true,
        autoClose: true
      })
    })
    return
  }
  catDownload(list, { ffmpeg: "merge" })
}

let catDownloadIsProcessing = false
/**
 * 猫抓下载器（带头下载/合并）：优先发给已打开的 downloader.html，否则后台新开
 */
export function catDownload(data: MediaResource | MediaResource[], extra: any = {}): void {
  if (catDownloadIsProcessing) {
    setTimeout(() => catDownload(data, extra), 233)
    return
  }
  catDownloadIsProcessing = true
  const list = Array.isArray(data) ? data : [data]
  localStorage.setItem("downloadData", JSON.stringify(list))

  // 大于 2G 询问流式下载（保留原版行为）
  if (
    !extra.ffmpeg &&
    !G.downStream &&
    Math.max(...list.map(item => item._size ?? 0)) > G.chromeLimitSize &&
    confirm(i18n("fileTooLargeStream", ["2G"]))
  ) {
    extra.downStream = 1
  }

  sendMessage({ Message: "catDownload", data: list }).then(message => {
    if (!message || message.message != "OK") {
      createCatDownload(list, extra)
      return
    }
    catDownloadIsProcessing = false
  })
}

/** 后台新开 downloader.html 下载页 */
function createCatDownload(data: MediaResource[], extra: any): void {
  chrome.tabs.get(G.tabId, tab => {
    const arg = {
      url:
        "/tabs/downloader.html?" +
        new URLSearchParams({
          requestId: data.map(item => item.requestId).join(","),
          ...extra
        }).toString(),
      index: tab.index + 1,
      active: false
    }
    chrome.tabs.create(arg, created => {
      const interval = setInterval(() => {
        chrome.tabs.get(created.id, t => {
          if (chrome.runtime.lastError || t.status == "complete") {
            clearInterval(interval)
            catDownloadIsProcessing = false
          }
        })
      }, 500)
    })
  })
}

/** 使用外部播放器播放（未配置时返回 false，由行内预览处理） */
export function openExternalPlayer(data: MediaResource): boolean {
  if (!G.Player) { return false }
  if (G.Player == "$shareApi$" || G.Player == "${shareApi}") {
    navigator.share({ url: data.url })
    return true
  }
  const url = templates(G.Player, data)
  if (G.isFirefox) {
    window.location.href = url
  } else {
    chrome.tabs.update({ url })
  }
  return true
}
