// @ts-nocheck
/**
 * MPD (DASH) 解析与下载核心逻辑
 * 迁移自 js/mpd.js，去除 DOM 操作，改为纯 TS 函数，
 * 供 React 组件调用。包含：解析清单、提取轨道、生成 m3u8、下载分片合并。
 */
import { secToTime, filterFileName, templates } from "./function";
import { G } from "./init";
import { broadcastProgress } from "./broadcast";

// mpdParser：npm 包，用于解析 DASH MPD 清单
import * as mpdParser from "mpd-parser";

/** 音轨复合 key 的分隔符，沿用原版 mpd.js 的 $-bmmmd-$ */
const AUDIO_KEY_SEP = "$-bmmmd-$";

/** 轨道类型 */
export type TrackType = "video" | "audio" | "text";

/** 下载状态 */
export type DownloadState =
  | "idle"
  | "downloading"
  | "merging"
  | "complete"
  | "error";

/** 单条轨道信息（供 UI 渲染与选择） */
export interface MpdTrack {
  /** 唯一 id，video 为 playlists 索引，audio 为 group$-bmmmd-$index */
  id: string;
  /** 轨道类型 */
  type: TrackType;
  /** 显示名称 */
  label: string;
  /** 带宽 bps */
  bandwidth?: number;
  /** 分辨率宽 */
  width?: number;
  /** 分辨率高 */
  height?: number;
  /** 帧率 */
  frameRate?: number;
  /** 编码 */
  codec?: string;
  /** 语言（音频/字幕） */
  language?: string;
  /** 分片总数 */
  segmentCount: number;
  /** 是否被勾选 */
  selected: boolean;
  /** 下载进度 0-100 */
  progress: number;
  /** 该轨道下载状态 */
  state: DownloadState;
  /** init 分片 URL */
  initUri?: string;
}

/** DRM 信息 */
export interface DrmInfo {
  schemeIdUri: string;
  pssh: string;
  encryptionType: string;
}

/** 解析结果 */
export interface ParseResult {
  /** mpd-parser 输出的 manifest */
  manifest: any;
  /** 视频轨道列表 */
  videoTracks: MpdTrack[];
  /** 音频轨道列表 */
  audioTracks: MpdTrack[];
  /** 字幕轨道列表 */
  textTracks: MpdTrack[];
  /** DRM 信息 */
  drm: DrmInfo[];
  /** 总时长（秒） */
  duration: number;
  /** 分片文本（首轨默认） */
  segmentText: string;
  /** init 分片 URL（首轨默认） */
  initUri?: string;
}

/**
 * 根据 schemeIdUri 判断 DRM 加密类型
 * @param schemeIdUri DRM 方案 URI
 * @returns 加密类型名称
 */
export function getEncryptionType(schemeIdUri: string): string {
  if (schemeIdUri.includes("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed")) {
    return "Widevine";
  } else if (schemeIdUri.includes("9a04f079-9840-4286-ab92-e65be0885f95")) {
    return "Microsoft PlayReady";
  } else if (schemeIdUri.includes("94ce86fb-07ff-4f43-adb8-93d2fa968ca2")) {
    return "Apple FairPlay";
  } else {
    return "Unknown";
  }
}

/**
 * 解析 MPD XML 文本，提取 ContentProtection 中的 DRM 信息
 * @param mpdContent MPD XML 文本
 * @returns DRM 信息数组
 */
export function isDRM(mpdContent: string): DrmInfo[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(mpdContent, "application/xml");
  const drmInfo = new Map<string, string>();
  const contentProtections = xmlDoc.getElementsByTagName("ContentProtection");
  for (let i = 0; i < contentProtections.length; i++) {
    const protection = contentProtections[i];
    const schemeIdUri = protection.getAttribute("schemeIdUri");
    let pssh = protection.getElementsByTagName("cenc:pssh")[0];
    if (!pssh) {
      pssh = protection.getElementsByTagName("mspr:pro")[0];
    }
    if (schemeIdUri && pssh) {
      if (!drmInfo.has(schemeIdUri)) {
        drmInfo.set(schemeIdUri, pssh.textContent || "");
      }
    }
  }
  return Array.from(drmInfo.entries()).map(([schemeIdUri, pssh]) => ({
    schemeIdUri,
    pssh,
    encryptionType: getEncryptionType(schemeIdUri),
  }));
}

/**
 * 提取视频轨道列表（来自 manifest.playlists）
 * @param manifest mpd-parser 输出
 * @returns 视频轨道数组
 */
export function extractVideoTracks(manifest: any): MpdTrack[] {
  const tracks: MpdTrack[] = [];
  const playlists = manifest.playlists || [];
  for (let i = 0; i < playlists.length; i++) {
    const p = playlists[i];
    const attr = p.attributes || {};
    const resolution = attr.RESOLUTION || {};
    tracks.push({
      id: String(i),
      type: "video",
      label:
        `${attr.NAME || i} | ${((attr.BANDWIDTH || 0) / 1024).toFixed(1)} kbps` +
        `${attr["FRAME-RATE"] ? ` | ${attr["FRAME-RATE"].toFixed(1)} fps` : ""}` +
        `${resolution.width ? ` | ${resolution.width}x${resolution.height}` : ""}`,
      bandwidth: attr.BANDWIDTH,
      width: resolution.width,
      height: resolution.height,
      frameRate: attr["FRAME-RATE"],
      codec: attr.CODECS,
      segmentCount: (p.segments || []).length,
      selected: false,
      progress: 0,
      state: "idle",
      initUri: p.segments?.[0]?.map?.resolvedUri,
    });
  }
  return tracks;
}

/**
 * 提取音频轨道列表（来自 manifest.mediaGroups.AUDIO.audio）
 * @param manifest mpd-parser 输出
 * @returns 音频轨道数组
 */
export function extractAudioTracks(manifest: any): MpdTrack[] {
  const tracks: MpdTrack[] = [];
  const audioGroups = manifest?.mediaGroups?.AUDIO?.audio || {};
  for (const groupKey of Object.keys(audioGroups)) {
    const playlists = audioGroups[groupKey].playlists || [];
    playlists.forEach((item: any, index: number) => {
      const attr = item.attributes || {};
      const id = `${groupKey}${AUDIO_KEY_SEP}${index}`;
      tracks.push({
        id,
        type: "audio",
        label: `${groupKey} | ${attr.NAME || index} | ${((attr.BANDWIDTH || 0) / 1000).toFixed(0)}Kbps`,
        bandwidth: attr.BANDWIDTH,
        language: attr.LANGUAGE || groupKey,
        codec: attr.CODECS,
        segmentCount: (item.segments || []).length,
        selected: false,
        progress: 0,
        state: "idle",
        initUri: item.segments?.[0]?.map?.resolvedUri,
      });
    });
  }
  return tracks;
}

/**
 * 提取字幕轨道列表（来自 manifest.mediaGroups.SUBTITLES.subttx）
 * @param manifest mpd-parser 输出
 * @returns 字幕轨道数组
 */
export function extractTextTracks(manifest: any): MpdTrack[] {
  const tracks: MpdTrack[] = [];
  const subs = manifest?.mediaGroups?.SUBTITLES?.subttx || {};
  for (const groupKey of Object.keys(subs)) {
    const playlists = subs[groupKey].playlists || [];
    playlists.forEach((item: any, index: number) => {
      const attr = item.attributes || {};
      tracks.push({
        id: `${groupKey}${AUDIO_KEY_SEP}${index}`,
        type: "text",
        label: `${groupKey} | ${attr.NAME || index}`,
        language: attr.LANGUAGE || groupKey,
        segmentCount: (item.segments || []).length,
        selected: false,
        progress: 0,
        state: "idle",
        initUri: item.segments?.[0]?.map?.resolvedUri,
      });
    });
  }
  return tracks;
}

/**
 * 获取指定轨道的分片对象（对应原版 showSegment 中的 items）
 * @param manifest mpd-parser 输出
 * @param type 轨道类型
 * @param id 轨道 id
 * @returns 该轨道的 playlist 对象（含 segments 数组）
 */
export function getTrackPlaylist(
  manifest: any,
  type: TrackType,
  id: string
): any {
  if (type === "video") {
    return manifest.playlists?.[Number(id)];
  }
  if (type === "audio") {
    const [group, idx] = id.split(AUDIO_KEY_SEP);
    return manifest.mediaGroups?.AUDIO?.audio?.[group]?.playlists?.[Number(idx)];
  }
  if (type === "text") {
    const [group, idx] = id.split(AUDIO_KEY_SEP);
    return manifest.mediaGroups?.SUBTITLES?.subttx?.[group]?.playlists?.[Number(idx)];
  }
  return null;
}

/**
 * 生成轨道的分片 URL 文本（对应原版 textarea 内容）
 * @param manifest mpd-parser 输出
 * @param type 轨道类型
 * @param id 轨道 id
 * @returns 每行一个分片 URL 的文本
 */
export function getSegmentText(
  manifest: any,
  type: TrackType,
  id: string
): string {
  const playlist = getTrackPlaylist(manifest, type, id);
  if (!playlist?.segments) { return ""; }
  return playlist.segments.map((s: any) => s.resolvedUri).join("\n\n");
}

/**
 * 获取轨道的 init 分片 URL
 * @param manifest mpd-parser 输出
 * @param type 轨道类型
 * @param id 轨道 id
 * @returns init 分片 URL，无则 undefined
 */
export function getInitUri(
  manifest: any,
  type: TrackType,
  id: string
): string | undefined {
  const playlist = getTrackPlaylist(manifest, type, id);
  return playlist?.segments?.[0]?.map?.resolvedUri;
}

/**
 * 将指定轨道转换为 m3u8 文本（对应原版 videoToM3u8/audioToM3u8）
 * @param manifest mpd-parser 输出
 * @param type 轨道类型
 * @param id 轨道 id
 * @returns m3u8 字符串
 */
export function toM3U8(
  manifest: any,
  type: TrackType,
  id: string
): string {
  const playlist = getTrackPlaylist(manifest, type, id);
  if (!playlist) { return ""; }
  let content = "#EXTM3U\n";
  content += "#EXT-X-VERSION:3\n";
  content += `#EXT-X-TARGETDURATION:${playlist.targetDuration || 10}\n`;
  content += "#EXT-X-MEDIA-SEQUENCE:0\n";
  content += "#EXT-X-PLAYLIST-TYPE:VOD\n";
  if (playlist.segments?.[0]?.map?.resolvedUri) {
    content += `#EXT-X-MAP:URI="${playlist.segments[0].map.resolvedUri}"\n`;
  }
  for (const seg of playlist.segments || []) {
    content += `#EXTINF:${seg.duration},\n`;
    content += `${seg.resolvedUri}\n`;
  }
  content += "#EXT-X-ENDLIST";
  return content;
}

/**
 * 解析 MPD URL：拉取文本并解析为结构化数据
 * @param url MPD URL
 * @returns 解析结果（含轨道列表/DRM/时长）
 */
export async function parseMpdUrl(url: string): Promise<ParseResult> {
  const response = await fetch(url);
  const mpdContent = await response.text();
  return parseMpdContent(mpdContent, url);
}

/**
 * 解析 MPD 文本内容（对应原版 parseMPD）
 * @param mpdContent MPD XML 文本
 * @param url MPD URL（用于 manifestUri）
 * @returns 解析结果
 */
export function parseMpdContent(
  mpdContent: string,
  url: string
): ParseResult {
  const manifest = mpdParser.parse(mpdContent, { manifestUri: url });
  const drm = isDRM(mpdContent);
  const videoTracks = extractVideoTracks(manifest);
  const audioTracks = extractAudioTracks(manifest);
  const textTracks = extractTextTracks(manifest);
  // 默认选中首条视频轨道并预览分片（与原版 showSegment("video", 0) 一致）
  let segmentText = "";
  let initUri: string | undefined;
  if (videoTracks.length > 0) {
    videoTracks[0].selected = true;
    segmentText = getSegmentText(manifest, "video", videoTracks[0].id);
    initUri = getInitUri(manifest, "video", videoTracks[0].id);
  } else if (audioTracks.length > 0) {
    audioTracks[0].selected = true;
    segmentText = getSegmentText(manifest, "audio", audioTracks[0].id);
    initUri = getInitUri(manifest, "audio", audioTracks[0].id);
  }
  return {
    manifest,
    videoTracks,
    audioTracks,
    textTracks,
    drm,
    duration: manifest.duration || 0,
    segmentText,
    initUri,
  };
}

/**
 * 下载指定轨道的所有分片并合并为单个 Blob
 * @param manifest mpd-parser 输出
 * @param track 轨道对象
 * @param onProgress 进度回调 (0-100)
 * @param requestId 进度上报用 requestId
 * @returns 合并后的 Blob（含 init 分片）
 */
export async function downloadTrack(
  manifest: any,
  track: MpdTrack,
  onProgress?: (percent: number) => void,
  requestId?: string
): Promise<Blob> {
  const playlist = getTrackPlaylist(manifest, track.type, track.id);
  if (!playlist?.segments?.length) {
    throw new Error("轨道无分片");
  }
  const segments = playlist.segments;
  const total = segments.length;
  const chunks: ArrayBuffer[] = [];
  // 先下 init 分片（#EXT-X-MAP）
  const initUri = segments[0]?.map?.resolvedUri;
  if (initUri) {
    const initResp = await fetch(initUri);
    chunks.push(await initResp.arrayBuffer());
  }
  // 顺序下载每个分片（并发易触发站点限流，沿用串行）
  let done = 0;
  for (const seg of segments) {
    const resp = await fetch(seg.resolvedUri);
    chunks.push(await resp.arrayBuffer());
    done++;
    const percent = Math.min(100, Math.floor((done / total) * 100));
    onProgress?.(percent);
    if (requestId) {
      broadcastProgress({
        requestId,
        success: done,
        totalCount: total,
        type: "downloading",
      });
    }
  }
  return new Blob(chunks);
}

/**
 * 合并多个轨道 Blob 为单个文件（仅做字节拼接，不做 mux）
 * 视频/音频分别下载后简单拼接；若需 remux 应在 P8 用 mux.js/ffmpeg 处理。
 * @param blobs 各轨道的 Blob
 * @returns 合并后的 Blob
 */
export function mergeTracks(blobs: Blob[]): Blob {
  return new Blob(blobs);
}

/**
 * 根据轨道信息生成下载文件名（沿用原版 templates + filterFileName）
 * @param track 轨道对象
 * @param url MPD URL
 * @param title 可选标题
 * @returns 处理后的文件名
 */
export function buildFileName(
  track: MpdTrack,
  url: string,
  title?: string
): string {
  const info: any = {
    url,
    title: title || "mpd",
    ext: track.type === "video" ? "mp4" : track.type === "audio" ? "m4a" : "vtt",
    tabId: 0,
  };
  const name = G.TitleName
    ? templates(G.downFileName, info)
    : `${info.title}.${info.ext}`;
  return filterFileName(name) || `${info.title}.${info.ext}`;
}

/**
 * 触发浏览器下载（保存 Blob 为文件）
 * @param blob 文件内容
 * @param filename 文件名
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download(
    { url, filename, saveAs: G.saveAs },
    () => URL.revokeObjectURL(url)
  );
}

/**
 * 格式化时长（复用 secToTime）
 * @param sec 秒
 * @returns hh:mm:ss 字符串
 */
export function formatDuration(sec: number): string {
  return secToTime(sec || 0);
}

/**
 * 构造轨道数量信息文本（对应原版 #count 的 i18n("m3u8Info", ...)）
 * @param segmentCount 分片数
 * @param duration 总时长秒
 * @returns 显示文本
 */
export function countInfo(segmentCount: number, duration: number): string {
  // i18n("m3u8Info", [count, duration]) 在原版是 chrome.i18n.getMessage 占位替换
  const tpl = chrome.i18n.getMessage("m3u8Info") || "%1 slices %2";
  return tpl
    .replace("%1", String(segmentCount))
    .replace("%2", formatDuration(duration));
}
