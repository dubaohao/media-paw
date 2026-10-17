// @ts-nocheck
/**
 * MPD 页面全局 store：解析状态/轨道列表/下载进度/选中态
 * 迁移自 js/mpd.js 的 mpdJson/showSegment/getInfo 及相关逻辑，
 * 改为 React Context 集中管理，组件通过 useMpdStore 消费。
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState
} from "react";
import { G, i18n } from "~lib/init";
import {
  parseMpdUrl,
  getSegmentText,
  getInitUri,
  toM3U8,
  downloadTrack,
  mergeTracks,
  buildFileName,
  saveBlob,
  formatDuration,
  countInfo,
  type MpdTrack,
  type DrmInfo,
  type DownloadState,
  type TrackType
} from "~lib/mpd-core";

/** store 对外暴露的值 */
interface StoreValue {
  /** 是否正在解析 */
  parsing: boolean;
  /** 是否显示自定义 URL 输入（无 url 参数时） */
  showCustomInput: boolean;
  /** MPD URL */
  mpdUrl: string;
  /** 标题（来自 URL 参数） */
  title: string;
  /** requestId（来自 URL 参数，用于进度回传） */
  requestId: string;
  /** 解析后的 manifest（mpd-parser 输出） */
  manifest: any;
  /** 全部轨道（video + audio + text） */
  tracks: MpdTrack[];
  /** DRM 信息 */
  drm: DrmInfo[];
  /** 总时长（秒） */
  duration: number;
  /** 当前预览分片的轨道类型 */
  previewType: TrackType;
  /** 当前预览分片的轨道 id */
  previewId: string;
  /** 分片 URL 文本（textarea 内容） */
  segmentText: string;
  /** init 分片 URL */
  initUri: string | undefined;
  /** 轨道数量信息文本 */
  countText: string;
  /** 整体下载状态 */
  downloadState: DownloadState;
  /** 整体下载进度 0-100 */
  downloadProgress: number;
  /** 错误信息 */
  error: string;
  /** 解析 MPD URL */
  parseUrl: (url: string) => Promise<void>;
  /** 切换轨道选中态 */
  toggleTrack: (id: string) => void;
  /** 切换预览的轨道（更新 textarea/init/count） */
  selectPreview: (type: TrackType, id: string) => void;
  /** 开始下载已选中的轨道 */
  startDownload: () => Promise<void>;
  /** 停止下载 */
  stopDownload: () => void;
  /** 转换当前预览轨道为 m3u8 并打开 m3u8.html */
  convertToM3U8: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

/** MPD store Provider */
export function MpdStoreProvider(props: { children: React.ReactNode }) {
  const [parsing, setParsing] = useState(true);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [mpdUrl, setMpdUrl] = useState("");
  const [title, setTitle] = useState("");
  const [requestId, setRequestId] = useState("");
  const [manifest, setManifest] = useState<any>(null);
  const [tracks, setTracks] = useState<MpdTrack[]>([]);
  const [drm, setDrm] = useState<DrmInfo[]>([]);
  const [duration, setDuration] = useState(0);
  const [previewType, setPreviewType] = useState<TrackType>("video");
  const [previewId, setPreviewId] = useState("");
  const [segmentText, setSegmentText] = useState("");
  const [initUri, setInitUri] = useState<string | undefined>(undefined);
  const [countText, setCountText] = useState("");
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState("");

  /** 停止标志：startDownload 内部轮询以中断循环 */
  const stopFlag = useRef(false);
  /** manifest 工作副本：回调中读取最新值避免 setState 异步 */
  const manifestRef = useRef<any>(null);

  /**
   * 解析 MPD URL 并填充 store
   * @param url MPD URL
   */
  const parseUrl = useCallback(async (url: string) => {
    if (!url) {
      setParsing(false);
      setShowCustomInput(true);
      return;
    }
    setParsing(true);
    setError("");
    try {
      const result = await parseMpdUrl(url);
      manifestRef.current = result.manifest;
      setManifest(result.manifest);
      setMpdUrl(url);
      setDrm(result.drm);
      setDuration(result.duration);
      const all = [
        ...result.videoTracks,
        ...result.audioTracks,
        ...result.textTracks
      ];
      setTracks(all);
      // 预览首条轨道（与原版 showSegment("video", 0) 一致）
      const first =
        result.videoTracks[0] || result.audioTracks[0] || result.textTracks[0];
      if (first) {
        setPreviewType(first.type);
        setPreviewId(first.id);
        setSegmentText(result.segmentText);
        setInitUri(result.initUri);
        setCountText(
          countInfo(first.segmentCount, result.duration)
        );
      }
      setParsing(false);
    } catch (e: any) {
      setError(e?.message || String(e));
      setParsing(false);
      setShowCustomInput(true);
    }
  }, []);

  /**
   * 切换轨道选中态
   * @param id 轨道 id
   */
  const toggleTrack = useCallback((id: string) => {
    setTracks(prev =>
      prev.map(t =>
        t.id === id ? { ...t, selected: !t.selected } : t
      )
    );
  }, []);

  /**
   * 切换预览轨道：更新 textarea/init/count/info
   * @param type 轨道类型
   * @param id 轨道 id
   */
  const selectPreview = useCallback(
    (type: TrackType, id: string) => {
      const m = manifestRef.current;
      if (!m) { return; }
      setPreviewType(type);
      setPreviewId(id);
      setSegmentText(getSegmentText(m, type, id));
      setInitUri(getInitUri(m, type, id));
      const track = tracks.find(t => t.id === id && t.type === type);
      if (track) {
        setCountText(countInfo(track.segmentCount, duration));
      }
    },
    [tracks, duration]
  );

  /**
   * 开始下载所有选中的轨道：逐轨下载分片，最后合并保存
   */
  const startDownload = useCallback(async () => {
    const m = manifestRef.current;
    if (!m) { return; }
    const selected = tracks.filter(t => t.selected);
    if (selected.length === 0) {
      setError(i18n.noSelected || "未选择轨道");
      return;
    }
    stopFlag.current = false;
    setDownloadState("downloading");
    setDownloadProgress(0);
    setError("");
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < selected.length; i++) {
        if (stopFlag.current) { break; }
        const track = selected[i];
        setTracks(prev =>
          prev.map(t =>
            t.id === track.id ? { ...t, state: "downloading" as DownloadState } : t
          )
        );
        const blob = await downloadTrack(
          m,
          track,
          percent => {
            setTracks(prev =>
              prev.map(t =>
                t.id === track.id ? { ...t, progress: percent } : t
              )
            );
          },
          requestId || track.id
        );
        blobs.push(blob);
        setTracks(prev =>
          prev.map(t =>
            t.id === track.id
              ? { ...t, progress: 100, state: "complete" as DownloadState }
              : t
          )
        );
      }
      if (stopFlag.current) {
        setDownloadState("idle");
        return;
      }
      setDownloadState("merging");
      // 合并轨道（简单字节拼接，复杂 mux 留待 P8）
      const merged = mergeTracks(blobs);
      const fileName = buildFileName(selected[0], mpdUrl, title);
      setDownloadState("complete");
      setDownloadProgress(100);
      saveBlob(merged, fileName);
    } catch (e: any) {
      setError(e?.message || String(e));
      setDownloadState("error");
    }
  }, [tracks, mpdUrl, title, requestId]);

  /**
   * 停止下载：置位停止标志，循环中检测后退出
   */
  const stopDownload = useCallback(() => {
    stopFlag.current = true;
    setDownloadState("idle");
  }, []);

  /**
   * 转换当前预览轨道为 m3u8 并在新标签页打开 m3u8.html
   * （对应原版 #videoToM3u8/#audioToM3u8 的 chrome.tabs.create 逻辑）
   */
  const convertToM3U8 = useCallback(() => {
    const m = manifestRef.current;
    if (!m || !previewId) { return; }
    const content = toM3U8(m, previewType, previewId);
    // 通过 chrome.storage 暂存 m3u8 内容，m3u8.html 按 getId 读取
    chrome.tabs.getCurrent(tabs => {
      if (!tabs?.id) { return; }
      (chrome.storage.session ?? chrome.storage.local).set({
        m3u8Content: content,
        mediaInfo: `${previewType}: ${
          tracks.find(t => t.id === previewId)?.label || ""
        }`
      });
      chrome.tabs.create({ url: `tabs/m3u8.html?getId=${tabs.id}` });
    });
  }, [previewType, previewId, tracks]);

  const value: StoreValue = {
    parsing,
    showCustomInput,
    mpdUrl,
    title,
    requestId,
    manifest,
    tracks,
    drm,
    duration,
    previewType,
    previewId,
    segmentText,
    initUri,
    countText,
    downloadState,
    downloadProgress,
    error,
    parseUrl,
    toggleTrack,
    selectPreview,
    startDownload,
    stopDownload,
    convertToM3U8
  };

  return (
    <StoreContext.Provider value={value}>
      {props.children}
    </StoreContext.Provider>
  );
}

/** 获取 MPD store */
export function useMpdStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("useMpdStore 必须在 MpdStoreProvider 内使用");
  }
  return ctx;
}
