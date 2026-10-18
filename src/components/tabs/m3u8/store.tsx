// @ts-nocheck
/**
 * M3U8 解析器页面 React 状态管理（多任务版）
 * 迁移自 js/m3u8.js 的全局变量与下载状态
 *
 * 多任务设计：
 * - 页面内可同时承载多个下载任务（tasks 数组），每个任务独立解析/下载/合并
 * - 组件默认读取 activeTask（当前查看的任务），操作动作均作用于 activeTask
 * - popup 通过 m3u8AddTask 消息向本页面追加任务（复用同一页面，不再新开标签）
 * - 每任务的请求头（Referer/Cookie）独立安装为 DNR 会话规则；多任务并发时后装规则优先
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { G, i18n } from "~lib/init";
import { sendMessage } from "~components/shared/api";
import {
  AESDecryptor,
  createStreamSaver,
  downloadM3u8,
  mergeTs,
  m3u8Parser,
  estimateSize,
  GetFileName,
  Base64ToArrayBuffer,
  HexStringToArrayBuffer,
  StringToUint8Array,
  ArrayBufferToBase64,
  ArrayBufferToHexString,
  isHexKey,
  type DownloadOptions,
  type SegmentProgress,
  type ParsedPlaylist,
  defaultDownloadOptions,
  M3u8Downloader
} from "~lib/m3u8-parser";
import { broadcastProgress } from "~lib/broadcast";

/** 下载阶段 */
export type DownloadState =
  | "idle"
  | "queued"
  | "parsing"
  | "parsed"
  | "downloading"
  | "paused"
  | "merging"
  | "complete"
  | "error";

/** 任务级并发上限：同时下载的任务数，超出自动排队（终态后依次启动 queued 任务） */
const MAX_PARALLEL_TASKS = 20;

/** 任务进度聚合 */
interface TaskProgress {
  success: number;
  total: number;
  percent: number;
  buffersize: number;
  duration: number;
}

/** 任务运行时资源（可变引用，不触发渲染） */
interface TaskRuntime {
  /** 该任务的分片下载器实例 */
  down: M3u8Downloader | null;
  /** 流式下载写入器（streamSaver） */
  fileStream?: any;
  /** AES 解密器 */
  decryptor: AESDecryptor;
  /** fMP4 初始化段缓存（key = 分片 url） */
  initData: Map<string, any>;
  /** 解密密钥缓存（key = 密钥 url） */
  keyContent: Map<string, any>;
  /** 下载上下文（forceMerge 合并时需要复用） */
  ctx: any;
  /** 该任务 autoDown 是否已启动过 */
  autoDownStarted: boolean;
  /** 该任务的 DNR 请求头规则 id */
  dnrRuleId?: number;
}

/** 单个下载任务 */
export interface M3u8Task {
  /** 任务唯一 id */
  id: string;
  /** m3u8 地址 */
  url: string;
  /** 视频标题 */
  title?: string | null;
  /** 目标文件名（URL 参数） */
  fileName?: string | null;
  /** 嗅探来源页 tabId */
  tabId?: number;
  /** 来源页 origin */
  initiator?: string | null;
  /** 嗅探到的请求头 */
  requestHeaders: any;
  /** 嗅探 requestId（side panel 进度对应） */
  requestId?: string | null;
  /** 在线 ffmpeg 参数 */
  ffmpeg?: string | null;
  /** ffmpeg 任务 id */
  taskId?: string | null;
  /** ffmpeg 任务总数 */
  quantity?: string | null;
  /** 解析完成后自动开始下载 */
  autoDown?: boolean;
  state: DownloadState;
  playlist: ParsedPlaylist | null;
  segments: SegmentProgress[];
  progress: TaskProgress;
  options: DownloadOptions;
  tips: string;
  keyInfo: {
    method: string;
    keyUrl: string;
    keyHex: string;
    keyBase64: string;
    iv: string;
  } | null;
  possibleKeys: string[];
  runtime: TaskRuntime;
}

/** 新任务参数（URL 参数与 m3u8AddTask 消息共用） */
export interface TaskParams {
  url?: string;
  title?: string | null;
  fileName?: string | null;
  tabId?: number;
  initiator?: string | null;
  requestHeaders?: any;
  requestId?: string | null;
  ffmpeg?: string | null;
  taskId?: string | null;
  quantity?: string | null;
  autoDown?: boolean;
  autoClose?: boolean;
}

interface StoreValue {
  ready: boolean;
  /** 任务列表（任务栏渲染） */
  tasks: M3u8Task[];
  /** 当前查看的任务 id */
  activeTaskId: string | null;
  setActiveTaskId: (id: string) => void;
  /** 追加任务并自动解析（m3u8AddTask 消息入口），返回任务 id */
  addTask: (params: TaskParams) => Promise<string>;
  /** 关闭并移除任务（下载中先停止，同时移除其请求头规则） */
  closeTask: (id: string) => void;
  /** 清空：停止并关闭全部任务（不联动侧边栏） */
  closeAllTasks: () => void;
  // —— 以下均为 activeTask 视图（无任务时为空默认值）——
  playlist: ParsedPlaylist | null;
  segments: SegmentProgress[];
  progress: TaskProgress;
  downloadState: DownloadState;
  options: DownloadOptions;
  tips: string;
  keyInfo: {
    method: string;
    keyUrl: string;
    keyHex: string;
    keyBase64: string;
    iv: string;
  } | null;
  possibleKeys: string[];
  updateOptions: (patch: Partial<DownloadOptions>) => void;
  parseUrl: (url: string, requestHeaders?: any) => Promise<void>;
  parseText: (text: string, baseUrl?: string) => Promise<void>;
  startDownload: () => Promise<void>;
  stopDownload: () => void;
  /** 切换任务暂停/继续（按 id）：下载中→暂停、已暂停→继续；侧边栏广播同步 */
  togglePauseTask: (id: string) => void;
  /** 停止所有进行中的任务（下载中/合并中） */
  stopAllDownload: () => void;
  retrySegment: (index: number) => void;
  /** 一键重试所有失败分片 */
  retryAllErrors: () => void;
  /** 强制合并：跳过失败分片，用已下载完成的 buffer 合并输出 */
  forceMerge: () => void;
  /** 最终保存的文件名（含扩展名，与 mergeTs 计算逻辑一致） */
  displayFileName: string;
  setKeyInfo: (info: any) => void;
  addPossibleKey: (key: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** DNR 规则 id 基数（避开 setRequestHeaders 等调用方使用的 tabId 值域） */
const DNR_BASE = 200000;

/** 计算任务最终保存的文件名（含扩展名）
 * 规则与 mergeTs 保持一致：customFilename > URL 参数 filename > m3u8 url 提取；
 * 文件名自带合法扩展名时直接沿用，否则 mp4/ffmpeg → mp4、其余从首分片 URL 推断
 * （任务列表卡片复用此函数显示每个任务的文件名）
 */
export function computeFileName(task: M3u8Task): string {
  let name =
    task.options.customFilename || task.fileName || GetFileName(task.url || "");
  if (!name) {
    return "";
  }
  // ffmpeg 合并/转码任务最终由 ffmpeg 产出 mp4（mergeTs 的 ffmpeg 分支固定拼 .mp4）
  const ffmpegOut = !!(task.options.mp4 || task.options.ffmpeg || task.ffmpeg);
  // 文件名自带 1-4 位字母数字扩展名：直接沿用（与 mergeTs 的 originalExt 优先逻辑一致）
  if (/\.[a-zA-Z0-9]{1,4}$/.test(name) && !ffmpegOut) {
    return name;
  }
  // 去掉原有扩展名（mergeTs 会重新拼接）
  if (/\.[a-zA-Z0-9]{1,4}$/.test(name)) {
    name = name.split(".").slice(0, -1).join(".");
  }
  // 扩展名：mp4 转码 / ffmpeg 场景为 mp4，否则取 initSegment 或首分片 url 的扩展名
  let ext = "ts";
  if (ffmpegOut) {
    ext = "mp4";
  } else {
    const first: any = task.playlist?.fragments?.[0];
    const extUrl =
      first?.initSegment?.url && !first.initSegment.url.startsWith("data:")
        ? first.initSegment.url
        : first?.url || "";
    const candidate = extUrl
      .split("/")
      .pop()
      ?.split("?")
      .shift()
      ?.split(".")
      .pop();
    if (candidate) {
      ext = candidate;
    }
  }
  return `${name}.${ext}`;
}

/** M3U8 Store Provider：封装多任务解析/下载/状态管理 */
export function M3u8StoreProvider(props: {
  url?: string | null;
  requestHeaders?: any;
  requestId?: string | null;
  title?: string | null;
  fileName?: string | null;
  tabId?: number;
  initiator?: string | null;
  ffmpeg?: string | null;
  taskId?: string | null;
  quantity?: string | null;
  autoDown?: boolean;
  autoClose?: boolean;
  children: React.ReactNode;
}) {
  const {
    url,
    requestHeaders = {},
    requestId,
    title,
    fileName,
    tabId,
    initiator,
    ffmpeg,
    taskId,
    quantity,
    autoDown,
    autoClose
  } = props;

  const [ready, setReady] = useState(false);
  /** 任务列表 */
  const [tasks, setTasks] = useState<M3u8Task[]>([]);
  /** 当前查看的任务 id */
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // —— refs：供事件回调/消息监听读取最新值 ——
  const tasksRef = useRef<M3u8Task[]>([]);
  /** 任务调度器引用：startTaskDownload 的终态钩子通过它触发排队调度（避免 useCallback 循环依赖） */
  const dispatchRef = useRef<(() => void) | null>(null);
  tasksRef.current = tasks;
  const activeTaskIdRef = useRef<string | null>(null);
  activeTaskIdRef.current = activeTaskId;
  /** 任务 id / DNR 规则 id 计数器 */
  const taskSeq = useRef(0);
  const dnrSeq = useRef(0);
  /** 本扩展页面自身的 tabId（DNR 规则条件用） */
  const pageTabIdRef = useRef<number | null>(null);

  /** 等待 G 初始化完成 */
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (G.initSyncComplete && G.initLocalComplete) {
        clearInterval(timer);
        setReady(true);
      }
    }, 0);
    return () => clearInterval(timer);
  }, []);

  /** 获取扩展页面自身 tabId（DNR 规则条件用） */
  useEffect(() => {
    chrome.tabs.getCurrent(tab => {
      pageTabIdRef.current = tab?.id ?? null;
    });
  }, []);

  /** 创建空任务对象（含默认 options 与独立运行时资源） */
  const createTask = useCallback((params: TaskParams): M3u8Task => {
    taskSeq.current += 1;
    return {
      id: `t${Date.now()}_${taskSeq.current}`,
      url: params.url || "",
      title: params.title,
      fileName: params.fileName,
      tabId: params.tabId,
      initiator: params.initiator,
      requestHeaders: params.requestHeaders ?? {},
      requestId: params.requestId,
      ffmpeg: params.ffmpeg,
      taskId: params.taskId,
      quantity: params.quantity,
      autoDown: params.autoDown,
      state: "idle",
      playlist: null,
      segments: [],
      progress: {
        success: 0,
        total: 0,
        percent: 0,
        buffersize: 0,
        duration: 0
      },
      options: {
        ...defaultDownloadOptions,
        threads: G.M3u8Thread ?? 6,
        mp4: G.M3u8Mp4 ?? false,
        onlyAudio: G.M3u8OnlyAudio ?? false,
        skipDecrypt: G.M3u8SkipDecrypt ?? false,
        streamSaver: G.M3u8StreamSaver ?? false,
        ffmpeg: G.M3u8Ffmpeg ?? false,
        autoClose: params.autoClose ? true : G.M3u8AutoClose ?? false
      },
      tips: "",
      keyInfo: null,
      possibleKeys: [],
      runtime: {
        down: null,
        decryptor: new AESDecryptor(),
        initData: new Map(),
        keyContent: new Map(),
        ctx: undefined,
        autoDownStarted: false
      }
    };
  }, []);

  /** 更新任务（不可变） */
  const updateTask = useCallback(
    (
      id: string,
      patch:
        | Partial<M3u8Task>
        | ((t: M3u8Task) => Partial<M3u8Task>)
    ) => {
      setTasks(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) }
            : t
        )
      );
    },
    []
  );

  /** 更新任务单个分片（不可变） */
  const updateTaskSegment = useCallback(
    (id: string, index: number, patch: Partial<SegmentProgress>) => {
      setTasks(prev =>
        prev.map(t => {
          if (t.id !== id) {
            return t;
          }
          const segs = [...t.segments];
          const cur =
            segs[index] ??
            { index, state: "pending", received: 0, total: 0, retryCount: 0 };
          segs[index] = { ...cur, ...patch };
          return { ...t, segments: segs };
        })
      );
    },
    []
  );

  /** 为任务安装请求头会话规则（Referer/Cookie 属 forbidden header，fetch 无法直接设置） */
  const addTaskHeadersRule = useCallback(
    (task: M3u8Task, callback: () => void) => {
      const data = task.requestHeaders ?? {};
      if (!Object.keys(data).length) {
        callback();
        return;
      }
      dnrSeq.current += 1;
      const ruleId = DNR_BASE + dnrSeq.current;
      task.runtime.dnrRuleId = ruleId;
      const condition: any = {
        resourceTypes: ["xmlhttprequest", "media", "image"]
      };
      if (pageTabIdRef.current != null) {
        condition.tabIds = [pageTabIdRef.current];
      } else {
        // 无 tab（sidepanel 场景）：限定扩展自身发起的请求（chrome 101+ / firefox 113+）
        if (G.version < 101 || (G.isFirefox && G.version < 113)) {
          callback();
          return;
        }
        condition.initiatorDomains = [
          new URL(chrome.runtime.getURL("")).hostname
        ];
      }
      chrome.declarativeNetRequest.updateSessionRules(
        {
          addRules: [
            {
              id: ruleId,
              priority: dnrSeq.current,
              action: {
                type: "modifyHeaders",
                requestHeaders: Object.keys(data).map(key => ({
                  header: key,
                  operation: "set",
                  value: data[key]
                }))
              },
              condition
            }
          ]
        },
        () => callback()
      );
    },
    []
  );

  /** 移除任务的请求头规则 */
  const removeTaskHeadersRule = useCallback((task: M3u8Task) => {
    if (task.runtime.dnrRuleId == null) {
      return;
    }
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [task.runtime.dnrRuleId]
    });
    task.runtime.dnrRuleId = undefined;
  }, []);

  /** 加载任务 AES 密钥（密钥内容缓存到任务运行时） */
  const loadTaskEncryptionKeys = useCallback(
    async (task: M3u8Task, parsed: ParsedPlaylist) => {
      const keyUrls = new Set<string>();
      parsed.fragments.forEach(f => {
        if (f.decryptdata?.uri) {
          keyUrls.add(f.decryptdata.uri);
        }
      });
      for (const keyUrl of keyUrls) {
        if (task.runtime.keyContent.has(keyUrl)) {
          continue;
        }
        try {
          const resp = await fetch(keyUrl);
          const buffer = await resp.arrayBuffer();
          if (buffer.byteLength === 16) {
            task.runtime.keyContent.set(keyUrl, buffer);
            const firstFragment = parsed.fragments.find(
              f => f.decryptdata?.uri === keyUrl
            );
            if (firstFragment) {
              updateTask(task.id, {
                keyInfo: {
                  method: firstFragment.decryptdata.method || "NONE",
                  keyUrl,
                  keyHex: ArrayBufferToHexString(buffer),
                  keyBase64: ArrayBufferToBase64(buffer),
                  iv: firstFragment.decryptdata.iv
                    ? "0x" +
                      ArrayBufferToHexString(firstFragment.decryptdata.iv.buffer)
                    : ""
                }
              });
            }
          }
        } catch (e) {
          updateTask(task.id, { tips: "Key download failed" });
        }
      }
    },
    [updateTask]
  );

  /** 解析任务的 m3u8 文本内容 */
  const parseTaskText = useCallback(
    async (task: M3u8Task, text: string, baseUrlVal: string) => {
      updateTask(task.id, { state: "parsing" });
      try {
        const result = m3u8Parser(text, baseUrlVal);
        const totalDuration = result.totalDuration;
        let estimateFileSize = 0;
        if (!result.live && result.fragments.length > 0) {
          estimateFileSize = await estimateSize(result.fragments, {});
        }
        const parsed: ParsedPlaylist = {
          fragments: result.fragments,
          m3u8Content: text,
          totalDuration,
          isEncrypted: result.isEncrypted,
          isSampleAES: result.isSampleAES,
          live: result.live,
          levels: [],
          audioTracks: [],
          subtitleTracks: [],
          url: baseUrlVal,
          currentLevel: -1,
          estimateFileSize
        };
        // 初始化分片状态
        const initSegs: SegmentProgress[] = parsed.fragments.map((f, i) => ({
          index: i,
          state: "pending",
          received: 0,
          total: 0,
          url: f.url,
          retryCount: 0
        }));
        updateTask(task.id, {
          playlist: parsed,
          segments: initSegs,
          state: "parsed"
        });
        // 加载加密密钥
        if (parsed.isEncrypted) {
          await loadTaskEncryptionKeys(task, parsed);
        }
      } catch (e: any) {
        updateTask(task.id, { state: "error", tips: String(e?.message ?? e) });
      }
    },
    [updateTask, loadTaskEncryptionKeys]
  );

  /** 拉取并解析任务的 m3u8（安装该任务的请求头规则后 fetch） */
  const parseTaskUrl = useCallback(
    async (task: M3u8Task, m3u8Url: string) => {
      updateTask(task.id, { state: "parsing", tips: "" });
      try {
        // 先安装该任务的请求头规则（保持到任务结束），再发起解析请求
        await new Promise<void>(resolve => addTaskHeadersRule(task, resolve));
        const resp = await fetch(m3u8Url, {
          headers: task.requestHeaders ?? {}
        });
        if (!resp.ok) {
          // 非 2xx 响应（如 403 空响应）直接抛错，避免把空正文静默解析成「0 个文件」
          throw new Error(`HTTP ${resp.status}`);
        }
        const text = await resp.text();
        await parseTaskText(task, text, m3u8Url);
      } catch (e: any) {
        updateTask(task.id, { state: "error", tips: String(e?.message ?? e) });
      }
    },
    [addTaskHeadersRule, parseTaskText, updateTask]
  );

  /** 启动指定任务的下载（自定义密钥/IV/流式等以任务自身 options 为准） */
  const startTaskDownload = useCallback(
    async (task: M3u8Task) => {
      const playlist = task.playlist;
      const options = task.options;
      const rt = task.runtime;
      if (!playlist || !playlist.fragments.length) {
        return;
      }
      // 任务级排队：进行中（下载中/合并中）任务达到并发上限时转入排队，终态后自动启动
      const running = tasksRef.current.filter(
        t => t.state === "downloading" || t.state === "merging"
      ).length;
      if (running >= MAX_PARALLEL_TASKS) {
        updateTask(task.id, { state: "queued", tips: "" });
        return;
      }
      updateTask(task.id, { state: "downloading", tips: "" });
      // 下载启动即向侧边栏广播 downloading，资源行按钮立即切换为暂停态
      if (task.requestId) {
        broadcastProgress({
          type: "downloading",
          requestId: task.requestId,
          totalCount: playlist.fragments.length
        });
      }
      try {
        // 处理自定义密钥
        if (options.customKey) {
          let customKey = options.customKey.trim();
          if (isHexKey(customKey)) {
            customKey = HexStringToArrayBuffer(customKey);
          } else if (
            customKey.length === 24 &&
            customKey.slice(-2) === "=="
          ) {
            customKey = Base64ToArrayBuffer(customKey);
          } else if (/^http[s]*:\/\/.+/i.test(customKey)) {
            try {
              const resp = await fetch(customKey);
              customKey = await resp.arrayBuffer();
            } catch {
              updateTask(task.id, { tips: "Key download failed" });
              return;
            }
          } else {
            updateTask(task.id, { tips: "Incorrect key" });
            return;
          }
          rt.keyContent.forEach((_, key) => {
            rt.keyContent.set(key, customKey);
          });
        }
        // 自定义 IV
        if (options.customIV) {
          const iv = StringToUint8Array(options.customIV);
          playlist.fragments.forEach(f => {
            if (f.decryptdata) {
              f.decryptdata.iv = iv;
            }
          });
        }
        // 流式下载
        if (options.streamSaver) {
          rt.fileStream = createStreamSaver(
            playlist.fragments[0].url,
            options.mp4
          );
        }
        const ctx = {
          fragments: playlist.fragments,
          initData: rt.initData,
          keyContent: rt.keyContent,
          decryptor: rt.decryptor,
          skipDecrypt: options.skipDecrypt,
          requestHeaders: task.requestHeaders ?? {},
          requestId: task.requestId ?? undefined,
          title: task.title ?? undefined,
          fileName: task.fileName ?? undefined,
          m3u8Url: task.url ?? undefined,
          ffmpegAction: task.ffmpeg ?? undefined,
          taskId: task.taskId ?? undefined,
          quantity: task.quantity ? parseInt(task.quantity) : undefined,
          isSendFfmpeg: false
        };
        // 保存上下文：forceMerge（跳过失败分片强制合并）时复用
        rt.ctx = ctx;
        const down = await downloadM3u8(ctx, options, {
          onSegmentProgress: p =>
            updateTaskSegment(task.id, p.index, {
              state: "downloading",
              received: p.received,
              total: p.total
            }),
          onSegmentComplete: (index, success, total) => {
            updateTaskSegment(task.id, index, {
              state: "success",
              received: 1,
              total: 1,
              retryCount: 0
            });
            updateTask(task.id, t => ({
              progress: {
                ...t.progress,
                success,
                total,
                percent: total ? Math.floor((success / total) * 100) : 0
              }
            }));
          },
          onSegmentError: (index, error) => {
            updateTaskSegment(task.id, index, { state: "error", error });
          },
          // 自动重试窗口内：分片回到下载中状态并展示重试次数，不标红
          onSegmentRetry: (index, retryCount, maxRetry) => {
            updateTaskSegment(task.id, index, {
              state: "downloading",
              retryCount,
              maxRetry,
              error: undefined
            });
          },
          onAllCompleted: buffer => {
            updateTask(task.id, { state: "merging" });
            if (rt.fileStream) {
              rt.fileStream.close();
              rt.fileStream = undefined;
              updateTask(task.id, { state: "complete" });
              broadcastProgress({
                type: "complete",
                requestId: task.requestId ?? undefined
              });
            } else {
              mergeTs(down, ctx, options);
              updateTask(task.id, { state: "complete" });
            }
            // 释放并发额度：启动排队中的下一个任务
            dispatchRef.current?.();
          },
          onProgress: (success, total, buffersize, duration) => {
            updateTask(task.id, {
              progress: {
                success,
                total,
                buffersize,
                duration,
                percent: total ? Math.floor((success / total) * 100) : 0
              }
            });
            // 分片进度实时广播给侧边栏（资源行按钮三态与进度填充依赖此消息）
            if (task.requestId) {
              broadcastProgress({
                type: "downloading",
                requestId: task.requestId,
                success,
                totalCount: total,
                buffersize
              });
            }
          }
        });
        rt.down = down;
        // 范围处理
        let startIdx = 0;
        let endIdx = playlist.fragments.length;
        if (typeof options.rangeStart === "number") {
          startIdx = Math.max(0, options.rangeStart - 1);
        }
        if (typeof options.rangeEnd === "number" && options.rangeEnd > 0) {
          endIdx = options.rangeEnd;
        }
        down.start(startIdx, endIdx);
      } catch (e: any) {
        updateTask(task.id, { state: "error", tips: String(e?.message ?? e) });
        // 失败释放并发额度：启动排队中的下一个任务
        dispatchRef.current?.();
      }
    },
    [updateTask, updateTaskSegment]
  );

  /** 每任务 autoDown：解析完成且该任务带 autoDown 标记时自动启动下载 */
  useEffect(() => {
    for (const task of tasks) {
      if (
        task.autoDown &&
        !task.runtime.autoDownStarted &&
        task.state === "parsed" &&
        task.playlist?.fragments?.length
      ) {
        task.runtime.autoDownStarted = true;
        startTaskDownload(task);
      }
    }
  }, [tasks, startTaskDownload]);

  /** 任务调度：并发额度未满时按创建顺序启动排队中的任务（渲染后保持最新引用） */
  const dispatchQueuedTasks = () => {
    const list = tasksRef.current;
    const running = list.filter(
      t => t.state === "downloading" || t.state === "merging"
    ).length;
    if (running >= MAX_PARALLEL_TASKS) { return; }
    const next = list.find(t => t.state === "queued");
    if (next) { startTaskDownload(next); }
  };
  dispatchRef.current = dispatchQueuedTasks;

  // 标签页标题汇总：下载中显示「下载中 n · 完成/总数」，否则显示「下载完成 完成/总数」；
  // 无任务时恢复纯页面标题（用户在浏览器标签上即可掌握整体进度）
  useEffect(() => {
    const total = tasks.length;
    if (!total) {
      document.title = String(i18n.titleM3U8 ?? "Cat Catch");
      return;
    }
    const done = tasks.filter(t => t.state === "complete").length;
    const running = tasks.filter(
      t => t.state === "downloading" || t.state === "merging"
    ).length;
    const prefix =
      running > 0
        ? `${i18n.downloadingShort} ${running} · ${done}/${total} - `
        : `${i18n.downloadComplete} ${done}/${total} - `;
    document.title = prefix + String(i18n.titleM3U8 ?? "Cat Catch");
  }, [tasks]);

  /** 首个任务：URL 参数创建（页面直接打开场景） */
  useEffect(() => {
    if (!ready) {
      return;
    }
    if (url) {
      const task = createTask({
        url,
        requestHeaders,
        requestId,
        title,
        fileName,
        tabId,
        initiator,
        ffmpeg,
        taskId,
        quantity,
        autoDown,
        autoClose
      });
      setTasks([task]);
      setActiveTaskId(task.id);
      parseTaskUrl(task, url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /** 追加任务并自动解析（m3u8AddTask 消息入口），返回任务 id */
  const addTask = useCallback(
    async (params: TaskParams): Promise<string> => {
      const task = createTask(params ?? {});
      setTasks(prev => [...prev, task]);
      // 首个任务直接进入详情视图（保持单任务打开即见详情的体验）；
      // 追加任务不切换视图：停留当前页面（列表/正在查看的任务详情），由用户自行点选
      if (tasksRef.current.length === 0) {
        setActiveTaskId(task.id);
      }
      if (task.url) {
        parseTaskUrl(task, task.url);
      } else {
        updateTask(task.id, { state: "parsed" });
      }
      return task.id;
    },
    [createTask, parseTaskUrl, updateTask]
  );

  /** 监听 popup 的追加任务消息 */
  useEffect(() => {
    const listener = (
      msg: any,
      sender: any,
      sendResponse: (resp: any) => void
    ) => {
      if (msg?.Message === "m3u8AddTask" && msg.params) {
        addTask(msg.params).then(id => sendResponse({ ok: true, id }));
        // 异步 sendResponse，保持消息通道
        return true;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [addTask]);

  /** 获取当前查看的任务 */
  const getActiveTask = useCallback(
    (): M3u8Task | undefined =>
      tasksRef.current.find(t => t.id === activeTaskIdRef.current),
    []
  );

  /** 从表单解析 URL：创建新任务并解析 */
  const parseUrl = useCallback(
    async (m3u8Url: string, requestHeaders?: any) => {
      const task = createTask({
        url: m3u8Url,
        requestHeaders: requestHeaders ?? {},
        tabId: pageTabIdRef.current ?? undefined
      });
      setTasks(prev => [...prev, task]);
      setActiveTaskId(task.id);
      await parseTaskUrl(task, m3u8Url);
    },
    [createTask, parseTaskUrl]
  );

  /** 从表单解析 m3u8 文本：创建新任务 */
  const parseText = useCallback(
    async (text: string, baseUrlVal: string = "") => {
      const task = createTask({});
      setTasks(prev => [...prev, task]);
      setActiveTaskId(task.id);
      await parseTaskText(task, text, baseUrlVal);
    },
    [createTask, parseTaskText]
  );

  /** 关闭并移除任务（下载中先停止，同时移除其请求头规则）
   * @param id 任务 id
   * @param skipSync true=不反向同步（由「侧边栏删除资源」触发的关闭，避免回环）；
   *                 默认用户主动删任务 → 发 deleteMedia 让侧边栏对应资源同步消失
   */
  const closeTask = useCallback(
    (id: string, skipSync = false) => {
      const task = tasksRef.current.find(t => t.id === id);
      if (task) {
        task.runtime.down?.stop();
        if (task.runtime.fileStream) {
          try {
            task.runtime.fileStream.close();
          } catch {
            /* ignore */
          }
          task.runtime.fileStream = undefined;
        }
        removeTaskHeadersRule(task);
        // 反向同步：从侧边栏列表与 background 缓存中删除关联资源
        // （仅有关联 requestId 的任务参与；自定义解析任务无关联，跳过）
        if (!skipSync && task.requestId && task.tabId) {
          sendMessage({ Message: "deleteMedia", tabId: task.tabId, requestId: task.requestId });
        }
      }
      // 函数式 updater：监听器一次关闭多个任务时基于最新列表过滤，互不覆盖
      setTasks(prev => prev.filter(t => t.id !== id));
      // 当前查看的任务被关闭时切到最后一个任务
      if (activeTaskIdRef.current === id) {
        const rest = tasksRef.current.filter(t => t.id !== id);
        setActiveTaskId(rest[rest.length - 1]?.id ?? null);
      }
      // 关闭进行中任务释放并发额度：启动排队中的下一个任务
      if (task?.state === "downloading" || task?.state === "merging") {
        setTimeout(() => dispatchRef.current?.(), 0);
      }
    },
    [removeTaskHeadersRule]
  );

  /** 清空：停止并关闭全部任务（不联动删除侧边栏资源行，数据清空走侧边栏自己的入口） */
  const closeAllTasks = useCallback(() => {
    for (const t of tasksRef.current) {
      t.runtime.down?.stop();
      if (t.runtime.fileStream) {
        try {
          t.runtime.fileStream.close();
        } catch {
          /* ignore */
        }
        t.runtime.fileStream = undefined;
      }
      removeTaskHeadersRule(t);
    }
    setTasks([]);
    setActiveTaskId(null);
  }, [removeTaskHeadersRule]);

  /** 监听侧边栏的资源删除/清空广播：同步关闭关联的下载任务
   * MediaDataDeleted（单条删除）：按 requestId 匹配任务关闭
   * MediaDataCleared（清空）：type=true 清当前 tab / type=false 清其余，两连发即全清
   */
  useEffect(() => {
    const onMessage = (msg: any) => {
      if (!msg) { return; }
      if (msg.Message === "MediaDataDeleted") {
        for (const t of tasksRef.current) {
          if (t.requestId != null && String(t.requestId) === String(msg.requestId)) {
            // skipSync=true：资源删除的发起方已同步 background，不回发 deleteMedia 防回环
            closeTask(t.id, true);
          }
        }
        return;
      }
      if (msg.Message === "MediaDataCleared") {
        for (const t of tasksRef.current) {
          const hit = msg.type ? t.tabId === msg.tabId : t.tabId !== msg.tabId;
          if (hit) { closeTask(t.id, true); }
        }
        return;
      }
      // 侧边栏资源行按钮：切换对应任务的暂停/继续（按 requestId 匹配）
      if (msg.Message === "m3u8TogglePause" && msg.requestId != null) {
        const t = tasksRef.current.find(
          t => t.requestId != null && String(t.requestId) === String(msg.requestId)
        );
        if (t) { togglePauseTask(t.id); }
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [closeTask]);

  /** 更新当前任务的下载选项 */
  const updateOptions = useCallback(
    (patch: Partial<DownloadOptions>) => {
      const task = getActiveTask();
      if (task) {
        updateTask(task.id, t => ({ options: { ...t.options, ...patch } }));
      }
    },
    [getActiveTask, updateTask]
  );

  /** 启动当前任务的下载 */
  const startDownload = useCallback(async () => {
    const task = getActiveTask();
    if (task) {
      await startTaskDownload(task);
    }
  }, [getActiveTask, startTaskDownload]);

  /** 停止当前任务下载 */
  const stopDownload = useCallback(() => {
    const task = getActiveTask();
    if (!task) {
      return;
    }
    if (task.runtime.down) {
      task.runtime.down.stop();
    }
    if (task.runtime.fileStream) {
      try {
        task.runtime.fileStream.close();
      } catch {
        /* ignore */
      }
      task.runtime.fileStream = undefined;
    }
    updateTask(task.id, { state: "idle" });
    // 停止后向侧边栏广播，资源行按钮从暂停态恢复为下载图标
    if (task.requestId) {
      broadcastProgress({ type: "stopped", requestId: task.requestId });
    }
  }, [getActiveTask, updateTask]);

  /** 切换任务暂停/继续：中止进行中请求、停止派发（已下载分片保留）或恢复派发；
   *  同时向侧边栏广播 paused/resumed 进度，资源行按钮同步切换 */
  const togglePauseTask = useCallback((id: string) => {
    const t = tasksRef.current.find(t => t.id === id);
    if (!t || !t.runtime.down) {
      return;
    }
    if (t.state === "downloading") {
      t.runtime.down.pause();
      updateTask(t.id, { state: "paused" });
      if (t.requestId) {
        broadcastProgress({ type: "paused", requestId: t.requestId });
      }
    } else if (t.state === "paused") {
      t.runtime.down.resume();
      updateTask(t.id, { state: "downloading" });
      if (t.requestId) {
        broadcastProgress({ type: "resumed", requestId: t.requestId });
      }
    }
  }, [updateTask]);

  /** 停止所有进行中的任务（下载中/合并中）：列表视图「全部停止」入口 */
  const stopAllDownload = useCallback(() => {
    for (const task of tasksRef.current) {
      if (task.state !== "downloading" && task.state !== "merging") {
        continue;
      }
      if (task.runtime.down) {
        task.runtime.down.stop();
      }
      if (task.runtime.fileStream) {
        try {
          task.runtime.fileStream.close();
        } catch {
          /* ignore */
        }
        task.runtime.fileStream = undefined;
      }
      updateTask(task.id, { state: "idle" });
      // 停止后向侧边栏广播，资源行按钮从暂停态恢复为下载图标
      if (task.requestId) {
        broadcastProgress({ type: "stopped", requestId: task.requestId });
      }
    }
  }, [updateTask]);

  /** 重试当前任务的单个分片 */
  const retrySegment = useCallback(
    (index: number) => {
      const task = getActiveTask();
      const down = task?.runtime.down;
      if (!task || !down) {
        return;
      }
      // 停止/完成状态下 downloader() 会直接返回，需先重置状态
      if (down.state === "abort" || down.state === "done") {
        down.state = "waiting";
      }
      updateTaskSegment(task.id, index, {
        state: "downloading",
        error: undefined
      });
      down.downloader(index);
    },
    [getActiveTask, updateTaskSegment]
  );

  /** 一键重试当前任务的所有失败分片 */
  const retryAllErrors = useCallback(() => {
    const task = getActiveTask();
    const down = task?.runtime.down;
    if (!task || !down) {
      return;
    }
    const errorSegs = task.segments.filter(s => s.state === "error");
    if (!errorSegs.length) {
      return;
    }
    // 停止/完成状态下 downloader() 会直接返回，需先重置状态
    if (down.state === "abort" || down.state === "done") {
      down.state = "waiting";
    }
    updateTask(task.id, { state: "downloading" });
    errorSegs.forEach(s => {
      updateTaskSegment(task.id, s.index, {
        state: "downloading",
        error: undefined
      });
      down.downloader(s.index);
    });
  }, [getActiveTask, updateTask, updateTaskSegment]);

  /**
   * 强制合并当前任务：跳过失败分片，用已下载完成的 buffer 合并输出
   * 仅非流式（streamSaver）场景可用——流式下载无完整 buffer 可合并
   */
  const forceMerge = useCallback(() => {
    const task = getActiveTask();
    const rt = task?.runtime;
    const down = rt?.down;
    if (!task || !down || !rt.ctx || !down.success) {
      return;
    }
    // 中断仍在进行中的分片下载
    down.stop();
    updateTask(task.id, { state: "merging" });
    broadcastProgress({
      type: "merging",
      requestId: rt.ctx.requestId,
      success: down.success,
      totalCount: down.total
    });
    // mergeTs 内部已过滤 buffer 空洞（失败分片）
    mergeTs(down, rt.ctx, task.options);
    updateTask(task.id, { state: "complete" });
  }, [getActiveTask, updateTask]);

  /** 设置当前任务的密钥信息 */
  const setKeyInfo = useCallback(
    (info: any) => {
      const task = getActiveTask();
      if (task) {
        updateTask(task.id, { keyInfo: info });
      }
    },
    [getActiveTask, updateTask]
  );

  /** 为当前任务添加可能的密钥 */
  const addPossibleKey = useCallback(
    (key: string) => {
      const task = getActiveTask();
      if (task) {
        updateTask(task.id, t => ({
          possibleKeys: t.possibleKeys.some(k => k === key)
            ? t.possibleKeys
            : [...t.possibleKeys, key]
        }));
      }
    },
    [getActiveTask, updateTask]
  );

  /** 页面卸载前清理：停止所有任务、关闭流、移除请求头规则 */
  useEffect(() => {
    const onUnload = () => {
      for (const task of tasksRef.current) {
        task.runtime.down?.stop();
        if (task.runtime.fileStream) {
          try {
            task.runtime.fileStream.close();
          } catch {
            /* ignore */
          }
          task.runtime.fileStream = undefined;
        }
        removeTaskHeadersRule(task);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [removeTaskHeadersRule]);

  /** 当前查看的任务 */
  const activeTask = useMemo(
    () => tasks.find(t => t.id === activeTaskId) ?? null,
    [tasks, activeTaskId]
  );

  const value: StoreValue = {
    ready,
    tasks,
    activeTaskId,
    setActiveTaskId,
    addTask,
    closeTask,
    playlist: activeTask?.playlist ?? null,
    segments: activeTask?.segments ?? [],
    progress:
      activeTask?.progress ?? {
        success: 0,
        total: 0,
        percent: 0,
        buffersize: 0,
        duration: 0
      },
    downloadState: activeTask?.state ?? "idle",
    options: activeTask?.options ?? defaultDownloadOptions,
    tips: activeTask?.tips ?? "",
    keyInfo: activeTask?.keyInfo ?? null,
    possibleKeys: activeTask?.possibleKeys ?? [],
    updateOptions,
    parseUrl,
    parseText,
    startDownload,
    stopDownload,
    togglePauseTask,
    stopAllDownload,
    closeTask,
    closeAllTasks,
    retrySegment,
    retryAllErrors,
    forceMerge,
    displayFileName: activeTask ? computeFileName(activeTask) : "",
    setKeyInfo,
    addPossibleKey
  };

  return (
    <StoreContext.Provider value={value}>
      {props.children}
    </StoreContext.Provider>
  );
}

/** 获取 m3u8 store */
export function useM3u8Store(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useM3u8Store 必须在 M3u8StoreProvider 内使用");
  }
  return ctx;
}
