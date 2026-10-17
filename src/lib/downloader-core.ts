// @ts-nocheck
/**
 * Downloader 核心：纯逻辑（不依赖 DOM）
 * 迁移自 js/m3u8.downloader.js 的 Downloader 类
 *
 * 负责：
 * - 维护分片列表与下载状态
 * - 多线程并发下载（线程数可配置）
 * - 事件总线（itemProgress / completed / allCompleted / downloadError / start / stop 等）
 * - 流式下载（streamSaver 写入器）支持
 * - 单分片停止 / 重试
 * - 解密 / 转码钩子（可选）
 */

// streamSaver：npm 包，用于流式下载（边下边存）
import * as streamSaver from "streamsaver"
// G：全局配置（streamSaverConfig.url 等）
import { G } from "./init"

/**
 * 下载器核心类
 * 不直接操作 DOM，仅通过事件回调通知外部；
 * 调用方需自行把事件转交给 React 视图层。
 */
export class Downloader {
    /** 切片列表（每条带 index 字段） */
    public fragments: any[]
    /** 原始切片列表备份（用于 range 切片后还原等） */
    public allFragments: any[]
    /** 并发线程数 */
    public thread: number
    /** 事件总线 */
    public events: Record<string, Array<(...args: any[]) => void>>
    /** 解密函数（可选） */
    public decrypt: ((buffer: ArrayBuffer, fragment: any) => ArrayBuffer | Promise<ArrayBuffer>) | null
    /** 转码函数（可选） */
    public transcode: ((buffer: ArrayBuffer, fragment: any) => ArrayBuffer | Promise<ArrayBuffer>) | null
    /** 当前任务索引（顺序下载模式递增） */
    public index: number
    /** 已下载 buffer（按 fragment.index 索引） */
    public buffer: (ArrayBuffer | null)[]
    /** 下载器状态：waiting | running | done | abort */
    public state: 'waiting' | 'running' | 'done' | 'abort' | string
    /** 成功下载数量 */
    public success: number
    /** 下载错误分片集合 */
    public errorList: Set<any>
    /** 已下载 buffer 大小（字节） */
    public buffersize: number
    /** 已下载分片时长合计 */
    public duration: number
    /** 顺序推送索引（用于 sequentialPush） */
    public pushIndex: number
    /** 中断控制器（按 fragment.index 索引） */
    public controller: AbortController[]
    /** 正在运行的下载数 */
    public running: number
    /** 切片数组内部存储（setter/getter 包装自动加 index） */
    private _fragments: any[]

    /**
     * 构造下载器
     * @param fragments 切片数组（每条至少需含 url）
     * @param thread 并发线程数，默认 6
     */
    constructor(fragments: any[] = [], thread: number = 6) {
        this.fragments = fragments      // setter 会自动加 index
        this.allFragments = fragments   // 原始列表备份
        this.thread = thread
        this.events = {}
        this.decrypt = null
        this.transcode = null
        this.init()
    }

    /**
     * 初始化/重置所有运行时变量
     * 保留 fragments 与事件监听不动
     */
    public init(): void {
        this.index = 0
        this.buffer = []
        this.state = 'waiting'
        this.success = 0
        this.errorList = new Set()
        this.buffersize = 0
        this.duration = 0
        this.pushIndex = 0
        this.controller = []
        this.running = 0
    }

    /**
     * 设置事件监听
     * @param eventName 监听名（itemProgress / completed / allCompleted / downloadError / start / stop / error / sequentialPush / rawBuffer / decryptedData）
     * @param callBack 回调函数
     */
    public on(eventName: string, callBack: (...args: any[]) => void): void {
        if (this.events[eventName]) {
            this.events[eventName].push(callBack)
        } else {
            this.events[eventName] = [callBack]
        }
    }

    /**
     * 触发事件，依次调用所有监听器
     * @param eventName 监听名
     * @param args 任意参数
     */
    public emit(eventName: string, ...args: any[]): void {
        if (this.events[eventName]) {
            this.events[eventName].forEach(callBack => {
                callBack(...args)
            })
        }
    }

    /**
     * 设置解密函数（AES 等场景）
     * @param callback 解密函数
     */
    public setDecrypt(callback: (buffer: ArrayBuffer, fragment: any) => ArrayBuffer | Promise<ArrayBuffer>): void {
        this.decrypt = callback
    }

    /**
     * 设置转码函数
     * @param callback 转码函数
     */
    public setTranscode(callback: (buffer: ArrayBuffer, fragment: any) => ArrayBuffer | Promise<ArrayBuffer>): void {
        this.transcode = callback
    }

    /**
     * 停止下载
     * 不传 index 则停止所有线程并把 state 置为 abort
     * @param index 指定分片索引，则仅中断该分片
     */
    public stop(index?: number): void {
        if (index !== undefined) {
            this.controller[index] && this.controller[index].abort()
            return
        }
        this.controller.forEach(controller => { controller.abort() })
        this.state = 'abort'
    }

    /**
     * 判断分片是否在错误列表内
     * @param fragment 切片对象
     * @returns 是否在错误列表内
     */
    public isErrorItem(fragment: any): boolean {
        return this.errorList.has(fragment)
    }

    /** 获取所有错误分片 */
    public get errorItem(): Set<any> {
        return this.errorList
    }

    /**
     * 按顺序推送已下载 buffer
     * 用于流式合并等场景：每来一个完成事件，按 index 顺序触发 sequentialPush
     */
    public sequentialPush(): void {
        if (!this.events['sequentialPush']) { return }
        for (; this.pushIndex < this.fragments.length; this.pushIndex++) {
            if (this.buffer[this.pushIndex]) {
                this.emit('sequentialPush', this.buffer[this.pushIndex])
                delete this.buffer[this.pushIndex]
                continue
            }
            break
        }
    }

    /**
     * 限定下载范围（在 start 之前调用）
     * @param start 起始索引（含）
     * @param end 结束索引（不含）
     * @returns 是否成功设置范围
     */
    public range(start: number = 0, end: number = this.fragments.length): boolean {
        if (start > end) {
            this.emit('error', 'start > end')
            return false
        }
        if (end > this.fragments.length) {
            this.emit('error', 'end > total')
            return false
        }
        if (start >= this.fragments.length) {
            this.emit('error', 'start >= total')
            return false
        }
        if (start != 0 || end != this.fragments.length) {
            this.fragments = this.fragments.slice(start, end)
            // 更改过下载范围 重新设定 index
            this.fragments.forEach((fragment, index) => {
                fragment.index = index
            })
        }
        // 总数为空 抛出错误
        if (this.fragments.length == 0) {
            this.emit('error', 'List is empty')
            return false
        }
        return true
    }

    /** 获取切片总数量 */
    public get total(): number {
        return this.fragments.length
    }

    /** 获取切片总时长（秒） */
    public get totalDuration(): number {
        return this.fragments.reduce((total, fragment) => total + (fragment.duration ?? 0), 0)
    }

    /**
     * 切片数组的 setter：自动给每条 fragment 加上 index 字段，
     * 以便多线程并发下载后能按 index 顺序保存
     */
    public set fragments(fragments: any[]) {
        this._fragments = fragments.map((fragment, index) => ({ ...fragment, index }))
    }

    /** 切片数组的 getter */
    public get fragments(): any[] {
        return this._fragments
    }

    /**
     * 获取 #EXT-X-MAP 标签的文件 url（m3u8 初始化分片）
     */
    public get mapTag(): string {
        if (this.fragments[0]?.initSegment?.url) {
            return this.fragments[0].initSegment.url
        }
        return ''
    }

    /**
     * 追加一条新分片（运行时新增任务）
     * @param fragment 切片对象
     */
    public push(fragment: any): void {
        fragment.index = this.fragments.length
        this.fragments.push(fragment)
    }

    /**
     * 下载单个分片（fetch + ReadableStream）
     * - 不传 fragment 则按 this.index 顺序取下一条
     * - fragment 为数字时按索引取
     * - 触发 start / itemProgress / completed / downloadError / stop / allCompleted 等事件
     * @param fragment 指定重试的分片对象或索引
     */
    public downloader(fragment: any | number | null = null): void {
        if (this.state === 'abort') { return }
        // 是否直接下载指定对象
        const directDownload = !!fragment

        // 非直接下载对象 从 this.fragments 获取下一条资源 若不存在跳出
        if (!directDownload && !this.fragments[this.index]) { return }

        // fragment 是数字 直接从 this.fragments 获取
        if (typeof fragment === 'number') {
            fragment = this.fragments[fragment]
        }

        // 不存在下载对象 从 fragments 顺序取
        fragment ??= this.fragments[this.index++]
        this.state = 'running'
        this.running++

        // 停止下载控制器
        const controller = new AbortController()
        this.controller[fragment.index] = controller
        const options: RequestInit & { signal?: AbortSignal } = { signal: controller.signal }

        // 下载前触发事件（外部可在此改写 options.headers 等）
        this.emit('start', fragment, options)

        // 存在 byteRange 添加 Range 请求头
        if (fragment.byteRange && fragment.byteRange.length == 2) {
            options.headers = {
                ...(options.headers || {}),
                'Range': `bytes=${fragment.byteRange[0]}-${fragment.byteRange[1] - 1}`
            }
        }

        // 开始下载
        fetch(fragment.url, options)
            .then(response => {
                if (!response.ok) {
                    throw Object.assign(new Error(String(response.status)), { cause: 'HTTPError' })
                }
                const reader = response.body.getReader()
                const contentLength = parseInt(response.headers.get('content-length')) || 0
                fragment.contentType = response.headers.get('content-type') ?? 'null'
                let receivedLength = 0
                const chunks: Uint8Array[] = []
                const pump = async () => {
                    while (true) {
                        const { value, done } = await reader.read()
                        if (done) { break }
                        // 流式下载：fileStream 存在则直接写入文件，否则缓存到 chunks
                        fragment.fileStream ? fragment.fileStream.write(new Uint8Array(value)) : chunks.push(value)
                        receivedLength += value.length
                        this.emit('itemProgress', fragment, false, receivedLength, contentLength, value)
                    }
                    if (fragment.fileStream) {
                        // 流式下载：数据已经写完，返回空 buffer
                        return new ArrayBuffer()
                    }
                    // 合并所有 chunk 为单个 Uint8Array
                    const allChunks = new Uint8Array(receivedLength)
                    let position = 0
                    for (const chunk of chunks) {
                        allChunks.set(chunk, position)
                        position += chunk.length
                    }
                    this.emit('itemProgress', fragment, true)
                    return allChunks.buffer
                }
                return pump()
            })
            .then(buffer => {
                this.emit('rawBuffer', buffer, fragment)
                // 存在解密函数 调用解密函数 否则直接返回 buffer
                return this.decrypt ? this.decrypt(buffer, fragment) : buffer
            })
            .then(buffer => {
                this.emit('decryptedData', buffer, fragment)
                // 存在转码函数 调用转码函数 否则直接返回 buffer
                return this.transcode ? this.transcode(buffer, fragment) : buffer
            })
            .then(buffer => {
                // 储存解密/转码后的 buffer
                this.buffer[fragment.index] = buffer

                // 成功数+1 累计 buffer 大小和视频时长
                this.success++
                this.buffersize += buffer.byteLength
                this.duration += fragment.duration ?? 0

                // 下载对象来自错误列表 从错误列表内删除
                this.errorList.has(fragment) && this.errorList.delete(fragment)

                // 推送顺序下载
                this.sequentialPush()

                this.emit('completed', buffer, fragment)

                // 全部下载完成
                if (this.success == this.fragments.length) {
                    this.state = 'done'
                    this.emit('allCompleted', this.buffer, this.fragments)
                }
            }).catch((error) => {
                console.log(error)
                if (error.name == 'AbortError') {
                    this.emit('stop', fragment, error)
                    return
                }
                this.emit('downloadError', fragment, error)
                // 储存下载错误切片
                !this.errorList.has(fragment) && this.errorList.add(fragment)
            }).finally(() => {
                this.running--
                // 顺序下载：下载下一个切片
                if (!directDownload && this.index < this.fragments.length) {
                    this.downloader()
                }
            })
    }

    /**
     * 开始下载：准备数据，按线程数开启多个 downloader
     * @param start 下载范围起始索引
     * @param end 下载范围结束索引
     */
    public start(start: number = 0, end: number = this.fragments.length): void {
        // 检查下载器状态
        if (this.state == 'running') {
            this.emit('error', 'state running')
            return
        }
        // 从下载范围内 切出需要下载的部分
        if (!this.range(start, end)) {
            return
        }
        // 初始化变量
        this.init()
        // 开始下载 多少线程开启多少个下载器
        for (let i = 0; i < this.thread && i < this.fragments.length; i++) {
            this.downloader()
        }
    }

    /**
     * 销毁：停止所有线程并清空状态
     */
    public destroy(): void {
        this.stop()
        this._fragments = []
        this.allFragments = []
        this.thread = 6
        this.events = {}
        this.decrypt = null
        this.transcode = null
        this.init()
    }
}

/**
 * 为流式下载创建 streamSaver 写入器
 * @param fileName 落盘文件名
 * @returns streamSaver 的 WritableStream writer
 */
export function createWriteStream(fileName: string): any {
    streamSaver.mitm = G.streamSaverConfig.url
    return streamSaver.createWriteStream(fileName).getWriter()
}
