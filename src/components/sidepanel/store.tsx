/**
 * Popup 全局数据 store：资源列表/下载进度/筛选/密钥/按钮状态
 * 迁移自 popup.js 的 allData/downProgress/filterExt 及相关操作函数
 */
// @ts-nocheck
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { G, i18n } from "~lib/init"
import {
  byteToSize,
  filterFileName,
  isEmpty,
  stringModify,
  templates
} from "~lib/function"
import type { MediaResource, ProgressState } from "./types"
import {
  isJSON,
  isM3U8,
  isMPD,
  isPicture,
  isPlayable
} from "./format"
import { sendMessage, tabSendMessage } from "./api"
import { catDownload, downloadIdMap } from "./actions"
import { showTips } from "./toast-bus"

interface StoreValue {
  ready: boolean
  sideMode: boolean
  current: Map<string, MediaResource>
  other: Map<string, MediaResource>
  otherLoaded: boolean
  loadOther: () => void
  refreshCurrent: () => void
  keys: { key: string; hex: string }[]
  progress: Map<string, ProgressState>
  favicon: Map<string, string>
  filterExt: Map<string, boolean>
  toggleExt: (ext: string) => void
  setRegex: (text: string) => void
  regex: string
  dedupe: () => void
  clearFilter: () => void
  checkboxState: boolean
  setCheckedAll: (checked: boolean | "invert") => void
  toggleCheck: (rid: string, group: boolean) => void
  toggleExpand: (rid: string, group: boolean) => void
  setExpandAll: (mode: "all" | "play" | "checked" | "fold") => void
  applyTitle: (rid: string, group: boolean, title: string) => void
  /** 获取全部勾选资源（当前页+其他页合并） */
  getChecked: () => MediaResource[]
  /** 清空当前页分组数据（脚本注入 autoClearMode 场景使用） */
  clearGroup: () => void
  /** 清空全部数据（当前页+其他页，同步清除 background 缓存） */
  clearAll: () => void
  /** 扩展名 solo 筛选：仅显示 targets 集合（null=恢复全部），作用于两组 */
  soloExts: (targets: string[] | null) => void
  /** 当前 solo 的目标扩展名集合（null=全部模式，由 soloExts/clearFilter 维护） */
  soloTargets: string[] | null
  /** 删除单条资源（前端列表 + background 缓存） */
  removeMedia: (rid: string, isCurrent: boolean) => void
  /** 删除已下载完成的资源（progress.phase === "complete"，作用于整个列表） */
  removeDownloaded: () => void
  blockedSite: boolean
  skipped: boolean
  buttonState: Record<string, boolean>
  updateButton: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

/** 当前标签页解析后的页面 DOM（供文件名模板 find() 使用，对应原版 pageDOM） */
let pageDOM: Document | null = null

/** 设置页面 DOM（popup 入口在 G.getHtmlDOM 开启时拉取） */
export function setPageDOM(dom: Document | null) {
  pageDOM = dom
}

/**
 * 判断两个页面 URL 是否属于同一个页面（同源 + 同路径，忽略 query/hash 差异）
 * force 刷新名称规则时只更新规则所在页面的资源，避免同 tab 导航后株连旧页面资源
 */
function samePageUrl(a?: string, b?: string): boolean {
  if (!a || !b) { return false }
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.origin === ub.origin && ua.pathname === ub.pathname
  } catch {
    return a === b
  }
}

/** 资源数据规范化：补齐标题/文件名/大小/解析类型等（迁移自 AddMedia 数据加工段） */
function normalize(data: MediaResource, checked: boolean): MediaResource {
  data._title = data.title
  data.title = stringModify(data.title)
  const rawTitle =
    data._title && data._title !== "NULL" ? data._title.trim() : ""
  if (rawTitle) {
    data.name = rawTitle + (data.ext ? "." + data.ext : "")
  } else if (!isEmpty(data.name)) {
    data.name = decodeURIComponent(data.name)
  } else {
    data.name = (data._title || "NULL") + "." + data.ext
  }
  const displayTitle = data.title
  data.title = data._title || displayTitle
  data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name
  data.title = displayTitle
  data.downFileName = filterFileName(data.downFileName)
  if (isEmpty(data.downFileName)) {
    data.downFileName = data.name
  }
  data._size = data.size
  if (data.size) {
    data.size = byteToSize(data.size)
  }
  data.parsing = false
  if (isM3U8(data)) {
    data.parsing = "m3u8"
  } else if (isMPD(data)) {
    data.parsing = "mpd"
  } else if (isJSON(data)) {
    data.parsing = "json"
  }
  data.isPlay = isPlayable(data)
  data.checked = checked
  data.expanded = false
  // 页面 DOM 通过 getter 暴露给文件名模板（find 选择器函数）
  Object.defineProperty(data, "pageDOM", {
    get() { return pageDOM },
    configurable: true,
    enumerable: false
  })
  return data
}

/** Store Provider，在 G 初始化完成后挂载数据逻辑 */
export function MediaStoreProvider(props: {
  tabId: number | null
  children: React.ReactNode
}) {
  const { tabId } = props
  const [current, setCurrent] = useState<Map<string, MediaResource>>(
    () => new Map()
  )
  const [other, setOther] = useState<Map<string, MediaResource>>(
    () => new Map()
  )
  const [otherLoaded, setOtherLoaded] = useState(false)
  const [keys, setKeys] = useState<{ key: string; hex: string }[]>([])
  const [progress, setProgress] = useState<Map<string, ProgressState>>(
    () => new Map()
  )
  const [favicon, setFavicon] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    return m
  })
  const [filterExt, setFilterExt] = useState<Map<string, boolean>>(
    () => new Map()
  )
  /** 当前 solo 的目标集合（null=全部模式），独立于 filterExt 推断，
   *  避免「只有一种扩展名且 solo 该类型」时 filterExt 无 false 项被误判为非 solo */
  const [soloTargets, setSoloTargets] = useState<string[] | null>(null)
  const [regex, setRegexState] = useState("")
  const [duplicateSet, setDuplicateSet] = useState<Set<string> | null>(null)
  const [checkboxState, setCheckboxState] = useState(true)
  const [blockedSite, setBlockedSite] = useState(false)
  const [skipped, setSkipped] = useState(false)

  /** 工作副本：事件回调中同步读写最新数据，避免 setState 异步链与 updater 副作用 */
  const currentWork = useRef<Map<string, MediaResource>>(new Map())
  const otherWork = useRef<Map<string, MediaResource>>(new Map())
  /** 提交新的当前页 Map（同时更新工作副本与渲染状态） */
  const commitCurrent = useCallback((next: Map<string, MediaResource>) => {
    currentWork.current = next
    setCurrent(next)
  }, [])
  /** 提交新的其他页 Map */
  const commitOther = useCallback((next: Map<string, MediaResource>) => {
    otherWork.current = next
    setOther(next)
  }, [])

  const currentRef = currentWork
  const otherRef = otherWork
  const filterRef = useRef(filterExt)
  filterRef.current = filterExt
  const duplicateRef = useRef(duplicateSet)
  duplicateRef.current = duplicateSet
  const regexRef = useRef(regex)
  regexRef.current = regex
  const checkboxRef = useRef(checkboxState)
  checkboxRef.current = checkboxState

  /** 按当前筛选条件计算资源是否隐藏 */
  const computeHidden = useCallback((data: MediaResource): boolean => {
    if (filterRef.current.get(data.ext) === false) { return true }
    if (duplicateRef.current?.has(data.name)) { return true }
    const re = regexRef.current
    if (re) {
      try {
        if (!new RegExp(re).test(data.url)) { return true }
      } catch {
        /* 非法正则忽略 */
      }
    }
    return false
  }, [])

  /**
   * 向工作副本写入一条资源（含 URL 去重），返回是否成功加入；不触发渲染
   */
  const writeMedia = useCallback(
    (
      raw: MediaResource,
      work: Map<string, MediaResource>
    ): MediaResource | null => {
      if (raw.url) {
        for (const item of work.values()) {
          if (item.url === raw.url) { return null }
        }
      }
      let rid = String(raw.requestId)
      if (work.has(rid)) {
        rid = rid + "_" + Date.now()
        raw.requestId = rid
      }
      const data = normalize(raw, checkboxRef.current)
      data.hidden = computeHidden(data)
      if (data.hidden) { data.checked = false }
      // 新资源插到列表最前（列表按 Map 插入序渲染）：新抓取的排在上面，老的往下沉
      const reordered = new Map<string, MediaResource>([[rid, data]])
      for (const [k, v] of work) { reordered.set(k, v) }
      work.clear()
      for (const [k, v] of reordered) { work.set(k, v) }
      // 网站图标
      if (data.favIconUrl && data.webUrl) {
        setFavicon(fm => {
          if (fm.has(data.webUrl!)) { return fm }
          const n = new Map(fm)
          n.set(data.webUrl!, data.favIconUrl!)
          return n
        })
      }
      // 扩展名筛选项
      if (data.ext && !filterRef.current.has(data.ext)) {
        setFilterExt(fm => {
          const n = new Map(fm)
          n.set(data.ext!, true)
          return n
        })
      }
      if (duplicateRef.current) {
        setDuplicateSet(ds => {
          const n = new Set(ds)
          n.add(data.name)
          return n
        })
      }
      return data
    },
    [computeHidden]
  )

  /** 添加单条资源并提交渲染（sidepanelAddData 实时推送） */
  const addMedia = useCallback(
    (raw: MediaResource, isCurrent: boolean): boolean => {
      const work = isCurrent ? currentWork.current : otherWork.current
      const next = new Map(work)
      const data = writeMedia(raw, next)
      if (!data) { return false }
      if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
      return true
    },
    [commitCurrent, commitOther, writeMedia]
  )

  /** 批量添加资源，仅一次提交渲染（初始加载/其他页懒加载） */
  const addMediaList = useCallback(
    (list: MediaResource[], isCurrent: boolean) => {
      const work = isCurrent ? currentWork.current : otherWork.current
      const next = new Map(work)
      let changed = false
      for (const raw of list) {
        if (writeMedia(raw, next)) { changed = true }
      }
      if (!changed) { return }
      if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
    },
    [commitCurrent, commitOther, writeMedia]
  )

  /**
   * 全量对账：以 background cacheData（storage.session 的 MediaData，唯一权威数据源）为准。
   * 触发时机：cacheDataReady 广播、storage.onChanged（background 每次 save 即一次全量推送）。
   * 补缺失资源（writeMedia 自带去重）；已有资源的标题/锁定字段以 background 为准重新规范化；
   * 保留本地交互状态（勾选/展开）；
   * key 消失检测：oldData 存在而 allData 中整体消失的 tab，同步删除本地该 tab 的全部资源
   * （清空/清理场景）；仅 key 整体消失才删，避免「超 99 条不持久化的不完整副本」误删本地资源；
   * 其余情况仍不删除本地多余项
   */
  const reconcileAll = useCallback((allData?: any, oldData?: any) => {
    /** 用全量数据对账当前页与其他页两个分组 */
    const applyAll = (all: any) => {
      if (!all) { return }
      /** 从 oldValue 对比 newValue 找出整体消失的 tab id 集合 */
      let vanished: Set<number> | null = null
      if (oldData) {
        for (const key of Object.keys(oldData)) {
          if (Array.isArray(oldData[key]) && !Array.isArray(all[key])) {
            (vanished ??= new Set()).add(Number(key))
          }
        }
      }
      /** 对单个分组执行对账，返回有变更时的新 Map */
      const mergeInto = (work: Map<string, MediaResource>, isCurrent: boolean) => {
        const next = new Map(work)
        let changed = false
        // 删除已消失 tab 的全部资源（Map 遍历中 delete 是安全的）
        if (vanished?.size) {
          for (const [rid, item] of next) {
            if (vanished.has(item.tabId)) {
              next.delete(rid)
              changed = true
            }
          }
        }
        for (const key of Object.keys(all)) {
          const list = all[key]
          if (!Array.isArray(list)) { continue }
          const belong = key == String(tabId)
          if (belong !== isCurrent) { continue }
          for (const raw of list) {
            if (!raw || raw.requestId == null) { continue }
            const rid = String(raw.requestId)
            const exist = next.get(rid)
            if (!exist) {
              if (writeMedia(raw, next)) { changed = true }
              continue
            }
            // 已有：标题或锁定状态以 background 为准（用户行内改名会先写回 background，不冲突）
            if (exist._title !== raw.title || !!exist.titleLocked !== !!raw.titleLocked) {
              const merged = normalize({ ...raw }, exist.checked ?? false)
              merged.checked = exist.checked
              merged.expanded = exist.expanded
              merged.hidden = computeHidden(merged)
              if (merged.hidden) { merged.checked = false }
              next.set(rid, merged)
              changed = true
            }
          }
        }
        return changed ? next : null
      }
      const nextCurrent = mergeInto(currentWork.current, true)
      if (nextCurrent) { commitCurrent(nextCurrent) }
      const nextOther = mergeInto(otherWork.current, false)
      if (nextOther) { commitOther(nextOther) }
    }
    if (allData) { applyAll(allData); return }
    sendMessage({ Message: "getAllData" }).then(applyAll)
  }, [tabId, writeMedia, computeHidden, commitCurrent, commitOther])

  /** 订阅 storage 的 MediaData 变更：background 每次 save 都是一次全量推送，
   *  所有 tab 的侧边栏实例同时对账，保证任意 tab 下看到的列表与唯一数据源一致 */
  useEffect(() => {
    const areaName = chrome.storage.session ? "session" : "local"
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== areaName || !changes.MediaData) { return }
      const keys = Object.keys(changes.MediaData.newValue ?? {})
      console.log(`[猫抓] 侧边栏收到 MediaData onChanged，tab 数=${keys.length}，本页 tabId=${tabId}，本页条数=${(changes.MediaData.newValue?.[tabId] ?? []).length}`)
      // 传 oldValue 供 key 消失检测：某 tab 数据整体被 background 清掉时同步删除本地资源
      reconcileAll(changes.MediaData.newValue, changes.MediaData.oldValue)
    }
    chrome.storage.onChanged.addListener(onStorage)
    return () => chrome.storage.onChanged.removeListener(onStorage)
  }, [reconcileAll])

  /** 加载当前页初始数据 */
  useEffect(() => {
    if (tabId == null) { return }
    sendMessage({ Message: "HeartBeat" })
    sendMessage({ Message: "clearRedundant" })
    sendMessage({ Message: "getData", tabId }).then((data: any) => {
      if (!data || data === "OK") { return }
      if (data.length >= 500 && confirm(i18n("confirmLoading", [data.length]))) {
        setSkipped(true)
        return
      }
      addMediaList(data, true)
    })
    sendMessage({ Message: "damnUrlHas" }).then((response: boolean) => {
      if (response && G.damn) { setBlockedSite(true) }
    })
    // 查询疑似密钥
    if (chrome.webNavigation) {
      chrome.webNavigation.getAllFrames({ tabId }, frames => {
        if (!frames) { return }
        for (const frame of frames) {
          tabSendMessage(tabId, { Message: "getKey" }, { frameId: frame.frameId })
            .then((result: string[]) => {
              if (!result || result.length == 0) { return }
              setKeys(prev => {
                const next = [...prev]
                for (const k of result) {
                  if (!next.some(x => x.key === k)) { next.push({ key: k, hex: "" }) }
                }
                return next
              })
            })
        }
      })
    }
    const onUnload = () => sendMessage({ Message: "clearRedundant" })
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [tabId, addMediaList])

  /** 后台消息监听：资源追加/标题更新/下载进度/密钥/页面标题 */
  useEffect(() => {
    if (tabId == null) { return }
    const listener = (
      msg: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (!msg) { return }
      // SW 重启恢复完成（期间打开的侧边栏可能拿到空壳快照）：全量对账补缺失
      if (msg.Message == "cacheDataReady") {
        reconcileAll()
        return
      }
      // 某端（侧边栏本体/下载页删任务）删除了单条资源：本地同步移除对应行
      // （自己发起的删除本地已移除，此处无操作；广播保证多端一致）
      if (msg.Message == "MediaDataDeleted" && msg.requestId != null) {
        const rid = String(msg.requestId)
        const dropFrom = (work: Map<string, MediaResource>) => {
          if (!work.has(rid)) { return null }
          const next = new Map(work)
          next.delete(rid)
          return next
        }
        const nextCurrent = dropFrom(currentWork.current)
        if (nextCurrent) { commitCurrent(nextCurrent) }
        const nextOther = dropFrom(otherWork.current)
        if (nextOther) { commitOther(nextOther) }
        return
      }
      if (msg.Message == "downloadProgress" && msg.requestId) {
        setProgress(prev => {
          const state: ProgressState =
            prev.get(msg.requestId) ??
            ({ success: 0, total: 1, errors: [], percent: 0, phase: "downloading" } as ProgressState)
          const next = new Map(prev)
          if (msg.totalCount != null) { state.total = msg.totalCount }
          if (msg.success != null) { state.success = msg.success }
          if (msg.type === "error" && msg.index != null) {
            if (!state.errors.includes(msg.index)) {
              state.errors = [...state.errors, msg.index]
            }
          } else if (msg.type === "completed" && msg.index != null) {
            state.errors = state.errors.filter(i => i !== msg.index)
          }
          if (state.total > 1) {
            const pct = state.total
              ? Math.min(100, Math.floor((state.success / state.total) * 100))
              : 0
            state.percent = pct
          } else if (msg.total) {
            state.received = msg.received
            state.totalBytes = msg.total
            state.percent = Math.min(
              100,
              Math.round((msg.received / msg.total) * 100)
            )
          } else {
            state.received = msg.received || 0
          }
          state.phase =
            msg.type === "merging"
              ? "merging"
              : msg.type === "saving"
                ? "saving"
                : msg.type === "paused"
                  ? "paused"
                  : msg.type === "resumed" || msg.type === "downloading"
                    ? "downloading"
                    : msg.type === "complete"
                      ? "complete"
                      : msg.type === "stopped"
                        ? undefined
                        : state.phase
          next.set(msg.requestId, { ...state })
          return next
        })
        return
      }
      // 任意 tab 发生页面导航：冻结当前页与其他页列表里属于该 tab 的旧资源标题，
      // 之后新页面标题上报（pageTitleUpdated）不会再改动它们
      if (msg.Message == "pageNavReset" && msg.tabId != null) {
        /** 冻结指定分组中属于该 tab 且未锁定的资源，返回是否有变更 */
        const freezeGroup = (work: Map<string, MediaResource>) => {
          const next = new Map(work)
          let changed = false
          for (const item of next.values()) {
            if (item.tabId != msg.tabId || item.titleLocked) { continue }
            item.titleLocked = true
            next.set(item.requestId, { ...item })
            changed = true
          }
          return changed ? next : null
        }
        const nextCurrent = freezeGroup(currentWork.current)
        if (nextCurrent) { commitCurrent(nextCurrent) }
        const nextOther = freezeGroup(otherWork.current)
        if (nextOther) { commitOther(nextOther) }
        return
      }
      if (msg.Message == "pageTitleUpdated" && msg.tabId != null && msg.title) {
        const newTitle = msg.title
        // 规则标题自动应用一次后即锁定，导航到新页面不再覆盖旧视频名称；
        // force（用户重存名称规则）只刷新与规则所在页面同 URL 的资源。
        // fallback（标签标题兜底回填）不锁定，规则标题后到达仍可覆盖。
        // 当前页与其他页分组都按消息中的 tabId 匹配更新（其他页是快照，不回填会永远停留在旧标题）
        const applyTitle = (work: Map<string, MediaResource>) => {
          const next = new Map(work)
          let changed = false
          for (const item of next.values()) {
            if (item.tabId != msg.tabId) { continue }
            if (msg.force) {
              if (!samePageUrl(item.webUrl, msg.url)) { continue }
            } else if (item.titleLocked) {
              continue
            }
            item._title = newTitle
            item.name = newTitle + (item.ext ? "." + item.ext : "")
            const display = item.title
            item.title = newTitle
            item.downFileName = G.TitleName
              ? templates(G.downFileName, item)
              : item.name
            item.title = display
            item.downFileName = filterFileName(item.downFileName) || item.name
            if (!msg.fallback) { item.titleLocked = true }
            next.set(item.requestId, { ...item })
            changed = true
          }
          return changed ? next : null
        }
        const nextCurrent = applyTitle(currentWork.current)
        if (nextCurrent) { commitCurrent(nextCurrent) }
        const nextOther = applyTitle(otherWork.current)
        if (nextOther) { commitOther(nextOther) }
        return
      }
      if (msg.Message == "titlePicked" && msg.requestId && msg.title) {
        /** 在指定分组中应用选取标题，返回是否命中 */
        const applyTo = (prev: Map<string, MediaResource>) => {
          const item = prev.get(msg.requestId)
          if (!item) { return null }
          const next = new Map(prev)
        const updated: MediaResource = { ...item }
        updated._title = msg.title
        updated.name = msg.title + (updated.ext ? "." + updated.ext : "")
        const display = updated.title
        updated.title = msg.title
        updated.downFileName = G.TitleName
          ? templates(G.downFileName, updated)
          : updated.name
        updated.title = display
        updated.downFileName = filterFileName(updated.downFileName) || updated.name
        // 用户手动命名：覆盖任何已有值并锁定，后续自动标题更新不再改动
        updated.titleLocked = true
        next.set(msg.requestId, updated)
        return next
        }
        const nextCurrent = applyTo(currentWork.current)
        if (nextCurrent) { commitCurrent(nextCurrent) }
        const nextOther = applyTo(otherWork.current)
        if (nextOther) { commitOther(nextOther) }
        showTips(i18n.hasSent || "已选取", 800)
        return
      }
      if (!msg.Message || !msg.data) { return }
      if (msg.Message == "sidepanelAddData") {
        const isCurrent = msg.data.tabId == tabId
        // 其他页数据未展开时不构建（原版行为：仅在已加载时追加）
        if (!isCurrent && !otherLoaded) {
          sendResponse("OK")
          return true
        }
        addMedia(msg.data, isCurrent)
        sendResponse("OK")
        return true
      }
      if (msg.Message == "sidepanelAddKey") {
        chrome.tabs.query({}, tabs => {
          let ownerTab = -1
          for (const t of tabs) {
            if (t.url == msg.url) { ownerTab = t.id; break }
          }
          if (ownerTab != -1 && ownerTab != tabId) { return }
          setKeys(prev =>
            prev.some(x => x.key === msg.data)
              ? prev
              : [...prev, { key: msg.data, hex: "" }]
          )
        })
        sendResponse("OK")
        return true
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [tabId, addMedia, otherLoaded, reconcileAll])

  /** 普通下载进度 + 服务器错误降级猫抓下载器 */
  useEffect(() => {
    if (!chrome.downloads?.onChanged) { return }
    const errorList = [
      "SERVER_BAD_CONTENT", "SERVER_UNAUTHORIZED", "SERVER_FORBIDDEN",
      "SERVER_UNREACHABLE", "SERVER_CROSS_ORIGIN_REDIRECT",
      "SERVER_FAILED", "NETWORK_FAILED"
    ]
    const listener = (item: chrome.downloads.OnChangedDownloadDeltaType) => {
      const data = downloadIdMap.get(item.id)
      if (data) {
        const received = item.bytesReceived?.current ?? 0
        const total = item.totalBytes?.current ?? 0
        const state = item.state?.current
        setProgress(prev => {
          const cur =
            prev.get(data.requestId) ??
            ({ success: 0, total: 1, errors: [], percent: 0 } as ProgressState)
          const next = new Map(prev)
          const updated: ProgressState = { ...cur }
          if (state === "complete") {
            updated.percent = 100
            updated.phase = "complete"
          } else if (state === "interrupted") {
            updated.phase = "error"
          } else if (total > 0) {
            updated.received = received
            updated.totalBytes = total
            updated.percent = Math.min(100, Math.round((received / total) * 100))
          } else {
            updated.received = received
          }
          next.set(data.requestId, updated)
          return next
        })
      }
      if (item.error && errorList.includes(item.error.current) && data) {
        catDownload(data)
        downloadIdMap.delete(item.id)
      }
    }
    chrome.downloads.onChanged.addListener(listener)
    return () => chrome.downloads.onChanged.removeListener(listener)
  }, [])

  /** 懒加载其他标签页资源（仅拉取一次） */
  const loadOther = useCallback(() => {
    if (otherLoaded) { return }
    setOtherLoaded(true)
    sendMessage({ Message: "getAllData" }).then((data: any) => {
      if (!data) { return }
      const list: MediaResource[] = []
      for (const key of Object.keys(data)) {
        if (key == String(tabId)) { continue }
        list.push(...data[key])
      }
      addMediaList(list, false)
    })
  }, [addMediaList, otherLoaded, tabId])

  /** 切回资源 Tab 时补拉当前页新增数据 */
  const refreshCurrent = useCallback(() => {
    sendMessage({ Message: "getData", tabId }).then((data: any) => {
      if (!data || data === "OK") { return }
      const fresh = data.filter(
        (item: MediaResource) => !currentWork.current.has(item.requestId)
      )
      if (fresh.length) { addMediaList(fresh, true) }
    })
  }, [addMediaList, tabId])

  /** 勾选/取消单行 */
  const toggleCheck = useCallback((rid: string, isCurrent: boolean) => {
    const work = isCurrent ? currentWork.current : otherWork.current
    const item = work.get(rid)
    if (!item) { return }
    const next = new Map(work)
    next.set(rid, { ...item, checked: !item.checked })
    if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
  }, [commitCurrent, commitOther])

  /**
   * 全选/取消/反选（合并展示后作用于当前页+其他页全部可见资源）
   */
  const setCheckedAll = useCallback(
    (checked: boolean | "invert") => {
      const build = (work: Map<string, MediaResource>) => {
        const next = new Map(work)
        for (const [rid, item] of next) {
          if (item.hidden) { continue }
          next.set(rid, {
            ...item,
            checked: checked === "invert" ? !item.checked : checked
          })
        }
        return next
      }
      commitCurrent(build(currentWork.current))
      commitOther(build(otherWork.current))
      setCheckboxState(prev => (checked === "invert" ? !prev : checked))
    },
    [commitCurrent, commitOther]
  )

  /** 展开/折叠单行详情 */
  const toggleExpand = useCallback((rid: string, isCurrent: boolean) => {
    const work = isCurrent ? currentWork.current : otherWork.current
    const item = work.get(rid)
    if (!item) { return }
    const next = new Map(work)
    next.set(rid, { ...item, expanded: !item.expanded })
    if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
  }, [commitCurrent, commitOther])

  /** 批量展开/折叠：all 全部、play 可播放、checked 已勾选、fold 全部收起（作用于两组） */
  const setExpandAll = useCallback(
    (mode: "all" | "play" | "checked" | "fold") => {
      const build = (prev: Map<string, MediaResource>) => {
        const next = new Map(prev)
        for (const [rid, item] of next) {
          if (item.hidden) { continue }
          let expanded = item.expanded
          if (mode === "fold") { expanded = false }
          else if (mode === "all") { expanded = true }
          else if (mode === "play" && item.isPlay) { expanded = true }
          else if (mode === "checked" && item.checked) { expanded = true }
          if (expanded !== item.expanded) {
            next.set(rid, { ...item, expanded })
          }
        }
        return next
      }
      commitCurrent(build(currentWork.current))
      commitOther(build(otherWork.current))
    },
    [commitCurrent, commitOther]
  )

  /** 应用编辑/选取得到的新标题，重算文件名 */
  const applyTitle = useCallback(
    (rid: string, isCurrent: boolean, newTitle: string) => {
      if (!newTitle) { return }
      const work = isCurrent ? currentWork.current : otherWork.current
      const item = work.get(rid)
      if (!item) { return }
      const updated = { ...item }
      updated._title = newTitle
      updated.name = newTitle + (updated.ext ? "." + updated.ext : "")
      const display = updated.title
      updated.title = newTitle
      updated.downFileName = G.TitleName
        ? templates(G.downFileName, updated)
        : updated.name
      updated.title = display
      updated.downFileName = filterFileName(updated.downFileName) || updated.name
      // 用户手动命名：覆盖任何已有值并锁定，后续自动标题更新不再改动
      updated.titleLocked = true
      updated.updateTime = Date.now()
      const next = new Map(work)
      next.set(rid, updated)
      if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
      // 写回 background 缓存（同一份数据源）：复用 titlePicked 语义，SW 重启/其他侧边栏对账后改名不丢失
      sendMessage({ Message: "titlePicked", requestId: rid, title: newTitle }).catch(() => { })
    },
    [commitCurrent, commitOther]
  )

  /** 获取全部勾选资源（当前页+其他页合并） */
  const getChecked = useCallback((): MediaResource[] => {
    const list: MediaResource[] = []
    for (const item of currentRef.current.values()) {
      if (item.checked) { list.push(item) }
    }
    for (const item of otherRef.current.values()) {
      if (item.checked) { list.push(item) }
    }
    return list
  }, [])

  /** 扩展名筛选开关：勾选=显示，取消=隐藏并取消勾选 */
  const toggleExt = useCallback((ext: string) => {
    const enabled = filterRef.current.get(ext) === false
    setFilterExt(prev => {
      const n = new Map(prev)
      n.set(ext, enabled)
      return n
    })
    const build = (prev: Map<string, MediaResource>) => {
      const next = new Map(prev)
      for (const [rid, item] of next) {
        if (item.ext !== ext) { continue }
        if (!enabled) {
          if (!item.hidden || item.checked) {
            next.set(rid, { ...item, hidden: true, checked: false })
          }
        } else if (item.hidden) {
          next.set(rid, { ...item, hidden: false, checked: true })
        }
      }
      return next
    }
    commitCurrent(build(currentWork.current))
    commitOther(build(otherWork.current))
  }, [commitCurrent, commitOther])

  /** 正则筛选（回车触发，空串清除并恢复勾选） */
  const applyRegex = useCallback((text: string) => {
    setRegexState(text)
    let regex: RegExp | null = null
    if (text) {
      try { regex = new RegExp(text) } catch { return }
    }
    const build = (prev: Map<string, MediaResource>) => {
      const next = new Map(prev)
      for (const [rid, item] of next) {
        if (!regex) {
          // 仅恢复未被扩展名/去重筛选隐藏的项
          if (
            item.hidden &&
            filterRef.current.get(item.ext) !== false &&
            !duplicateRef.current?.has(item.name)
          ) {
            next.set(rid, { ...item, hidden: false, checked: true })
          }
          continue
        }
        const hidden = !regex.test(item.url)
        if (hidden !== item.hidden) {
          next.set(rid, {
            ...item,
            hidden,
            checked: hidden ? false : item.checked
          })
        }
      }
      return next
    }
    commitCurrent(build(currentWork.current))
    commitOther(build(otherWork.current))
  }, [commitCurrent, commitOther])

  /** 删除重复文件名：同名仅保留第一条 */
  const dedupe = useCallback(() => {
    const seen = new Set<string>()
    const dup = new Set<string>()
    const all = [
      ...currentWork.current.values(),
      ...otherWork.current.values()
    ]
    for (const item of all) {
      if (seen.has(item.name)) { dup.add(item.name) }
      seen.add(item.name)
    }
    setDuplicateSet(seen)
    const build = (prev: Map<string, MediaResource>) => {
      const next = new Map(prev)
      for (const [rid, item] of next) {
        const hidden = dup.has(item.name) || item.hidden
        if (hidden !== item.hidden) {
          next.set(rid, { ...item, hidden, checked: hidden ? false : item.checked })
        }
      }
      return next
    }
    commitCurrent(build(currentWork.current))
    commitOther(build(otherWork.current))
  }, [commitCurrent, commitOther])

  /** 清除全部筛选条件（UI 重置按钮，恢复显示） */
  const clearFilter = useCallback(() => {
    setRegexState("")
    setDuplicateSet(null)
    setSoloTargets(null)
    setFilterExt(() => new Map())
    const build = (prev: Map<string, MediaResource>) => {
      const next = new Map(prev)
      for (const [rid, item] of next) {
        if (item.hidden) {
          next.set(rid, { ...item, hidden: false })
        }
      }
      return next
    }
    commitCurrent(build(currentWork.current))
    commitOther(build(otherWork.current))
  }, [commitCurrent, commitOther])

  const [buttonState, setButtonState] = useState<Record<string, boolean>>({})
  /** 拉取工具箱按钮状态（模拟手机/自动下载/捕获脚本） */
  const updateButton = useCallback(() => {
    sendMessage({ Message: "getButtonState", tabId }).then((state: any) => {
      if (state) { setButtonState(state) }
    })
  }, [tabId])

  useEffect(() => {
    updateButton()
  }, [updateButton])

  /** 清空当前页分组数据（脚本注入 autoClearMode 场景） */
  const clearGroup = useCallback(() => {
    sendMessage({ Message: "clearData", tabId, type: true })
    sendMessage({ Message: "ClearIcon", type: true, tabId })
    commitCurrent(new Map())
  }, [tabId, commitCurrent])

  /** 清空全部数据（当前页+其他页），同步清除 background 两类缓存 */
  const clearAll = useCallback(() => {
    sendMessage({ Message: "clearData", tabId, type: true })
    sendMessage({ Message: "clearData", tabId, type: false })
    sendMessage({ Message: "ClearIcon", type: true, tabId })
    commitCurrent(new Map())
    commitOther(new Map())
  }, [tabId, commitCurrent, commitOther])

  /**
   * 扩展名 solo 筛选：仅显示 targets 集合内的扩展名（null=恢复全部）
   * 与 toggleExt 不同，这里一次性批量设置，避免连续 toggle 的状态竞态
   * 把所有已存在资源的扩展名 + targets 都加入 filterExt：
   * targets 内的设为 true，其他显式设为 false，保证筛选生效；
   * 触发钮文案与菜单高亮改由独立 soloTargets 判定，不再依赖 filterExt 推断
   */
  const soloExts = useCallback(
    (targets: string[] | null) => {
      setSoloTargets(targets)
      const allExts = new Set<string>()
      for (const item of currentWork.current.values()) {
        if (item.ext) { allExts.add(item.ext) }
      }
      for (const item of otherWork.current.values()) {
        if (item.ext) { allExts.add(item.ext) }
      }
      if (targets) {
        for (const t of targets) { allExts.add(t) }
      }
      setFilterExt(prev => {
        const n = new Map<string, boolean>()
        const all = new Set<string>([...prev.keys(), ...allExts])
        for (const e of all) {
          n.set(e, targets ? targets.includes(e) : true)
        }
        return n
      })
      const build = (prev: Map<string, MediaResource>) => {
        const next = new Map(prev)
        for (const [rid, item] of next) {
          const show = targets == null || targets.includes(item.ext!)
          if (!show) {
            if (!item.hidden || item.checked) {
              next.set(rid, { ...item, hidden: true, checked: false })
            }
          } else if (
            item.hidden &&
            filterRef.current.get(item.ext) === false
          ) {
            // 仅恢复此前因扩展名筛选隐藏的项（正则/去重隐藏不在此恢复）
            next.set(rid, { ...item, hidden: false, checked: true })
          }
        }
        return next
      }
      commitCurrent(build(currentWork.current))
      commitOther(build(otherWork.current))
    },
    [commitCurrent, commitOther]
  )

  /** 删除单条资源：从前端列表移除并通知 background 清除缓存 */
  const removeMedia = useCallback((rid: string, isCurrent: boolean) => {
    const work = isCurrent ? currentWork.current : otherWork.current
    const item = work.get(rid)
    if (!item) { return }
    // 通知 background 从 cacheData 中删除该条资源
    sendMessage({ Message: "deleteMedia", tabId: item.tabId, requestId: rid })
    // 从前端列表中移除
    const next = new Map(work)
    next.delete(rid)
    if (isCurrent) { commitCurrent(next) } else { commitOther(next) }
  }, [commitCurrent, commitOther])

  /**
   * 删除已下载完成的资源（progress.phase === "complete"，覆盖猫抓下载与
   * 普通浏览器下载两类）：前端列表与 background 缓存同步移除，作用于整个列表
   */
  const removeDownloaded = useCallback(() => {
    const build = (work: Map<string, MediaResource>) => {
      const next = new Map(work)
      for (const [rid, item] of next) {
        if (progress.get(rid)?.phase !== "complete") { continue }
        sendMessage({ Message: "deleteMedia", tabId: item.tabId, requestId: rid })
        next.delete(rid)
      }
      return next
    }
    commitCurrent(build(currentWork.current))
    commitOther(build(otherWork.current))
  }, [progress, commitCurrent, commitOther])

  const value: StoreValue = {
    ready: true,
    sideMode: tabId != null,
    current,
    other,
    otherLoaded,
    loadOther,
    refreshCurrent,
    keys,
    progress,
    favicon,
    filterExt,
    toggleExt,
    setRegex: applyRegex,
    regex,
    dedupe,
    clearFilter,
    checkboxState,
    setCheckedAll,
    toggleCheck,
    toggleExpand,
    setExpandAll,
    applyTitle,
    getChecked,
    clearGroup,
    clearAll,
    soloExts,
    soloTargets,
    removeMedia,
    removeDownloaded,
    blockedSite,
    skipped,
    buttonState,
    updateButton
  }

  return (
    <StoreContext.Provider value={value}>
      {props.children}
    </StoreContext.Provider>
  )
}

/** 获取 popup store */
export function useMediaStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) { throw new Error("useMediaStore 必须在 MediaStoreProvider 内使用") }
  return ctx
}
