// @ts-nocheck
/**
 * Downloader 全局数据 store：分片列表 / 进度 / 状态 / 操作动作
 * 迁移自 js/downloader.js 的运行时状态与事件绑定逻辑
 *
 * 设计要点：
 * - 持有 Downloader 实例（ref），订阅其事件并同步到 React state
 * - `fragments` 为 React 视图层数组（与 down.fragments 同步）
 * - `progress` Map 单独保存高频进度数据，避免每次 chunk 都重建 fragments 数组
 * - `tick` 计数器：高频 itemProgress 时只递增 tick，由各组件自行从 down 实例读取最新值
 */
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState
} from "react"
import { G, i18n } from "~lib/init"
import { Downloader, createWriteStream } from "~lib/downloader-core"
import { broadcastProgress } from "~lib/broadcast"
import {
    ArrayBufferToBlob,
    getUrlFileName,
    setHeaders,
    closeTab,
    stringModify
} from "~lib/function"

/** 单个分片的视图状态 */
export interface FragmentView {
    /** 分片索引（与 down.fragments[index].index 对应） */
    index: number
    /** 下载 URL */
    url: string
    /** 落盘文件名 */
    downFileName: string
    /** 响应 Content-Type */
    contentType?: string
    /** 资源 requestId（来自嗅探阶段） */
    requestId: string
    /** 当前状态：等待 / 下载中 / 成功 / 失败 / 已停止 */
    state: "waiting" | "running" | "success" | "error" | "stopped"
    /** 错误信息（失败时填充） */
    error?: string
    /** chrome.downloads.download 返回的 id（用于打开目录等） */
    downId?: number
    /** 是否流式下载（存在 fileStream） */
    isStreaming: boolean
    /** 原始 fragment 对象引用（保留 fileStream/requestHeaders 等运行时字段） */
    raw: any
}

/** 单个分片的进度信息 */
export interface ProgressInfo {
    receivedLength: number
    contentLength: number
}

interface DownloaderStoreValue {
    /** 分片视图列表 */
    fragments: FragmentView[]
    /** 分片进度 Map（key 为 fragment.index） */
    progress: Map<number, ProgressInfo>
    /** 总分片数 */
    total: number
    /** 成功下载数 */
    success: number
    /** 正在运行的下载数 */
    running: number
    /** 下载器整体状态 */
    state: string
    /** 高频更新计数器，递增代表 progress 已更新 */
    tick: number
    /** 是否自动关闭 */
    autoClose: boolean
    setAutoClose: (v: boolean) => void
    /** 页面级下载文件名（取首个分片的 downFileName，用于顶部展示与标签页标题前缀） */
    fileTitle: string
    /** 初始化下载器并启动下载（生命周期入口） */
    startWithData: (
        data: any[],
        config: { downStream?: boolean | string; ffmpeg?: string; tabId?: number }
    ) => void
    /** 仅启动下载（已初始化过） */
    start: () => void
    /** 停止单个分片 */
    stopFragment: (index: number) => void
    /** 重试单个分片 */
    retryFragment: (index: number) => void
    /** 把分片 buffer 发送到在线 FFmpeg */
    sendFFmpeg: (index: number) => void
    /** 停止所有分片 */
    stopAll: () => void
    /** 打开下载目录 */
    openDir: () => void
    /** 外部新增分片（catDownload 消息） */
    addFragment: (fragment: any) => void
}

const DownloaderStoreContext = createContext<DownloaderStoreValue | null>(null)

/** 把原始 fragment 转为视图对象 */
function toView(fragment: any, isStreaming: boolean): FragmentView {
    return {
        index: fragment.index,
        url: fragment.url,
        downFileName: fragment.downFileName || getUrlFileName(fragment.url),
        contentType: fragment.contentType,
        requestId: String(fragment.requestId),
        state: "waiting",
        isStreaming,
        raw: fragment
    }
}

/**
 * 发送数据到在线 FFmpeg 页面
 * 复刻自 js/downloader.js 的 sendFile 函数
 * @param action 发送类型（如 "merge"）
 * @param data ArrayBuffer 或 Blob
 * @param fragment 分片对象
 * @param ffmpegUrl FFmpeg 页面 URL
 * @param tabId 当前 tab id
 * @param taskId 任务 id
 * @param dataCount 任务总数
 */
let isCreatingTab = false
function sendFile(
    action: string,
    data: ArrayBuffer | Blob,
    fragment: any,
    ffmpegUrl: string,
    tabId: number,
    taskId: number,
    dataCount: number
): void {
    // 转 blob
    if (data instanceof ArrayBuffer) {
        data = ArrayBufferToBlob(data, { type: fragment.contentType })
    }
    chrome.tabs.query({ url: ffmpegUrl + "*" }, function (tabs) {
        // 等待 ffmpeg 打开并且可用
        if (tabs.length === 0) {
            if (!isCreatingTab) {
                isCreatingTab = true
                chrome.tabs.create({ url: ffmpegUrl })
            }
            setTimeout(sendFile, 500, action, data, fragment, ffmpegUrl, tabId, taskId, dataCount)
            return
        } else if (tabs[0].status !== "complete") {
            setTimeout(sendFile, 233, action, data, fragment, ffmpegUrl, tabId, taskId, dataCount)
            return
        }
        isCreatingTab = false
        /**
         * chrome.runtime.sendMessage 的对象参数需要序列化，无法传递 Blob
         * Firefox 可以直接传递 Blob，Chrome 需转 createObjectURL
         */
        const baseData: any = {
            Message: "catCatchFFmpeg",
            action: action,
            files: [{
                data: G.isFirefox ? data : URL.createObjectURL(data as Blob),
                name: getUrlFileName(fragment.url),
                index: fragment.index
            }],
            title: stringModify(fragment.title),
            tabId: tabId
        }
        if (action === "merge") {
            baseData.taskId = taskId
            baseData.quantity = dataCount
        }
        chrome.runtime.sendMessage(baseData)
    })
}

/** Store Provider，初始化时为空，由 DownloaderApp 调用 startWithData 注入数据 */
export function DownloaderStoreProvider(props: { children: React.ReactNode }) {
    /** Downloader 实例（在 ref 中，避免重渲染） */
    const downRef = useRef<Downloader | null>(null)
    /** 分片视图数组 */
    const [fragments, setFragments] = useState<FragmentView[]>([])
    /** 进度 Map */
    const [progress, setProgress] = useState<Map<number, ProgressInfo>>(() => new Map())
    /** 高频 tick */
    const [tick, setTick] = useState(0)
    /** 总数 / 成功数 / 运行中 */
    const [total, setTotal] = useState(0)
    const [success, setSuccess] = useState(0)
    const [running, setRunning] = useState(0)
    const [downState, setDownState] = useState("waiting")
    /** 自动关闭 */
    const [autoClose, setAutoClose] = useState(false)
    /** 页面级下载文件名 */
    const [fileTitle, setFileTitle] = useState("")
    /** fileTitle 的 ref 副本（事件回调闭包内读取，避免 state 闭包旧值） */
    const fileTitleRef = useRef("")

    /** 配置：流式下载 / ffmpeg / tabId / taskId */
    const configRef = useRef<{
        downStream: boolean
        ffmpeg: string
        tabId: number
        taskId: number
    }>({ downStream: false, ffmpeg: "", tabId: 0, taskId: Date.now() })

    /** 工作副本：直接修改以避免 setState 异步链 */
    const fragmentsWork = useRef<FragmentView[]>([])
    const progressWork = useRef<Map<number, ProgressInfo>>(new Map())
    const lastEmitRef = useRef(0)

    /** 提交新的 fragments 视图数组 */
    const commitFragments = useCallback((next: FragmentView[]) => {
        fragmentsWork.current = next
        setFragments(next)
    }, [])

    /** 更新单个分片的视图状态 */
    const updateView = useCallback((index: number, patch: Partial<FragmentView>) => {
        const next = fragmentsWork.current.map(v =>
            v.index === index ? { ...v, ...patch } : v
        )
        commitFragments(next)
    }, [commitFragments])

    /** 更新单个分片进度（高频，只更新 Map + tick） */
    const updateProgress = useCallback((index: number, received: number, total: number) => {
        const m = new Map(progressWork.current)
        m.set(index, { receivedLength: received, contentLength: total })
        progressWork.current = m
        setProgress(m)
        setTick(t => t + 1)
    }, [])

    /** 触发分片格子刷新（与 updateProgress 类似但更轻） */
    const touchTick = useCallback(() => {
        setTick(t => t + 1)
    }, [])

    /** 更新标签页标题：文件名前缀 + 进度文本，便于多个下载标签页相互区分 */
    const setDocTitle = useCallback((progressText: string) => {
        document.title = fileTitleRef.current
            ? `${fileTitleRef.current} - ${progressText}`
            : progressText
    }, [])

    /** 绑定 Downloader 事件（每次创建新实例时调用） */
    const bindEvents = useCallback((down: Downloader) => {
        // 单分片进度事件
        down.on("itemProgress", (fragment: any, completed: boolean, receivedLength: number, contentLength: number) => {
            // 通过 lastEmit 限制 React 状态更新频率，避免每 chunk 都重渲染
            if (Date.now() - lastEmitRef.current >= 100 && !completed) {
                updateProgress(fragment.index, receivedLength, contentLength)
                // 单分片任务时把进度也写到 document.title
                if (down.total === 1) {
                    const title = contentLength
                        ? `${byteToSizeLocal(receivedLength)} / ${byteToSizeLocal(contentLength)}`
                        : `${byteToSizeLocal(receivedLength)}`
                    setDocTitle(title)
                }
                lastEmitRef.current = Date.now()
            }
            // 广播进度给 popup（requestId 对应资源，index 对应分片）
            broadcastProgress({
                type: "progress",
                requestId: fragment.requestId,
                index: fragment.index,
                received: receivedLength,
                total: contentLength,
                success: down.success,
                totalCount: down.total,
                running: down.running
            })
        })

        // 单分片下载完成事件
        down.on("completed", (buffer: ArrayBuffer, fragment: any) => {
            updateView(fragment.index, {
                state: "success",
                contentType: fragment.contentType
            })
            // 进度条满
            updateProgress(fragment.index, 1, 1)
            setDocTitle(`${down.success}/${down.total}`)
            setSuccess(down.success)
            setRunning(down.running)
            touchTick()
            // 广播分片完成（成功）
            broadcastProgress({
                type: "completed",
                requestId: fragment.requestId,
                index: fragment.index,
                success: down.success,
                totalCount: down.total
            })

            // 是流式下载 关闭写入器
            if (fragment.fileStream) {
                fragment.fileStream.close()
                fragment.fileStream = null
                return
            }

            const cfg = configRef.current
            // 转为 blob
            const blob = ArrayBufferToBlob(buffer, { type: fragment.contentType })

            // 发送到 ffmpeg
            if (cfg.ffmpeg) {
                sendFile(cfg.ffmpeg, blob, fragment, cfg.ffmpeg, cfg.tabId, cfg.taskId, down.total)
                updateView(fragment.index, { error: i18n.sendFfmpeg })
                return
            }

            // 直接下载
            updateView(fragment.index, { error: i18n.saving })
            chrome.downloads.download({
                url: URL.createObjectURL(blob),
                filename: fragment.downFileName,
                saveAs: G.saveAs
            }, function (downloadId: number) {
                fragment.downId = downloadId
                updateView(fragment.index, { downId: downloadId })
            })
        })

        // 全部下载完成事件
        down.on("allCompleted", () => {
            setDownState("done")
            setRunning(0)
            touchTick()
            // 流式下载（全部 fileStream）无需走 chrome.downloads，直接广播完成
            // 注意：条件为「所有分片均为 fileStream」，与 onChanged 的非流式广播路径互斥
            if (down.fragments.every((item: any) => item.fileStream && fragmentsWork.current.find(v => v.index === item.index)?.state === "success")) {
                broadcastProgress({ type: "complete", requestId: down.fragments[0]?.requestId })
            }
            // 检查自动关闭（所有分片成功且 autoClose 勾选）
            if (autoClose && down.success === down.total) {
                setTimeout(() => {
                    closeTab()
                }, Math.ceil(Math.random() * 999))
            }
        })

        // 错误处理
        down.on("downloadError", (fragment: any, error: any) => {
            // 添加 range 请求头 重新尝试下载
            if (!fragment.retry?.Range && error?.cause === "HTTPError") {
                fragment.retry = { Range: "bytes=0-" }
                down.stop(fragment.index)
                down.downloader(fragment)
                return
            }
            // 添加 sec-fetch 再次尝试下载
            if (!fragment.retry?.sec && error?.cause === "HTTPError") {
                fragment.retry.sec = true
                if (!fragment.requestHeaders) { fragment.requestHeaders = {} }
                fragment.requestHeaders = {
                    ...fragment.requestHeaders,
                    "sec-fetch-mode": "no-cors",
                    "sec-fetch-site": "same-site"
                }
                setHeaders(fragment, () => {
                    down.stop(fragment.index)
                    down.downloader(fragment)
                }, configRef.current.tabId)
                return
            }
            updateView(fragment.index, {
                state: "error",
                error: String(error)
            })
            touchTick()
            // 高亮当前标签
            if (configRef.current.tabId) {
                chrome.tabs.highlight({ tabs: configRef.current.tabId })
            }
            // 广播分片失败
            broadcastProgress({
                type: "error",
                requestId: fragment.requestId,
                index: fragment.index,
                error: String(error),
                success: down.success,
                totalCount: down.total
            })
            setSuccess(down.success)
        })

        // 下载开始事件：存在 range 重下标记则添加 range 请求头
        down.on("start", (fragment: any, options: any) => {
            if (fragment.retry) {
                options.headers = fragment.retry
                options.cache = "no-cache"
            }
            updateView(fragment.index, { state: "running" })
            setRunning(down.running)
        })

        // 停止事件（abort 触发）
        down.on("stop", (fragment: any) => {
            updateView(fragment.index, { state: "stopped" })
            setRunning(down.running)
        })
    }, [autoClose, updateProgress, updateView, touchTick, setDocTitle])

    /** 初始化下载器并启动下载 */
    const startWithData = useCallback((
        data: any[],
        config: { downStream?: boolean | string; ffmpeg?: string; tabId?: number }
    ) => {
        // 保存配置
        const downStreamBool = config.downStream === true || config.downStream === "true" || (config.downStream == null && G.downStream)
        configRef.current = {
            downStream: downStreamBool,
            ffmpeg: config.ffmpeg || "",
            tabId: config.tabId || 0,
            taskId: Date.now()
        }
        // streamSaver.mitm
        try {
            // @ts-ignore streamSaver 全局
            streamSaver.mitm = G.streamSaverConfig.url
        } catch (e) { /* streamSaver 未加载 */ }

        // 创建 Downloader 实例
        const down = new Downloader(data, G.M3u8Thread || 6)
        downRef.current = down
        bindEvents(down)

        // 给每个分片初始化 fileStream（流式下载）
        const views: FragmentView[] = []
        down.fragments.forEach((fragment: any) => {
            if (!fragment.downFileName) {
                fragment.downFileName = getUrlFileName(fragment.url)
            }
            // 流式下载：开启 fileStream（ffmpeg 模式不开）
            if (downStreamBool && !configRef.current.ffmpeg) {
                try {
                    fragment.fileStream = createWriteStream(fragment.downFileName)
                } catch (e) { /* streamSaver 未加载 */ }
            }
            views.push(toView(fragment, !!fragment.fileStream))
        })
        commitFragments(views)
        setTotal(down.total)
        setSuccess(0)
        setRunning(0)
        setDownState("waiting")
        setAutoClose(G.downAutoClose)
        // 页面级文件名：取首个分片的 downFileName（顶部展示 + 标签页标题前缀）
        const pageFileName = views[0]?.downFileName || ""
        fileTitleRef.current = pageFileName
        setFileTitle(pageFileName)

        // 启动下载
        down.start()
        setDocTitle(`${down.success}/${down.total}`)
    }, [bindEvents, commitFragments, setDocTitle])

    /** 仅启动下载（已初始化过） */
    const start = useCallback(() => {
        const down = downRef.current
        if (!down) { return }
        down.start()
    }, [])

    /** 停止单个分片 */
    const stopFragment = useCallback((index: number) => {
        const down = downRef.current
        if (!down) { return }
        down.stop(index)
        const v = fragmentsWork.current.find(f => f.index === index)
        if (v?.raw?.fileStream) {
            v.raw.fileStream.close()
            v.raw.fileStream = null
        }
        updateView(index, { state: "stopped" })
    }, [updateView])

    /** 重试单个分片 */
    const retryFragment = useCallback((index: number) => {
        const down = downRef.current
        if (!down) { return }
        const v = fragmentsWork.current.find(f => f.index === index)
        if (!v) { return }
        // 流式下载：重建 fileStream
        if (v.isStreaming && !v.raw.fileStream) {
            try {
                v.raw.fileStream = createWriteStream(v.downFileName)
            } catch (e) { /* streamSaver 未加载 */ }
        }
        down.state = "waiting"
        down.downloader(v.raw)
        updateView(index, { state: "running" })
    }, [updateView])

    /** 发送分片 buffer 到在线 FFmpeg */
    const sendFFmpeg = useCallback((index: number) => {
        const down = downRef.current
        if (!down) { return }
        const fragment = down.fragments[index]
        if (!fragment) { return }
        const buffer = down.buffer[index]
        if (!buffer) {
            updateView(index, { error: i18n.dataFetchFailed })
            return
        }
        const cfg = configRef.current
        if (cfg.ffmpeg) {
            sendFile("merge", buffer, fragment, cfg.ffmpeg, cfg.tabId, cfg.taskId, down.total)
            updateView(index, { error: i18n.sendFfmpeg })
        } else {
            // 没启用 ffmpeg，主动打开 ffmpeg 页面并发送
            const ffmpegUrl = G.ffmpegConfig.url
            sendFile("merge", buffer, fragment, ffmpegUrl, cfg.tabId, cfg.taskId, down.total)
            updateView(index, { error: i18n.sendFfmpeg })
        }
    }, [updateView])

    /** 停止所有分片 */
    const stopAll = useCallback(() => {
        const down = downRef.current
        if (!down) { return }
        down.stop()
        // 更新视图：所有非成功分片标记为已停止
        const next = fragmentsWork.current.map(v => {
            if (v.state === "success") { return v }
            if (v.raw?.fileStream) {
                v.raw.fileStream.close()
                v.raw.fileStream = null
            }
            return { ...v, state: "stopped" as const }
        })
        commitFragments(next)
        setRunning(0)
        setDownState("abort")
    }, [commitFragments])

    /** 打开下载目录 */
    const openDir = useCallback(() => {
        const down = downRef.current
        if (!down) { return }
        const first = down.fragments.find((f: any) => f.downId)
        if (first) {
            chrome.downloads.show(first.downId)
            return
        }
        chrome.downloads.showDefaultFolder()
    }, [])

    /** 外部新增分片（catDownload 消息） */
    const addFragment = useCallback((fragment: any) => {
        const down = downRef.current
        if (!down) { return }
        // 已存在则跳过
        if (down.fragments.find((f: any) => f.requestId === fragment.requestId)) {
            return
        }
        down.push(fragment)
        const view = toView(fragment, false)
        const next = [...fragmentsWork.current, view]
        commitFragments(next)
        setTotal(down.total)
        // 正在运行的下载任务小于线程数 则开始下载
        if (down.running < down.thread) {
            down.downloader()
        }
    }, [commitFragments])

    /** 监听 chrome.downloads.onChanged：下载完成关闭窗口 */
    useEffect(() => {
        if (!chrome.downloads?.onChanged) { return }
        const listener = (delta: any) => {
            if (!delta.state || delta.state.current !== "complete") { return }
            const down = downRef.current
            if (!down) { return }
            const fragment = down.fragments.find((f: any) => f.downId === delta.id)
            if (!fragment) { return }
            down.buffer[fragment.index] = null
            updateView(fragment.index, { error: i18n.downloadComplete })
            // 全部完成：广播 + 自动关闭
            if (down.success === down.total) {
                setDocTitle(i18n.downloadComplete)
                broadcastProgress({ type: "complete", requestId: down.fragments[0]?.requestId })
                if (autoClose) {
                    setTimeout(() => closeTab(), 300)
                }
            }
        }
        chrome.downloads.onChanged.addListener(listener)
        return () => chrome.downloads.onChanged.removeListener(listener)
    }, [autoClose, updateView, setDocTitle])

    /** 监听外部消息：catDownload（追加任务）/ catCatchFFmpegResult（ffmpeg 发送结果） */
    useEffect(() => {
        const listener = (msg: any, sender: any, sendResponse: (r: any) => void) => {
            if (!msg?.Message) { return }
            // 外部添加下载任务
            if (msg.Message === "catDownload" && msg.data && Array.isArray(msg.data)) {
                // ffmpeg 任务不允许添加新任务
                if (configRef.current.ffmpeg) {
                    sendResponse({ message: "FFmpeg", tabId: configRef.current.tabId })
                    return
                }
                setHeaders(msg.data, () => {
                    for (const fragment of msg.data) {
                        addFragment(fragment)
                        // 数据储存到 localStorage
                        try {
                            const stored = localStorage.getItem("downloadData")
                            const arr = stored ? JSON.parse(stored) : []
                            arr.push(fragment)
                            localStorage.setItem("downloadData", JSON.stringify(arr))
                        } catch (e) { /* localStorage 不可用 */ }
                    }
                }, configRef.current.tabId)
                sendResponse({ message: "OK", tabId: configRef.current.tabId })
                return
            }
            // 在线 ffmpeg 返回结果
            if (
                msg.Message === "catCatchFFmpegResult" &&
                msg.state === "ok" &&
                configRef.current.tabId !== 0 &&
                msg.tabId === configRef.current.tabId
            ) {
                const idx = msg.index
                if (idx != null) {
                    updateView(idx, { error: i18n.hasSent })
                    const down = downRef.current
                    if (down) { down.buffer[idx] = null }
                }
                // 全部发送完成 检查自动关闭
                const down = downRef.current
                if (down && down.success === down.total && autoClose) {
                    setTimeout(() => closeTab(), Math.ceil(Math.random() * 999))
                }
            }
        }
        chrome.runtime.onMessage.addListener(listener)
        return () => chrome.runtime.onMessage.removeListener(listener)
    }, [addFragment, autoClose, updateView])

    /** 页面卸载前关闭所有未完成的下载流 */
    useEffect(() => {
        const onUnload = (e: BeforeUnloadEvent) => {
            const down = downRef.current
            if (!down) { return }
            const streams = down.fragments.filter((f: any) => f.fileStream)
            if (streams.length) {
                e.preventDefault()
                streams.forEach((f: any) => f.fileStream.close())
            }
        }
        window.addEventListener("beforeunload", onUnload)
        return () => window.removeEventListener("beforeunload", onUnload)
    }, [])

    const value: DownloaderStoreValue = {
        fragments,
        progress,
        total,
        success,
        running,
        state: downState,
        tick,
        autoClose,
        setAutoClose,
        fileTitle,
        startWithData,
        start,
        stopFragment,
        retryFragment,
        sendFFmpeg,
        stopAll,
        openDir,
        addFragment
    }

    return (
        <DownloaderStoreContext.Provider value={value}>
            {props.children}
        </DownloaderStoreContext.Provider>
    )
}

/** 获取 downloader store */
export function useDownloaderStore(): DownloaderStoreValue {
    const ctx = useContext(DownloaderStoreContext)
    if (!ctx) { throw new Error("useDownloaderStore 必须在 DownloaderStoreProvider 内使用") }
    return ctx
}

/** 内联 byteToSize：避免循环依赖（function.ts 已导出，但为减少模块耦合此处内联） */
function byteToSizeLocal(byte: number): string {
    if (!byte || byte < 1024) { return String(byte || 0) }
    if (byte < 1024 * 1024) {
        return (byte / 1024).toFixed(1) + "KB"
    } else if (byte < 1024 * 1024 * 1024) {
        return (byte / 1024 / 1024).toFixed(1) + "MB"
    } else {
        return (byte / 1024 / 1024 / 1024).toFixed(1) + "GB"
    }
}
