// @ts-nocheck
/**
 * Preview 页面 React 状态管理
 * 迁移自 js/preview.js 的 FilePreview 类
 */
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
  secToTime,
  templates,
  filterFileName,
  isEmpty,
  stringModify,
  setHeaders,
  send2local
} from "~lib/function"
import {
  isM3U8,
  isPicture,
  isMedia,
  isMediaExt,
  copyLink,
  base64Encode
} from "~components/shared/format"
import { sendMessage } from "~components/shared/api"
import { showTips } from "~components/shared/toast-bus"
import { catDownload, aria2AddUri, sendToMQTT } from "~components/shared/actions"

/** 最大列表长度（分页阈值） */
const MAX_LIST_SIZE = 128

const StoreContext = createContext<any>(null)

/** 修整单条数据（迁移自 FilePreview.trimData） */
function trimData(data: any): any {
  data._title = data.title
  data.title = stringModify(data.title)
  data.name = isEmpty(data.name)
    ? data.title + "." + data.ext
    : decodeURIComponent(stringModify(data.name))
  data.downFileName = G.TitleName ? templates(G.downFileName, data) : data.name
  data.downFileName = filterFileName(data.downFileName)
  if (isEmpty(data.downFileName)) {
    data.downFileName = data.name
  }
  data._size = data.size
  data.ext = data.ext ? data.ext : "Unknown"
  data.type = data.type ? data.type : "Unknown"
  data.duration = data.duration ? data.duration : -1
  return data
}

/** 计算过滤+排序后的列表（迁移自 FilePreview.updateFileList） */
function computeFiltered(items: any[], filters: any): any[] {
  let result = [...items]
  // 删除重复文件名
  if (filters.deleteDuplicateFilenames) {
    const seen = new Set<string>()
    result = result.filter(item => {
      if (seen.has(item.name)) return false
      seen.add(item.name)
      return true
    })
  }
  // 扩展名 + 类型 + 正则过滤
  result = result.filter(
    item =>
      filters.ext.has(item.ext) &&
      filters.type.has(item.type) &&
      (!filters.regexObj || filters.regexObj.test(item.url))
  )
  // 排序
  const order = filters.sortOrder === "asc" ? 1 : -1
  const field = filters.sortField
  if (field === "duration") {
    result.sort((a, b) => {
      if (a[field] === -1 && b[field] === -1) return 0
      if (a[field] === -1) return 1
      if (b[field] === -1) return -1
      return order * (a[field] - b[field])
    })
  } else {
    result.sort((a, b) => order * (a[field] - b[field]))
  }
  return result
}

/** 解析 URL 参数（迁移自 FilePreview.parseParams） */
function parseUrlParams() {
  const params = new URL(location.href).searchParams
  const tabId = parseInt(params.get("tabId") || "")
  const page = params.get("page")
  const currentPage = page ? parseInt(page) : 1
  const rangeStr = params.get("range")
  let currentRange: { start: number; end?: number } | null = null
  if (rangeStr) {
    const parts = rangeStr.split("-").map(Number)
    currentRange = { start: parts[0], end: parts[1] || undefined }
  }
  return { tabId, currentPage, currentRange }
}

/** Preview Store Provider：封装预览页全部状态与操作 */
export function PreviewStoreProvider(props: { children: React.ReactNode }) {
  const { children } = props
  const urlParams = useRef(parseUrlParams())
  const { tabId, currentPage, currentRange } = urlParams.current

  const [ready, setReady] = useState(false)
  const [originalItems, setOriginalItems] = useState<any[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(
    () => new Set()
  )
  const [previewState, setPreviewState] = useState<{
    type: string | null
    item: any | null
  }>({ type: null, item: null })
  const [pagination, setPagination] = useState({
    total: 0,
    maxPage: 1,
    currentPage
  })
  const [buttonState, setButtonState] = useState<Record<string, boolean>>({})
  const [defaultPopup, setDefaultPopupState] = useState(false)

  const [filters, setFilters] = useState({
    ext: new Set<string>(),
    type: new Set<string>(),
    sortField: "getTime",
    sortOrder: "asc",
    regex: "",
    regexObj: null as RegExp | null,
    showTitle: false,
    deleteDuplicateFilenames: false
  })

  const tabRef = useRef<chrome.tabs.Tab | null>(null)
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const filteredItemsRef = useRef<any[]>([])
  const pushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 计算过滤后的列表
  const filteredItems = useMemo(
    () => computeFiltered(originalItems, filters),
    [originalItems, filters]
  )
  filteredItemsRef.current = filteredItems

  /** 关闭预览 */
  const closePreview = useCallback(() => {
    setPreviewState({ type: null, item: null })
  }, [])

  /** 全选/取消全选（迁移自 FilePreview.toggleSelection） */
  const selectAll = useCallback(() => {
    setSelectedItems(prev => {
      const allSelected = filteredItemsRef.current.every(i =>
        prev.has(i.requestId)
      )
      const next = new Set(prev)
      if (allSelected) {
        filteredItemsRef.current.forEach(i => next.delete(i.requestId))
      } else {
        filteredItemsRef.current.forEach(i => next.add(i.requestId))
      }
      return next
    })
  }, [])

  /** 反选 */
  const invertSelection = useCallback(() => {
    setSelectedItems(prev => {
      const next = new Set<string>()
      filteredItemsRef.current.forEach(i => {
        if (!prev.has(i.requestId)) next.add(i.requestId)
      })
      for (const id of prev) {
        const inFiltered = filteredItemsRef.current.some(
          i => i.requestId === id
        )
        if (!inFiltered) next.add(id)
      }
      return next
    })
  }, [])

  /** 获取选中项列表 */
  const getSelectedItems = useCallback(
    () => filteredItemsRef.current.filter(i => selectedItems.has(i.requestId)),
    [selectedItems]
  )

  /** 打开 m3u8 解析器（迁移自 FilePreview.openM3U8）
   * 优先向已有 m3u8 下载页发送 m3u8AddTask 追加任务（多任务共存于同一页面）；
   * 无页面或页面无响应时兜底新开标签页（URL 参数初始化首个任务）
   */
  const openM3U8 = useCallback(
    (data: any, options: any = {}) => {
      chrome.tabs.getCurrent(tab => {
        // URL 参数（兜底新开标签页时使用）
        const url = `/tabs/m3u8.html?${new URLSearchParams({
          url: data.url,
          title: data.title,
          filename: data.downFileName,
          tabid: String(data.tabId == -1 ? tabId : data.tabId),
          initiator: data.initiator || "",
          requestHeaders: data.requestHeaders
            ? JSON.stringify(data.requestHeaders)
            : "",
          ...Object.fromEntries(
            Object.entries(options).map(([k, v]: [string, any]) => [
              k,
              typeof v === "boolean" ? 1 : v
            ])
          )
        })}`
        // 追加任务参数（与 URL 参数同源，字段名为 camelCase）
        const params = {
          url: data.url,
          title: data.title,
          fileName: data.downFileName,
          tabId: data.tabId == -1 ? tabId : data.tabId,
          initiator: data.initiator || "",
          requestHeaders: data.requestHeaders || {},
          requestId: data.requestId || null,
          autoDown: options.autoDown ? true : undefined,
          autoClose: options.autoClose ? true : undefined,
          ffmpeg: options.ffmpeg ?? null
        }
        /** 兜底：新开标签页（页面加载后由 URL 参数初始化首个任务） */
        const create = () => {
          chrome.tabs.create({
            url,
            index: tab ? tab.index + 1 : undefined,
            active: !options.autoDown
          })
        }
        // 查找已有 m3u8 下载页，追加任务
        chrome.tabs.query(
          { url: chrome.runtime.getURL("tabs/m3u8.html") + "*" },
          tabs => {
            const target = tabs[tabs.length - 1]
            if (target?.id == null) {
              create()
              return
            }
            let settled = false
            try {
              chrome.tabs.sendMessage(
                target.id,
                { Message: "m3u8AddTask", params },
                (resp: any) => {
                  if (settled) { return }
                  settled = true
                  if (!chrome.runtime.lastError && resp?.ok) {
                    // 页面已接收任务：仅激活该标签页
                    chrome.tabs.update(target.id, { active: true })
                    return
                  }
                  create()
                }
              )
            } catch (e) {
              create()
            }
            // 页面 500ms 内未响应（未加载完成/无监听）：兜底新开
            setTimeout(() => {
              if (!settled) {
                settled = true
                create()
              }
            }, 500)
          }
        )
      })
    },
    [tabId]
  )

  /** 下载单条资源（迁移自 FilePreview.downloadItem） */
  const downloadOne = useCallback(
    (data: any) => {
      // m3u8dl 外部程序
      if (G.m3u8dl && isM3U8(data) && !data.url.startsWith("blob:")) {
        const m3u8dlArg = data.m3u8dlArg ?? templates(G.m3u8dlArg, data)
        const url =
          "m3u8dl:" + (G.m3u8dl == 1 ? base64Encode(m3u8dlArg) : m3u8dlArg)
        if (url.length >= 2046) {
          navigator.clipboard.writeText(m3u8dlArg)
          showTips(i18n.M3U8DLparameterLong)
          return
        }
        if (G.isFirefox) {
          window.location.href = url
          return
        }
        chrome.tabs.update({ url })
        return
      }
      // m3u8 自动解析下载
      if (G.m3u8AutoDown && isM3U8(data)) {
        openM3U8(data, {
          taskId: Date.parse(new Date() as any),
          autoDown: true,
          autoClose: true
        })
        return
      }
      catDownload(data)
    },
    [openM3U8]
  )

  /** 复制单条链接 */
  const copyOne = useCallback((data: any) => {
    navigator.clipboard.writeText(copyLink(data))
    showTips(i18n.copiedToClipboard)
  }, [])

  /** 删除单条 */
  const deleteOne = useCallback((data: any) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.delete(data.requestId)
      return next
    })
    setOriginalItems(prev =>
      prev.filter(i => i.requestId !== data.requestId)
    )
  }, [])

  /** 发送到 aria2 */
  const aria2One = useCallback((data: any) => {
    aria2AddUri(
      data,
      success => showTips(String(success), 1000),
      msg => showTips(String(msg), 1500)
    )
  }, [])

  /** 发送到本地 */
  const sendOne = useCallback(
    (data: any) => {
      send2local("catch", data, tabId)
        .then((success: any) => {
          if (success?.ok) showTips(i18n.hasSent, 1000)
        })
        .catch((error: any) => {
          showTips(error || i18n.sendFailed, 1500)
        })
    },
    [tabId]
  )

  /** 发送到 MQTT */
  const mqttOne = useCallback((data: any) => {
    sendToMQTT(data)
      .then(() =>
        showTips(
          (i18n as any).messageSentToMQTT || "Message sent to MQTT server",
          2000
        )
      )
      .catch((error: any) =>
        showTips(
          error?.toString() || (i18n as any).sendFailed || "Send failed",
          10000
        )
      )
  }, [])

  /** 调用第三方工具 */
  const invokeOne = useCallback((data: any) => {
    const url = templates(G.invokeText, data)
    if (G.isFirefox) {
      window.location.href = url
    } else {
      chrome.tabs.update({ url })
    }
  }, [])

  /** 打开预览 */
  const openPreview = useCallback((item: any) => {
    if (isPicture(item)) {
      setPreviewState({ type: "image", item })
    } else {
      setPreviewState({ type: "video", item })
    }
  }, [])

  /** 下载选中 */
  const downloadSelected = useCallback(() => {
    const items = getSelectedItems()
    if (items.length) catDownload(items)
  }, [getSelectedItems])

  /** 复制选中链接 */
  const copySelected = useCallback(() => {
    const items = getSelectedItems()
    const urls = items.map(item => copyLink(item))
    navigator.clipboard.writeText(urls.join("\n"))
    showTips(i18n.copiedToClipboard)
  }, [getSelectedItems])

  /** 删除选中 */
  const deleteSelected = useCallback(() => {
    const ids = new Set(getSelectedItems().map(i => i.requestId))
    setSelectedItems(prev => {
      const next = new Set(prev)
      ids.forEach(id => next.delete(id))
      return next
    })
    setOriginalItems(prev => prev.filter(i => !ids.has(i.requestId)))
  }, [getSelectedItems])

  /** 合并下载（迁移自 FilePreview.mergeDownload） */
  const mergeDownload = useCallback(() => {
    const items = getSelectedItems()
    if (items.length === 0) return
    sendMessage({
      Message: "catCatchFFmpeg",
      action: "openFFmpeg",
      extra: i18n.waitingForMedia
    })
    // 全是 m3u8 走解析器合并
    if (items.every(data => isM3U8(data))) {
      const taskId = Date.parse(new Date() as any)
      items.forEach(data => {
        openM3U8(data, {
          ffmpeg: "merge",
          quantity: items.length,
          taskId,
          autoDown: true,
          autoClose: true
        })
      })
      return
    }
    catDownload(items, { ffmpeg: "merge" })
  }, [getSelectedItems, openM3U8])

  /** 清空数据（迁移自 FilePreview.clearData） */
  const clear = useCallback(() => {
    sendMessage({ Message: "clearData", type: true, tabId })
    sendMessage({ Message: "ClearIcon", type: true, tabId })
    setOriginalItems([])
    setSelectedItems(new Set())
    setFilters(prev => ({
      ...prev,
      ext: new Set(),
      type: new Set()
    }))
  }, [tabId])

  /** 切换扩展名/类型筛选 */
  const toggleFilter = useCallback(
    (type: "ext" | "type", value: string) => {
      setFilters(prev => {
        const set = new Set(prev[type])
        if (set.has(value)) set.delete(value)
        else set.add(value)
        return { ...prev, [type]: set }
      })
    },
    []
  )

  /** 设置排序字段与顺序 */
  const setSort = useCallback((field: string, order: string) => {
    setFilters(prev => ({
      ...prev,
      sortField: field,
      sortOrder: order
    }))
  }, [])

  /** 设置正则过滤（迁移自 FilePreview #regular keypress） */
  const setRegex = useCallback((text: string) => {
    setFilters(prev => {
      let regexObj: RegExp | null = null
      if (text) {
        try {
          regexObj = new RegExp(text)
        } catch {
          showTips(i18n.noMatch)
          return prev
        }
      }
      return { ...prev, regex: text, regexObj }
    })
  }, [])

  /** 设置显示标题（迁移自 FilePreview #showTitle change） */
  const setShowTitle = useCallback((v: boolean) => {
    const store = chrome.storage.session ?? chrome.storage.local
    store.set({ previewShowTitle: v })
    setFilters(prev => ({ ...prev, showTitle: v }))
  }, [])

  /** 设置删除重复文件名 */
  const setDeleteDuplicateFilenames = useCallback((v: boolean) => {
    const store = chrome.storage.session ?? chrome.storage.local
    store.set({ previewDeleteDuplicateFilenames: v })
    setFilters(prev => ({ ...prev, deleteDuplicateFilenames: v }))
  }, [])

  /** 切换选择 */
  const toggleSelect = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** 脚本动作（迁移自 FilePreview.srciptList） */
  const scriptAction = useCallback(
    (script: string) => {
      sendMessage({
        Message: "script",
        tabId,
        script: script + ".js"
      }).then(() => {
        if (G.autoClearMode > 0) clear()
        updateButtonState()
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabId, clear]
  )

  /** 更新按钮状态（迁移自 FilePreview.updateSrciptButton） */
  const updateButtonState = useCallback(() => {
    if (isNaN(tabId)) return
    sendMessage({ Message: "getButtonState", tabId }).then((state: any) => {
      if (state) setButtonState(state)
    })
    setDefaultPopupState(G.popup || false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  /** 设置默认弹窗模式 */
  const setDefaultPopup = useCallback((v: boolean) => {
    chrome.storage.sync.set({ popup: v })
    setDefaultPopupState(v)
  }, [])

  /** 分页导航（迁移自 FilePreview.setupPage） */
  const setPage = useCallback((page: number) => {
    const url = new URL(location.href)
    url.searchParams.set("page", String(page))
    chrome.tabs.update({ url: url.toString() })
  }, [])

  /** 加载数据（迁移自 FilePreview.loadFileItems） */
  const loadData = useCallback(async () => {
    if (isNaN(tabId)) {
      showTips(i18n.noData, 1500)
      return
    }
    let items = await sendMessage({ Message: "getData", tabId })
    if (!items || items.length === 0) {
      showTips(i18n.noData, 1500)
      return
    }
    const total = items.length
    // 分页切片
    if (total > MAX_LIST_SIZE) {
      const maxPage = Math.ceil(total / MAX_LIST_SIZE)
      setPagination({ total, maxPage, currentPage })
      items = items.slice(
        (currentPage - 1) * MAX_LIST_SIZE,
        currentPage * MAX_LIST_SIZE
      )
    } else {
      setPagination({ total, maxPage: 1, currentPage: 1 })
    }
    // 显示范围切片
    if (currentRange) {
      items = items.slice(
        currentRange.start,
        currentRange.end ?? items.length
      )
    }
    // 修整数据
    items = items.map((data: any) => trimData({ ...data }))
    setOriginalItems(items)
    // 初始化筛选器
    const extSet = new Set(items.map((i: any) => i.ext))
    const typeSet = new Set(items.map((i: any) => i.type))
    setFilters(prev => ({
      ...prev,
      ext: extSet,
      type: typeSet,
      showTitle: G.previewShowTitle || false,
      deleteDuplicateFilenames: G.previewDeleteDuplicateFilenames || false
    }))
    // 设置请求头规则
    chrome.tabs.getCurrent(tab => {
      setHeaders(items, null, tab ? tab.id : undefined)
      tabRef.current = tab
    })
  }, [tabId, currentPage, currentRange])

  // 等待 G 初始化完成
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (G.initSyncComplete && G.initLocalComplete) {
        clearInterval(timer)
        setReady(true)
      }
    }, 0)
    return () => clearInterval(timer)
  }, [])

  // G 就绪后加载数据
  useEffect(() => {
    if (!ready) return
    loadData()
  }, [ready, loadData])

  // 监听新数据推送（迁移自 FilePreview.push + chrome.runtime.onMessage）
  useEffect(() => {
    if (!ready || isNaN(tabId)) return
    const listener = (msg: any) => {
      if (!msg || !msg.Message || !msg.data) return
      if (msg.data.tabId != tabId) return
      if (msg.Message === "sidepanelAddData") {
        if (pushDebounceRef.current) clearTimeout(pushDebounceRef.current)
        pushDebounceRef.current = setTimeout(() => {
          setOriginalItems(prev => {
            if (prev.length >= MAX_LIST_SIZE) return prev
            const trimmed = trimData({ ...msg.data })
            const next = [...prev, trimmed]
            // 更新筛选器
            setFilters(f => {
              const ext = new Set(f.ext)
              const type = new Set(f.type)
              ext.add(trimmed.ext)
              type.add(trimmed.type)
              return { ...f, ext, type }
            })
            // 设置请求头
            chrome.tabs.getCurrent(tab => {
              setHeaders(next, null, tab ? tab.id : undefined)
            })
            return next
          })
        }, 1000)
      }
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [ready, tabId])

  // 键盘快捷键：ESC 关闭预览，Ctrl+A 全选
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePreview()
        return
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "a" &&
        (e.target as HTMLElement)?.tagName !== "INPUT"
      ) {
        selectAll()
        e.preventDefault()
      }
    }
    document.addEventListener("keydown", onKeydown)
    return () => document.removeEventListener("keydown", onKeydown)
  }, [closePreview, selectAll])

  // G 就绪后拉取按钮状态
  useEffect(() => {
    if (ready) updateButtonState()
  }, [ready, updateButtonState])

  // 计算按钮禁用状态（迁移自 FilePreview.updateButtonStatus）
  const selectedList = getSelectedItems()
  const hasSelected = selectedList.length > 0
  const canMerge =
    selectedList.length === 2 &&
    (selectedList.every(
      item => (item._size ?? 0) <= G.chromeLimitSize && isMedia(item)
    ) ||
      selectedList.every(isM3U8))

  const value = {
    ready,
    tabId,
    currentPage,
    currentRange,
    originalItems,
    filteredItems,
    filters,
    selectedItems,
    selectedCount: selectedItems.size,
    hasSelected,
    canMerge,
    previewState,
    pagination,
    buttonState,
    defaultPopup,
    loadData,
    toggleSelect,
    selectAll,
    invertSelection,
    downloadSelected,
    copySelected,
    deleteSelected,
    mergeDownload,
    clear,
    toggleFilter,
    setSort,
    setRegex,
    setShowTitle,
    setDeleteDuplicateFilenames,
    openPreview,
    closePreview,
    downloadOne,
    copyOne,
    deleteOne,
    aria2One,
    sendOne,
    mqttOne,
    invokeOne,
    openM3U8,
    scriptAction,
    setDefaultPopup,
    setPage,
    updateButtonState
  }

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  )
}

/** 获取 preview store */
export function usePreviewStore(): any {
  const ctx = useContext(StoreContext)
  if (!ctx) {
    throw new Error("usePreviewStore 必须在 PreviewStoreProvider 内使用")
  }
  return ctx
}
