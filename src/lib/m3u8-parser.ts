// @ts-nocheck
/**
 * M3U8 解析与下载核心逻辑
 * 从 js/m3u8.js 与 js/m3u8.downloader.js 迁移
 * 包含：AES-128-CBC 解密、m3u8 解析、分片下载、合并、流式下载、mux.js 转码
 */
import { G } from "./init";
import { broadcastProgress } from "./broadcast";
import {
  byteToSize,
  secToTime,
  filterFileName,
  stringModify,
  templates,
  isEmpty,
  JSONparse
} from "./function";

/* 第三方库（npm 包） */
import Hls from "hls.js";
import * as muxjs from "mux.js";
import * as streamSaver from "streamsaver";

/**
 * ArrayBuffer 转 16 进制字符串
 * @param buffer 输入 buffer
 * @returns 16 进制字符串
 */
export function ArrayBufferToHexString(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += ("00" + bytes[i].toString(16)).slice(-2);
  }
  return binary;
}

/**
 * ArrayBuffer 转 Base64
 * @param buffer 输入 buffer
 * @returns Base64 字符串
 */
export function ArrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 转 ArrayBuffer
 * @param base64 Base64 字符串
 * @returns ArrayBuffer
 */
export function Base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 字符串转 ArrayBuffer
 * @param str 输入字符串
 * @returns ArrayBuffer
 */
export function StringToArrayBuffer(str: string): ArrayBuffer {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 16 进制字符串转 ArrayBuffer
 * @param hex 16 进制字符串
 * @returns ArrayBuffer
 */
export function HexStringToArrayBuffer(hex: string): ArrayBuffer {
  const typedArray = new Uint8Array(
    hex.match(/[\da-f]{2}/gi).map(function (h) {
      return parseInt(h, 16);
    })
  );
  return typedArray.buffer;
}

/**
 * 字符串转 Uint8Array（去除 0x 前缀，按 16 进制解析）
 * @param str 输入字符串
 * @returns Uint8Array
 */
export function StringToUint8Array(str: string): Uint8Array {
  str = str.replace("0x", "");
  return new Uint8Array(HexStringToArrayBuffer(str));
}

/**
 * 判断是否为 16 进制密钥（32 位 0-9a-fA-F）
 * @param str 输入字符串
 * @returns 是否为合法 16 进制密钥
 */
export function isHexKey(str: string): boolean {
  return /^[0-9a-fA-F]{32}$/.test(str);
}

/**
 * 获取 URL 中文件名部分（去除 query）
 * @param str URL 字符串
 * @returns 文件名
 */
export function GetFile(str: string): string {
  str = str.split("?")[0];
  if (str.substr(0, 5) !== "data:" && str.substr(0, 4) !== "skd:") {
    return str.split("/").pop();
  }
  return str;
}

/**
 * 获取不带扩展名的文件名
 * @param url URL 字符串
 * @param customFilename 自定义文件名（可选）
 * @param title 来源标题（可选）
 * @returns 文件名
 */
export function GetFileName(
  url: string,
  customFilename?: string,
  title?: string
): string {
  if (customFilename) {
    return customFilename.trim();
  }
  if (G.TitleName && title) {
    if (title.length >= 150) {
      return title.substring(title.length - 150);
    }
    return title;
  }
  let name = GetFile(url);
  name = name.split(".");
  name.length > 1 && name.pop();
  name = name.join(".");
  if (name.length >= 150) {
    name = name.substring(name.length - 150);
  }
  if (name.length === 0) {
    name = "NULL";
  }
  return stringModify(name);
}

/**
 * 获取 URL 的扩展名
 * @param url URL 字符串
 * @returns 扩展名（小写）
 */
export function GetExt(url: string): string | undefined {
  const fileName = GetFile(url);
  const str = fileName.split(".");
  if (str.length === 1) {
    return undefined;
  }
  const ext = str[str.length - 1];
  const matched = ext.match(/[0-9a-zA-Z]*/);
  return matched ? matched[0].toLowerCase() : undefined;
}

/**
 * AES-128-CBC 解密器
 * 迁移自 lib/m3u8-decrypt.js（基于 hls.js 提取的 AES 解密算法）
 */
export class AESDecryptor {
  rcon: Uint32Array<number> | number[];
  subMix: Uint32Array[];
  invSubMix: Uint32Array[];
  sBox: Uint32Array;
  invSBox: Uint32Array;
  key: Uint32Array;
  ksRows: number;
  keySize: number;
  keySchedule: Uint32Array;
  invKeySchedule: Uint32Array;

  /** 初始化 AES 表 */
  constructor() {
    this.rcon = [
      0x0, 0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
    ];
    this.subMix = [
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256)
    ];
    this.invSubMix = [
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256),
      new Uint32Array(256)
    ];
    this.sBox = new Uint32Array(256);
    this.invSBox = new Uint32Array(256);
    this.key = new Uint32Array(0);
    this.ksRows = 0;
    this.keySize = 0;
    this.initTable();
  }

  /** 移除 PKCS7 填充 */
  removePadding(array: ArrayBuffer): ArrayBuffer {
    const outputBytes = array.byteLength;
    const paddingBytes =
      outputBytes && new DataView(array).getUint8(outputBytes - 1);
    if (paddingBytes) {
      return array.slice(0, outputBytes - paddingBytes);
    }
    return array;
  }

  /** 将 ArrayBuffer 转为 4 个 uint32（同时翻转字节序） */
  uint8ArrayToUint32Array_(arrayBuffer: ArrayBuffer): Uint32Array {
    const view = new DataView(arrayBuffer);
    const newArray = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      newArray[i] = view.getUint32(i * 4);
    }
    return newArray;
  }

  /** 初始化 sBox 与 invSBox 及 subMix/invSubMix 表 */
  initTable() {
    const sBox = this.sBox;
    const invSBox = this.invSBox;
    const subMix = this.subMix;
    const subMix0 = subMix[0];
    const subMix1 = subMix[1];
    const subMix2 = subMix[2];
    const subMix3 = subMix[3];
    const invSubMix = this.invSubMix;
    const invSubMix0 = invSubMix[0];
    const invSubMix1 = invSubMix[1];
    const invSubMix2 = invSubMix[2];
    const invSubMix3 = invSubMix[3];
    const d = new Uint32Array(256);
    let x = 0;
    let xi = 0;
    let i = 0;
    for (i = 0; i < 256; i++) {
      if (i < 128) {
        d[i] = i << 1;
      } else {
        d[i] = (i << 1) ^ 0x11b;
      }
    }
    for (i = 0; i < 256; i++) {
      let sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
      sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
      sBox[x] = sx;
      invSBox[sx] = x;
      const x2 = d[x];
      const x4 = d[x2];
      const x8 = d[x4];
      let t = (d[sx] * 0x101) ^ (sx * 0x1010100);
      subMix0[x] = (t << 24) | (t >>> 8);
      subMix1[x] = (t << 16) | (t >>> 16);
      subMix2[x] = (t << 8) | (t >>> 24);
      subMix3[x] = t;
      t =
        (x8 * 0x1010101) ^
        (x4 * 0x10001) ^
        (x2 * 0x101) ^
        (x * 0x1010100);
      invSubMix0[sx] = (t << 24) | (t >>> 8);
      invSubMix1[sx] = (t << 16) | (t >>> 16);
      invSubMix2[sx] = (t << 8) | (t >>> 24);
      invSubMix3[sx] = t;
      if (!x) {
        x = xi = 1;
      } else {
        x = x2 ^ d[d[d[x8 ^ x2]]];
        xi ^= d[d[xi]];
      }
    }
  }

  /** 扩展 AES 密钥 */
  expandKey(keyBuffer: ArrayBuffer) {
    const key = this.uint8ArrayToUint32Array_(keyBuffer);
    let sameKey = true;
    let offset = 0;
    while (offset < key.length && sameKey) {
      sameKey = key[offset] === this.key[offset];
      offset++;
    }
    if (sameKey) {
      return;
    }
    this.key = key;
    const keySize = (this.keySize = key.length);
    if (keySize !== 4 && keySize !== 6 && keySize !== 8) {
      throw new Error("Invalid aes key size=" + keySize);
    }
    const ksRows = (this.ksRows = (keySize + 6 + 1) * 4);
    let ksRow;
    let invKsRow;
    const keySchedule = (this.keySchedule = new Uint32Array(ksRows));
    const invKeySchedule = (this.invKeySchedule = new Uint32Array(ksRows));
    const sbox = this.sBox;
    const rcon = this.rcon;
    const invSubMix = this.invSubMix;
    const invSubMix0 = invSubMix[0];
    const invSubMix1 = invSubMix[1];
    const invSubMix2 = invSubMix[2];
    const invSubMix3 = invSubMix[3];
    let prev;
    let t;
    for (ksRow = 0; ksRow < ksRows; ksRow++) {
      if (ksRow < keySize) {
        prev = keySchedule[ksRow] = key[ksRow];
        continue;
      }
      t = prev;
      if (ksRow % keySize === 0) {
        t = (t << 8) | (t >>> 24);
        t =
          (sbox[t >>> 24] << 24) |
          (sbox[(t >>> 16) & 0xff] << 16) |
          (sbox[(t >>> 8) & 0xff] << 8) |
          sbox[t & 0xff];
        t ^= rcon[(ksRow / keySize) | 0] << 24;
      } else if (keySize > 6 && ksRow % keySize === 4) {
        t =
          (sbox[t >>> 24] << 24) |
          (sbox[(t >>> 16) & 0xff] << 16) |
          (sbox[(t >>> 8) & 0xff] << 8) |
          sbox[t & 0xff];
      }
      keySchedule[ksRow] = prev = (keySchedule[ksRow - keySize] ^ t) >>> 0;
    }
    for (invKsRow = 0; invKsRow < ksRows; invKsRow++) {
      ksRow = ksRows - invKsRow;
      if (invKsRow & 3) {
        t = keySchedule[ksRow];
      } else {
        t = keySchedule[ksRow - 4];
      }
      if (invKsRow < 4 || ksRow <= 4) {
        invKeySchedule[invKsRow] = t;
      } else {
        invKeySchedule[invKsRow] =
          invSubMix0[sbox[t >>> 24]] ^
          invSubMix1[sbox[(t >>> 16) & 0xff]] ^
          invSubMix2[sbox[(t >>> 8) & 0xff]] ^
          invSubMix3[sbox[t & 0xff]];
      }
      invKeySchedule[invKsRow] = invKeySchedule[invKsRow] >>> 0;
    }
  }

  /** 字节序转换（网络序→主机序） */
  networkToHostOrderSwap(word: number): number {
    return (
      (word << 24) |
      ((word & 0xff00) << 8) |
      ((word & 0xff0000) >> 8) |
      (word >>> 24)
    );
  }

  /**
   * 解密 AES-128-CBC 数据
   * @param inputArrayBuffer 输入数据
   * @param offset 输入数据起始偏移（int32 单位）
   * @param aesIV 初始向量
   * @param removePKCS7Padding 是否移除 PKCS7 填充
   * @returns 解密后的 ArrayBuffer
   */
  decrypt(
    inputArrayBuffer: ArrayBuffer,
    offset: number,
    aesIV: ArrayBuffer,
    removePKCS7Padding: boolean
  ): ArrayBuffer {
    const nRounds = this.keySize + 6;
    const invKeySchedule = this.invKeySchedule;
    const invSBOX = this.invSBox;
    const invSubMix = this.invSubMix;
    const invSubMix0 = invSubMix[0];
    const invSubMix1 = invSubMix[1];
    const invSubMix2 = invSubMix[2];
    const invSubMix3 = invSubMix[3];
    const initVector = this.uint8ArrayToUint32Array_(aesIV);
    let initVector0 = initVector[0];
    let initVector1 = initVector[1];
    let initVector2 = initVector[2];
    let initVector3 = initVector[3];
    const inputInt32 = new Int32Array(inputArrayBuffer);
    const outputInt32 = new Int32Array(inputInt32.length);
    let t0, t1, t2, t3;
    let s0, s1, s2, s3;
    let inputWords0, inputWords1, inputWords2, inputWords3;
    let ksRow, i;
    const swapWord = this.networkToHostOrderSwap;
    while (offset < inputInt32.length) {
      inputWords0 = swapWord(inputInt32[offset]);
      inputWords1 = swapWord(inputInt32[offset + 1]);
      inputWords2 = swapWord(inputInt32[offset + 2]);
      inputWords3 = swapWord(inputInt32[offset + 3]);
      s0 = inputWords0 ^ invKeySchedule[0];
      s1 = inputWords3 ^ invKeySchedule[1];
      s2 = inputWords2 ^ invKeySchedule[2];
      s3 = inputWords1 ^ invKeySchedule[3];
      ksRow = 4;
      for (i = 1; i < nRounds; i++) {
        t0 =
          invSubMix0[s0 >>> 24] ^
          invSubMix1[(s1 >> 16) & 0xff] ^
          invSubMix2[(s2 >> 8) & 0xff] ^
          invSubMix3[s3 & 0xff] ^
          invKeySchedule[ksRow];
        t1 =
          invSubMix0[s1 >>> 24] ^
          invSubMix1[(s2 >> 16) & 0xff] ^
          invSubMix2[(s3 >> 8) & 0xff] ^
          invSubMix3[s0 & 0xff] ^
          invKeySchedule[ksRow + 1];
        t2 =
          invSubMix0[s2 >>> 24] ^
          invSubMix1[(s3 >> 16) & 0xff] ^
          invSubMix2[(s0 >> 8) & 0xff] ^
          invSubMix3[s1 & 0xff] ^
          invKeySchedule[ksRow + 2];
        t3 =
          invSubMix0[s3 >>> 24] ^
          invSubMix1[(s0 >> 16) & 0xff] ^
          invSubMix2[(s1 >> 8) & 0xff] ^
          invSubMix3[s2 & 0xff] ^
          invKeySchedule[ksRow + 3];
        s0 = t0;
        s1 = t1;
        s2 = t2;
        s3 = t3;
        ksRow = ksRow + 4;
      }
      t0 =
        (invSBOX[s0 >>> 24] << 24) ^
        (invSBOX[(s1 >> 16) & 0xff] << 16) ^
        (invSBOX[(s2 >> 8) & 0xff] << 8) ^
        invSBOX[s3 & 0xff] ^
        invKeySchedule[ksRow];
      t1 =
        (invSBOX[s1 >>> 24] << 24) ^
        (invSBOX[(s2 >> 16) & 0xff] << 16) ^
        (invSBOX[(s3 >> 8) & 0xff] << 8) ^
        invSBOX[s0 & 0xff] ^
        invKeySchedule[ksRow + 1];
      t2 =
        (invSBOX[s2 >>> 24] << 24) ^
        (invSBOX[(s3 >> 16) & 0xff] << 16) ^
        (invSBOX[(s0 >> 8) & 0xff] << 8) ^
        invSBOX[s1 & 0xff] ^
        invKeySchedule[ksRow + 2];
      t3 =
        (invSBOX[s3 >>> 24] << 24) ^
        (invSBOX[(s0 >> 16) & 0xff] << 16) ^
        (invSBOX[(s1 >> 8) & 0xff] << 8) ^
        invSBOX[s2 & 0xff] ^
        invKeySchedule[ksRow + 3];
      outputInt32[offset] = swapWord(t0 ^ initVector0);
      outputInt32[offset + 1] = swapWord(t3 ^ initVector1);
      outputInt32[offset + 2] = swapWord(t2 ^ initVector2);
      outputInt32[offset + 3] = swapWord(t1 ^ initVector3);
      initVector0 = inputWords0;
      initVector1 = inputWords1;
      initVector2 = inputWords2;
      initVector3 = inputWords3;
      offset = offset + 4;
    }
    return removePKCS7Padding
      ? this.removePadding(outputInt32.buffer)
      : outputInt32.buffer;
  }

  /** 销毁解密器 */
  destroy() {
    this.key = undefined;
    this.keySize = undefined;
    this.ksRows = undefined;
    this.sBox = undefined;
    this.invSBox = undefined;
    this.subMix = undefined;
    this.invSubMix = undefined;
    this.keySchedule = undefined;
    this.invKeySchedule = undefined;
    this.rcon = undefined;
  }
}

/** 分片对象 */
export interface Fragment {
  url: string;
  decryptdata?: any;
  encrypted?: boolean;
  duration: number;
  initSegment?: any;
  sn: number;
  cc: number;
  live?: boolean;
  byteRange?: number[];
  index?: number;
  contentType?: string;
  fileStream?: any;
}

/** 解析后的 m3u8 信息 */
export interface ParsedPlaylist {
  fragments: Fragment[];
  m3u8Content: string;
  totalDuration: number;
  isEncrypted: boolean;
  isSampleAES: boolean;
  live: boolean;
  levels: any[];
  audioTracks: any[];
  subtitleTracks: any[];
  url: string;
  currentLevel: number;
  estimateFileSize: number;
}

/** 下载选项 */
export interface DownloadOptions {
  threads: number;
  mp4: boolean;
  onlyAudio: boolean;
  skipDecrypt: boolean;
  streamSaver: boolean;
  ffmpeg: boolean;
  saveAs: boolean;
  autoClose: boolean;
  customFilename: string;
  customKey: string;
  customIV: string;
  rangeStart: number | string;
  rangeEnd: number | string;
  retryCount: number;
}

/** 默认下载选项 */
export const defaultDownloadOptions: DownloadOptions = {
  threads: 6,
  mp4: false,
  onlyAudio: false,
  skipDecrypt: false,
  streamSaver: false,
  ffmpeg: false,
  saveAs: false,
  autoClose: false,
  customFilename: "",
  customKey: "",
  customIV: "",
  rangeStart: 1,
  rangeEnd: 0,
  retryCount: 0
};

/** 分片下载状态 */
export type SegmentState = "pending" | "downloading" | "success" | "error";

/** 单个分片首次失败后的最大自动重试次数（耗尽后保持失败，交由用户手动重试或跳过失败并合并） */
export const MAX_AUTO_RETRY = 2;
/** 自动重试基础退避毫秒数，第 n 次重试等待 n * 该值（800ms、1600ms） */
const RETRY_BASE_DELAY = 800;

/** 单个分片的进度状态 */
export interface SegmentProgress {
  index: number;
  state: SegmentState;
  received: number;
  total: number;
  /** 分片地址（展示用） */
  url?: string;
  error?: string;
  /** 已自动重试次数 */
  retryCount: number;
  /** 最大自动重试次数（展示 n/max） */
  maxRetry?: number;
}

/**
 * 创建流式下载写入流
 * @param url 资源 URL（用于确定文件名和扩展名）
 * @param useMp4 是否使用 mp4 扩展名
 * @returns streamSaver 的 Writer
 */
export function createStreamSaver(url: string, useMp4: boolean): any {
  streamSaver.mitm = G.streamSaverConfig.url;
  const ext = useMp4 ? "mp4" : GetExt(url);
  return streamSaver.createWriteStream(`${GetFileName(url)}.${ext}`).getWriter();
}

/**
 * 估算整个视频大小（采样 3 个分片的平均大小 × 分片数）
 * @param fragments 分片列表
 * @param requestHeaders 请求头
 * @returns 估算文件大小（字节）
 */
export async function estimateSize(
  fragments: Fragment[],
  requestHeaders: any = {}
): Promise<number> {
  if (!fragments || fragments.length === 0) {
    return 0;
  }
  const samplesToCheck = Math.min(3, fragments.length);
  let totalSize = 0;
  let successfulFetches = 0;
  const promises: Promise<void>[] = [];
  for (let i = 0; i < samplesToCheck; i++) {
    promises.push(
      fetch(fragments[i].url, {
        method: "HEAD",
        headers: requestHeaders
      })
        .then(function (response: Response) {
          if (response.ok) {
            const contentLength = response.headers.get("Content-Length");
            if (contentLength) {
              totalSize += parseInt(contentLength);
              successfulFetches++;
            }
          }
        })
        .catch(function () {
          /* 采样失败忽略 */
        })
    );
  }
  await Promise.all(promises);
  if (successfulFetches > 0) {
    return (totalSize / successfulFetches) * fragments.length;
  }
  return 0;
}

/**
 * 时间格式（HH:MM:SS）转为切片序号
 * @param time 时间字符串
 * @param fragments 分片列表
 * @returns 切片索引
 */
export function timeToIndex(time: string, fragments: Fragment[]): number {
  let totalSeconds = time.split(":").reduce((acc, t) => 60 * acc + +t);
  return fragments.findIndex(
    fragment => (totalSeconds -= fragment.duration) < 0
  );
}

/**
 * 将 m3u8 文本内容追加 baseUrl 前缀（用于相对路径补全）
 * @param baseUrl 基础 URL
 * @param m3u8Text m3u8 原文本
 * @returns 拼接后的 m3u8 文本
 */
export function addBashUrl(baseUrl: string, m3u8Text: string): string {
  const m3u8Split = m3u8Text.split("\n");
  m3u8Text = "";
  for (const key in m3u8Split) {
    if (isEmpty(m3u8Split[key])) {
      continue;
    }
    if (m3u8Split[key].includes("URI=")) {
      let keyURL = /URI="(.*)"/.exec(m3u8Split[key]);
      if (keyURL && keyURL[1] && !/^[\w]+:.+/i.test(keyURL[1])) {
        // 相对路径按 baseUrl 规范解析，避免字符串拼接产生坏地址
        let resolvedUri = keyURL[1];
        try {
          resolvedUri = new URL(keyURL[1], baseUrl).href;
        } catch {
          resolvedUri = baseUrl + keyURL[1];
        }
        m3u8Split[key] = m3u8Split[key].replace(
          /URI="(.*)"/,
          'URI="' + resolvedUri + '"'
        );
      }
    }
    if (!m3u8Split[key].includes("#") && !/^[\w]+:.+/i.test(m3u8Split[key])) {
      // 分片相对路径按 baseUrl 规范解析
      try {
        m3u8Split[key] = new URL(m3u8Split[key], baseUrl).href;
      } catch {
        m3u8Split[key] = baseUrl + m3u8Split[key];
      }
    }
    m3u8Text += m3u8Split[key] + "\n";
  }
  return m3u8Text;
}

/**
 * 修正 MP4 文件显示时长（写入 mvhd/tkhd/mdhd duration 字段）
 * @param data MP4 数据
 * @param duration 时长（秒）
 * @returns 修正后的数据
 */
export function fixFileDuration(data: Uint8Array, duration: number): Uint8Array {
  let mvhdBoxDuration = duration * 90000;
  /** 读取 timescale 字段并计算新的 duration */
  function getBoxDuration(
    data: Uint8Array,
    duration: number,
    index: number
  ): number {
    let boxDuration = "";
    index += 16;
    boxDuration += data[index].toString(16);
    boxDuration += data[++index].toString(16);
    boxDuration += data[++index].toString(16);
    boxDuration += data[++index].toString(16);
    boxDuration = parseInt(boxDuration, 16);
    boxDuration *= duration;
    return boxDuration;
  }
  for (let i = 0; i < data.length; i++) {
    if (
      data[i] === 0x6d &&
      data[i + 1] === 0x76 &&
      data[i + 2] === 0x68 &&
      data[i + 3] === 0x64
    ) {
      mvhdBoxDuration = getBoxDuration(data, duration, i);
      data[i + 11] = 0;
      i += 20;
      data[i] = (mvhdBoxDuration & 0xff000000) >> 24;
      data[++i] = (mvhdBoxDuration & 0xff0000) >> 16;
      data[++i] = (mvhdBoxDuration & 0xff00) >> 8;
      data[++i] = mvhdBoxDuration & 0xff;
      continue;
    }
    if (
      data[i] === 0x74 &&
      data[i + 1] === 0x6b &&
      data[i + 2] === 0x68 &&
      data[i + 3] === 0x64
    ) {
      i += 24;
      data[i] = (mvhdBoxDuration & 0xff000000) >> 24;
      data[++i] = (mvhdBoxDuration & 0xff0000) >> 16;
      data[++i] = (mvhdBoxDuration & 0xff00) >> 8;
      data[++i] = mvhdBoxDuration & 0xff;
      continue;
    }
    if (
      data[i] === 0x6d &&
      data[i + 1] === 0x64 &&
      data[i + 2] === 0x68 &&
      data[i + 3] === 0x64
    ) {
      const mdhdBoxDuration = getBoxDuration(data, duration, i);
      i += 20;
      data[i] = (mdhdBoxDuration & 0xff000000) >> 24;
      data[++i] = (mdhdBoxDuration & 0xff0000) >> 16;
      data[++i] = (mdhdBoxDuration & 0xff00) >> 8;
      data[++i] = mdhdBoxDuration & 0xff;
      continue;
    }
    if (
      data[i] === 0x6d &&
      data[i + 1] === 0x64 &&
      data[i + 2] === 0x61 &&
      data[i + 3] === 0x74
    ) {
      return data;
    }
  }
  return data;
}

/**
 * 修复 mux.js 产出的 fMP4 封装，使其符合离线 MP4 规范、本地播放器（QuickTime 等）可直接连续播放：
 * 1) mfhd sequence_number 重写为单调递增值——mux.js 恒写 0，严格播放器会判为损坏片段丢弃；
 * 2) tfhd 补 default-base-is-moof 标志——mux.js 未声明数据基准偏移，QuickTime 按错误起点解析导致黑屏；
 * 3) tfdt baseMediaDecodeTime 重写为各轨累计解码时长——mux.js 为适配网页 MSE 每片时间轴都从 0 开始，
 *    离线拼接后播放器看到的时间轴不断回到开头（表现为只能播开头几秒就卡住）；
 *    这里按 trun 内各 sample 的 duration 累计出全局连续时间轴。
 * 对传入 buffer 原地修改，返回处理的 moof 数量；trackTime 保存跨分片的各轨时间累计（trackId → 累计时长）。
 * TS 封装数据无合法 box 结构，遍历即止、返回 0。
 */
function fixFmp4Container(buffer: Uint8Array, startSeq = 0, trackTime = new Map<number, number>()): number {
  let seq = startSeq;
  let moofCount = 0;
  let offset = 0;
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // 读取 box 类型（box 头第 5-8 字节的 4 个 ASCII 字符）
  const boxType = (o: number) =>
    String.fromCharCode(buffer[o + 4], buffer[o + 5], buffer[o + 6], buffer[o + 7]);
  // 读取 fullbox 的 24 位 flags（跳过 version 字节）
  const fullboxFlags = (o: number) =>
    (buffer[o + 9] << 16) | (buffer[o + 10] << 8) | buffer[o + 11];
  /** 累计 trun 内全部 sample 的解码时长（sample_duration 字段之和），用于推进 tfdt */
  const sumTrunSampleDurations = (trunOff: number): number => {
    const flags = fullboxFlags(trunOff);
    const sampleCount = dv.getUint32(trunOff + 12);
    let p = trunOff + 16; // 跳过 version/flags + sample_count
    if (flags & 0x000001) p += 4; // data_offset
    if (flags & 0x000004) p += 4; // first_sample_flags（不占 per-sample 区）
    let sum = 0;
    for (let i = 0; i < sampleCount; i++) {
      if (flags & 0x000100) { sum += dv.getUint32(p); p += 4; } // sample_duration
      if (flags & 0x000200) p += 4; // sample_size
      if (flags & 0x000400) p += 4; // sample_flags
      if (flags & 0x000800) p += 4; // composition_time_offset
    }
    return sum;
  };
  /** 读取 tfhd 的 default_sample_duration（trun 缺 per-sample duration 时的兜底） */
  const tfhdDefaultDuration = (tfhdOff: number): number => {
    const flags = fullboxFlags(tfhdOff);
    if (!(flags & 0x000008)) return 0;
    let p = tfhdOff + 16; // 跳过 version/flags + track_ID
    if (flags & 0x000001) p += 8; // base_data_offset
    if (flags & 0x000002) p += 4; // sample_description_index
    return dv.getUint32(p);
  };
  while (offset + 8 <= buffer.length) {
    const size = dv.getUint32(offset);
    // 结构非法（如传入的是 TS 流）时立即停止，保证不影响原始数据
    if (size < 8 || offset + size > buffer.length) break;
    if (boxType(offset) === "moof") {
      moofCount++;
      const moofEnd = offset + size;
      let p = offset + 8;
      while (p + 8 <= moofEnd) {
        const subSize = dv.getUint32(p);
        if (subSize < 8 || p + subSize > moofEnd) break;
        const subType = boxType(p);
        if (subType === "mfhd" && subSize >= 16) {
          // mfhd: size+type+version/flags+sequence_number，重写为递增序号
          dv.setUint32(p + 12, seq++);
        } else if (subType === "traf") {
          // traf 内先定位 tfhd/tfdt/trun，再统一修复
          let q = p + 8;
          const trafEnd = p + subSize;
          let tfhdOff = -1;
          let tfdtOff = -1;
          let trunOff = -1;
          while (q + 8 <= trafEnd) {
            const ss = dv.getUint32(q);
            if (ss < 8 || q + ss > trafEnd) break;
            const t2 = boxType(q);
            if (t2 === "tfhd") tfhdOff = q;
            else if (t2 === "tfdt") tfdtOff = q;
            else if (t2 === "trun") trunOff = q;
            q += ss;
          }
          if (tfhdOff >= 0 && subSize >= 12) {
            // 补 default-base-is-moof（tfhd flags 第 17 位）：声明数据偏移相对 moof 起点
            const flagsOff = tfhdOff + 9;
            const fixed = fullboxFlags(tfhdOff) | 0x020000;
            buffer[flagsOff] = (fixed >> 16) & 0xff;
            buffer[flagsOff + 1] = (fixed >> 8) & 0xff;
            buffer[flagsOff + 2] = fixed & 0xff;
          }
          // 重写 tfdt 为该轨累计解码时长：本片时长优先取 trun 逐 sample 之和，缺省时用 tfhd 默认时长兜底
          if (tfdtOff >= 0 && tfhdOff >= 0 && trunOff >= 0) {
            const trackId = dv.getUint32(tfhdOff + 12);
            let pieceDur = sumTrunSampleDurations(trunOff);
            if (pieceDur === 0) {
              pieceDur = tfhdDefaultDuration(tfhdOff) * dv.getUint32(trunOff + 12);
            }
            const prev = trackTime.get(trackId) ?? 0;
            if (buffer[tfdtOff + 8] === 0) {
              // tfdt version 0：4 字节时间戳
              dv.setUint32(tfdtOff + 12, prev >>> 0);
            } else {
              // tfdt version 1：8 字节时间戳（高 32 位清零，低 32 位写累计值）
              dv.setUint32(tfdtOff + 12, 0);
              dv.setUint32(tfdtOff + 16, prev >>> 0);
            }
            trackTime.set(trackId, prev + pieceDur);
          }
        }
        p += subSize;
      }
    }
    offset += size;
  }
  return moofCount;
}

/** 将 initSegment 数据前置到分片 buffer */
function addInitSegmentData(buffer: ArrayBuffer, initSegment: any, initData: Map<string, any>): ArrayBuffer {
  let initSegmentData = initData.get(initSegment.url);
  if (!initSegmentData && initSegment.data) {
    initSegmentData = initSegment.data.buffer;
  }
  const initLength = initSegmentData.byteLength;
  const newData = new Uint8Array(initLength + buffer.byteLength);
  newData.set(new Uint8Array(initSegmentData), 0);
  newData.set(new Uint8Array(buffer), initLength);
  return newData.buffer;
}

/**
 * 分片下载器（事件驱动）
 * 迁移自 js/m3u8.downloader.js 的 Downloader 类
 */
export class M3u8Downloader {
  _fragments: Fragment[];
  allFragments: Fragment[];
  thread: number;
  events: Record<string, Function[]>;
  decrypt: ((buffer: ArrayBuffer, fragment: Fragment) => Promise<ArrayBuffer>) | null;
  transcode: ((buffer: ArrayBuffer, fragment: Fragment) => Promise<ArrayBuffer>) | null;
  index: number;
  buffer: ArrayBuffer[];
  state: "waiting" | "running" | "done" | "abort" | "pause";
  /** 已成功完成的分片集合（暂停/继续场景判定未完成分片，buffer 会被 sequentialPush 清空不可依赖） */
  completedSet: Set<Fragment>;
  success: number;
  errorList: Set<Fragment>;
  buffersize: number;
  duration: number;
  pushIndex: number;
  controller: AbortController[];
  running: number;
  /** 每个分片已自动重试的次数（fragment -> count） */
  retryCountMap: Map<Fragment, number>;
  /** 单个分片首次失败后的最大自动重试次数 */
  autoRetry: number;

  /** 初始化下载器 */
  constructor(fragments: Fragment[] = [], thread: number = 6, autoRetry: number = MAX_AUTO_RETRY) {
    this.allFragments = fragments;
    this.thread = thread;
    this.autoRetry = autoRetry;
    this.events = {};
    this.decrypt = null;
    this.transcode = null;
    this.fragments = fragments;
    this.init();
  }

  /** 初始化所有变量 */
  init() {
    this.index = 0;
    this.buffer = [];
    this.state = "waiting";
    this.completedSet = new Set();
    this.success = 0;
    this.errorList = new Set();
    this.buffersize = 0;
    this.duration = 0;
    this.pushIndex = 0;
    this.controller = [];
    this.running = 0;
    this.retryCountMap = new Map();
  }

  /** 设置监听 */
  on(eventName: string, callBack: Function) {
    if (this.events[eventName]) {
      this.events[eventName].push(callBack);
    } else {
      this.events[eventName] = [callBack];
    }
  }

  /** 触发监听器 */
  emit(eventName: string, ...args: any[]) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(callBack => callBack(...args));
    }
  }

  /** 设定解密函数 */
  setDecrypt(callback: (buffer: ArrayBuffer, fragment: Fragment) => Promise<ArrayBuffer>) {
    this.decrypt = callback;
  }

  /** 设定转码函数 */
  setTranscode(callback: (buffer: ArrayBuffer, fragment: Fragment) => Promise<ArrayBuffer>) {
    this.transcode = callback;
  }

  /** 停止下载（无目标则停止所有线程） */
  stop(index?: number) {
    if (index !== undefined) {
      this.controller[index] && this.controller[index].abort();
      return;
    }
    this.controller.forEach(controller => controller.abort());
    this.state = "abort";
  }

  /** 暂停下载：停止派发新分片并中止进行中的请求（已下载数据保留，可继续） */
  pause() {
    if (this.state !== "running" && this.state !== "waiting") {
      return;
    }
    this.controller.forEach(controller => controller.abort());
    this.state = "pause";
    this.emit("paused");
  }

  /** 继续下载：从中断处恢复，重新派发未完成分片（含被暂停中止的、失败的） */
  resume() {
    if (this.state !== "pause") {
      return;
    }
    // 全部已完成：直接置 done（success 计数与 fragments 总数一致的场景）
    if (this.success >= this.fragments.length) {
      this.state = "done";
      return;
    }
    this.state = "waiting";
    this.controller = [];
    // index 重置到第一个未完成分片：被暂停中止的进行中分片，其 index 可能落后于 this.index
    const first = this.fragments.findIndex(f => !this.completedSet.has(f));
    this.index = first === -1 ? this.fragments.length : first;
    // 按线程数重新派发（downloader 无参模式完成后自动补位领取后续分片）
    while (this.running < this.thread) {
      const before = this.index;
      this.downloader();
      // 无可领取分片（index 未推进）时退出，避免死循环
      if (this.index === before) {
        break;
      }
    }
    this.emit("resumed");
  }

  /** 检查对象是否在错误列表内 */
  isErrorItem(fragment: Fragment): boolean {
    return this.errorList.has(fragment);
  }

  /** 返回所有错误列表 */
  get errorItem(): Set<Fragment> {
    return this.errorList;
  }

  /** 按照顺序推送 buffer 数据 */
  sequentialPush() {
    if (!this.events["sequentialPush"]) {
      return;
    }
    for (; this.pushIndex < this.fragments.length; this.pushIndex++) {
      if (this.buffer[this.pushIndex]) {
        this.emit("sequentialPush", this.buffer[this.pushIndex]);
        delete this.buffer[this.pushIndex];
        continue;
      }
      break;
    }
  }

  /** 限定下载范围 */
  range(start: number = 0, end: number = this.fragments.length): boolean {
    if (start > end) {
      this.emit("error", "start > end");
      return false;
    }
    if (end > this.allFragments.length) {
      this.emit("error", "end > total");
      return false;
    }
    if (start >= this.allFragments.length) {
      this.emit("error", "start >= total");
      return false;
    }
    if (start !== 0 || end !== this.allFragments.length) {
      this.fragments = this.allFragments.slice(start, end);
      this.fragments.forEach((fragment, index) => {
        fragment.index = index;
      });
    }
    if (this.fragments.length === 0) {
      this.emit("error", "List is empty");
      return false;
    }
    return true;
  }

  /** 获取切片总数量 */
  get total(): number {
    return this.fragments.length;
  }

  /** 获取切片总时间 */
  get totalDuration(): number {
    return this.fragments.reduce(
      (total, fragment) => total + fragment.duration,
      0
    );
  }

  /** 切片对象数组的 setter（自动添加 index） */
  set fragments(fragments: Fragment[]) {
    this._fragments = fragments.map((fragment, index) => ({
      ...fragment,
      index
    }));
  }

  /** 切片对象数组的 getter */
  get fragments(): Fragment[] {
    return this._fragments;
  }

  /** 获取 #EXT-X-MAP 标签的文件 URL */
  get mapTag(): string {
    if (this.fragments[0] && this.fragments[0].initSegment && this.fragments[0].initSegment.url) {
      return this.fragments[0].initSegment.url;
    }
    return "";
  }

  /** 添加一条新资源 */
  push(fragment: Fragment) {
    fragment.index = this.fragments.length;
    this.fragments.push(fragment);
  }

  /**
   * 下载器：使用 fetch 下载单个分片
   * @param fragment 指定分片（对象/索引）下载；为空时从队列顺序取下一个
   * @param _autoRetry 内部标记：由自动重试逻辑发起的调用，不重置该分片的重试计数
   */
  downloader(fragment: Fragment | number | null = null, _autoRetry = false) {
    if (this.state === "abort" || this.state === "pause") {
      return;
    }
    const directDownload = !!fragment;
    if (!directDownload) {
      // 主循环领取：跳过已成功完成的分片（暂停后继续场景，index 之前可能残留已完成分片）
      while (this.fragments[this.index] && this.completedSet.has(this.fragments[this.index])) {
        this.index++;
      }
      if (!this.fragments[this.index]) {
        return;
      }
    }
    if (typeof fragment === "number") {
      fragment = this.fragments[fragment];
    }
    fragment = fragment || this.fragments[this.index++];
    // 外部手动指定下载（含手动重试单个分片）：给该分片全新的自动重试机会
    if (directDownload && !_autoRetry) {
      this.retryCountMap.delete(fragment);
    }
    this.state = "running";
    this.running++;
    const controller = new AbortController();
    this.controller[fragment.index] = controller;
    const options: any = { signal: controller.signal };
    this.emit("start", fragment, options);
    if (fragment.byteRange && fragment.byteRange.length === 2) {
      options.headers = {
        ...options.headers,
        Range: `bytes=${fragment.byteRange[0]}-${fragment.byteRange[1] - 1}`
      };
    }
    fetch(fragment.url, options)
      .then(response => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        const reader = (response as any).body.getReader();
        const contentLength =
          parseInt(response.headers.get("content-length")) || 0;
        fragment.contentType = response.headers.get("content-type") ?? "null";
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            if (fragment.fileStream) {
              fragment.fileStream.write(new Uint8Array(value));
            } else {
              chunks.push(value);
            }
            receivedLength += value.length;
            this.emit("itemProgress", fragment, false, receivedLength, contentLength, value);
          }
          if (fragment.fileStream) {
            return new ArrayBuffer();
          }
          const allChunks = new Uint8Array(receivedLength);
          let position = 0;
          for (const chunk of chunks) {
            allChunks.set(chunk, position);
            position += chunk.length;
          }
          this.emit("itemProgress", fragment, true);
          return allChunks.buffer;
        };
        return pump();
      })
      .then(buffer => {
        this.emit("rawBuffer", buffer, fragment);
        return this.decrypt ? this.decrypt(buffer, fragment) : buffer;
      })
      .then(buffer => {
        this.emit("decryptedData", buffer, fragment);
        return this.transcode ? this.transcode(buffer, fragment) : buffer;
      })
      .then(buffer => {
        this.buffer[fragment.index] = buffer;
        this.completedSet.add(fragment);
        this.success++;
        this.buffersize += buffer.byteLength;
        this.duration += fragment.duration ?? 0;
        this.errorList.has(fragment) && this.errorList.delete(fragment);
        this.retryCountMap.delete(fragment);
        this.sequentialPush();
        this.emit("completed", buffer, fragment);
        if (this.success === this.fragments.length) {
          this.state = "done";
          this.emit("allCompleted", this.buffer, this.fragments);
        }
      })
      .catch(error => {
        console.log(error);
        if (error.name === "AbortError") {
          this.emit("stop", fragment, error);
          return;
        }
        // 自动重试：未达上限且下载未被全局中止（如解密失败 down.stop()）时，退避后重新下载该分片。
        // 重试期间不标记失败（不发 downloadError/不入 errorList），UI 通过 segmentRetry 事件显示「重试中」
        const retried = this.retryCountMap.get(fragment) ?? 0;
        if (this.state !== "abort" && this.state !== "pause" && retried < this.autoRetry) {
          const nextRetry = retried + 1;
          this.retryCountMap.set(fragment, nextRetry);
          this.emit("segmentRetry", fragment, nextRetry, this.autoRetry, error);
          setTimeout(() => {
            if (this.state === "abort" || this.state === "pause") { return; }
            this.downloader(fragment, true);
          }, RETRY_BASE_DELAY * nextRetry);
          return;
        }
        // 自动重试次数耗尽：标记失败后不再自动处理，等待用户手动重试或跳过失败并合并
        this.emit("downloadError", fragment, error);
        !this.errorList.has(fragment) && this.errorList.add(fragment);
      })
      .finally(() => {
        this.running--;
        if (!directDownload && this.index < this.fragments.length) {
          this.downloader();
        }
      });
  }

  /** 开始下载 */
  start(start: number = 0, end: number = this.fragments.length) {
    if (this.state === "running") {
      this.emit("error", "state running");
      return;
    }
    if (!this.range(start, end)) {
      return;
    }
    this.init();
    for (let i = 0; i < this.thread && i < this.fragments.length; i++) {
      this.downloader();
    }
  }

  /** 销毁：初始化所有变量 */
  destroy() {
    this.stop();
    this._fragments = [];
    this.allFragments = [];
    this.thread = 6;
    this.events = {};
    this.decrypt = null;
    this.transcode = null;
    this.init();
  }
}

/** 下载任务上下文（包含 initSegment 缓存与密钥缓存） */
export interface DownloadContext {
  fragments: Fragment[];
  initData: Map<string, any>;
  keyContent: Map<string, any>;
  decryptor: AESDecryptor;
  skipDecrypt: boolean;
  requestHeaders: any;
  requestId?: string;
  title?: string;
  fileName?: string;
  m3u8Url?: string;
  ffmpegAction?: string;
  taskId?: string;
  quantity?: number;
  isSendFfmpeg?: boolean;
}

/**
 * 执行 m3u8 下载主流程
 * @param ctx 下载上下文
 * @param options 下载选项
 * @param callbacks 进度回调集合
 * @returns 下载器实例
 */
export async function downloadM3u8(
  ctx: DownloadContext,
  options: DownloadOptions,
  callbacks: {
    onSegmentProgress?: (p: SegmentProgress) => void;
    onSegmentComplete?: (index: number, success: number, total: number) => void;
    onSegmentError?: (index: number, error: string, success: number, total: number) => void;
    /** 分片失败但仍在自动重试窗口内：retryCount=第几次重试，maxRetry=上限 */
    onSegmentRetry?: (index: number, retryCount: number, maxRetry: number, error: string) => void;
    onAllCompleted?: (buffer: ArrayBuffer[]) => void;
    onMergeStart?: () => void;
    onStreamWrite?: (buffer: ArrayBuffer) => void;
    onProgress?: (success: number, total: number, buffersize: number, duration: number) => void;
  }
): Promise<M3u8Downloader> {
  const { fragments, initData, keyContent, decryptor } = ctx;
  const down = new M3u8Downloader(fragments, options.threads);

  // 每个分片发起请求前注入页面嗅探到的请求头（Referer/Cookie 等）
  down.on("start", function (fragment: Fragment, requestOptions: any) {
    if (ctx.requestHeaders && Object.keys(ctx.requestHeaders).length) {
      requestOptions.headers = { ...requestOptions.headers, ...ctx.requestHeaders };
    }
  });

  // 分片网格状态计算
  down.setDecrypt(async function (buffer: ArrayBuffer, fragment: Fragment) {
    if (
      ctx.skipDecrypt ||
      !fragment.encrypted ||
      !fragment.decryptdata
    ) {
      if (fragment.initSegment && (!fragment.live || fragment.index === 0)) {
        buffer = addInitSegmentData(buffer, fragment.initSegment, initData);
      }
      return buffer;
    }
    try {
      // 密钥解析（对齐原版 getter 行为）：优先 keyContent Map 按 uri 取（customKey 替换后以 Map 为准），
      // 其次 fragment 内置 keyContent，都没有则现场拉取并缓存
      let keyContentValue = fragment.decryptdata.uri
        ? keyContent.get(fragment.decryptdata.uri)
        : undefined;
      if (!keyContentValue) {
        keyContentValue = fragment.decryptdata.keyContent;
      }
      if (!keyContentValue && fragment.decryptdata.uri) {
        const resp = await fetch(fragment.decryptdata.uri);
        if (!resp.ok) {
          throw new Error(`key HTTP ${resp.status}`);
        }
        keyContentValue = await resp.arrayBuffer();
        if (keyContentValue.byteLength === 16) {
          keyContent.set(fragment.decryptdata.uri, keyContentValue);
        }
      }
      if (!keyContentValue) {
        throw new Error("No key content");
      }
      decryptor.expandKey(keyContentValue);
      const iv =
        fragment.decryptdata.iv ??
        new Uint8Array([
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, fragment.sn
        ]);
      buffer = decryptor.decrypt(buffer, 0, iv.buffer, true);
    } catch (e) {
      callbacks.onSegmentError?.(fragment.index, "decrypt:" + e, down.success, down.total);
      down.stop();
      throw e;
    }
    if (fragment.initSegment) {
      buffer = addInitSegmentData(buffer, fragment.initSegment, initData);
    }
    return buffer;
  });

  // 转码（mp4 / onlyAudio）
  if (options.mp4) {
    let tempBuffer: Uint8Array | null = null;
    let head = true;
    // fMP4 修复状态：片段序号计数器 + 各轨时间累计（trackId → 已累计解码时长）
    let fmp4Seq = 0;
    const fmp4TrackTime = new Map<number, number>();
    const transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: false,
      remux: !options.onlyAudio
    });
    transmuxer.on("data", function (segment: any) {
      if (options.onlyAudio && segment.type !== "audio") {
        return;
      }
      if (head) {
        const data = new Uint8Array(
          segment.initSegment.byteLength + segment.data.byteLength
        );
        data.set(segment.initSegment, 0);
        data.set(segment.data, segment.initSegment.byteLength);
        tempBuffer = fixFileDuration(data, down.totalDuration);
        return;
      }
      tempBuffer = segment.data;
    });
    down.setTranscode(async function (buffer: ArrayBuffer, fragment: Fragment) {
      head = fragment.index === 0;
      transmuxer.push(new Uint8Array(buffer));
      transmuxer.flush();
      if (tempBuffer) {
        // 修复 mux.js 产出的 fMP4 封装（序号递增 + 数据基准声明 + 时间轴连续），
        // 否则产物只有浏览器能播：QuickTime 等本地播放器黑屏，或只能播开头几秒；
        // 修复状态跨分片累计，保证合并后整条流序号单调、时间轴全局连续
        fmp4Seq += fixFmp4Container(tempBuffer, fmp4Seq, fmp4TrackTime);
        return tempBuffer.buffer;
      }
      return buffer;
    });
  }

  // 分片自动重试（尚未标记失败）：通知 UI 显示「重试 n/max」
  down.on("segmentRetry", function (fragment: Fragment, retryCount: number, maxRetry: number, error: any) {
    callbacks.onSegmentRetry?.(fragment.index, retryCount, maxRetry, String(error));
  });

  // 下载错误（自动重试耗尽后的最终失败）
  down.on("downloadError", function (fragment: Fragment, error: any) {
    callbacks.onSegmentError?.(fragment.index, String(error), down.success, down.total);
    broadcastProgress({
      type: "error",
      requestId: ctx.requestId,
      index: fragment.index,
      error: String(error),
      success: down.success,
      totalCount: down.total
    });
  });

  // 切片下载完成
  down.on("completed", function (buffer: ArrayBuffer, fragment: Fragment) {
    callbacks.onSegmentComplete?.(fragment.index, down.success, down.total);
    callbacks.onProgress?.(down.success, down.total, down.buffersize, down.duration);
    broadcastProgress({
      type: "completed",
      requestId: ctx.requestId,
      index: fragment.index,
      success: down.success,
      totalCount: down.total
    });
  });

  // 全部下载完成
  down.on("allCompleted", async function (buffer: ArrayBuffer[]) {
    broadcastProgress({
      type: "merging",
      requestId: ctx.requestId,
      success: down.success,
      totalCount: down.total
    });
    callbacks.onAllCompleted?.(buffer);
  });

  // 单个项目下载进度（节流 233ms）
  let lastEmitted = Date.now();
  down.on("itemProgress", function (fragment: Fragment, state: any, receivedLength: number, contentLength: number) {
    if (Date.now() - lastEmitted >= 233) {
      callbacks.onSegmentProgress?.({
        index: fragment.index,
        state: "downloading",
        received: receivedLength,
        total: contentLength,
        retryCount: 0
      });
      lastEmitted = Date.now();
    }
    broadcastProgress({
      type: "progress",
      requestId: ctx.requestId,
      index: fragment.index,
      received: receivedLength,
      total: contentLength,
      success: down.success,
      totalCount: down.total,
      running: down.running
    });
  });

  // 流式写入
  if (options.streamSaver) {
    down.on("sequentialPush", function (buffer: ArrayBuffer) {
      callbacks.onStreamWrite?.(buffer);
    });
  }

  return down;
}

/**
 * 合并下载完成的分片为最终文件并调用 chrome.downloads
 * @param down 下载器实例
 * @param ctx 下载上下文
 * @param options 下载选项
 * @param fileStream 流式写入流（若存在则已通过流写入，跳过合并）
 */
export function mergeTs(
  down: M3u8Downloader,
  ctx: DownloadContext,
  options: DownloadOptions,
  fileStream?: any,
  /** 落盘终态回调（仅本页直接保存路径；ffmpeg 接管路径不落此回调）：成功后才销毁 down 释放 buffer */
  onSettled?: (ok: boolean, error?: string) => void
): void {
  // 强制合并（跳过失败分片）场景：buffer 中失败/未下载分片为空洞，
  // Blob 会把空洞序列化成 "undefined" 字符串写入文件，必须先过滤
  const fileBlob = new Blob(down.buffer.filter((b: ArrayBuffer | null) => b), {
    type: down.transcode ? "video/mp4" : "video/MP2T"
  });
  let ext = (
    down.mapTag && !down.mapTag.startsWith("data:")
      ? down.mapTag
      : down.fragments[0].url
  )
    .split("/")
    .pop();
  ext = ext.split("?").shift();
  ext = ext.split(".").pop();
  ext = ext ? ext : "ts";
  ext = down.transcode ? "mp4" : ext;

  let fileName = "";
  if (options.customFilename) {
    fileName = options.customFilename;
  } else if (ctx.fileName) {
    fileName = ctx.fileName;
  } else {
    fileName = GetFileName(ctx.m3u8Url || "");
  }
  let originalExt: string | null = null;
  if (/\.[a-zA-Z0-9]{1,4}$/.test(fileName)) {
    fileName = fileName.split(".");
    originalExt = fileName.pop();
    fileName = fileName.join(".");
  }

  /** 关联的嗅探资源 id：透传给 apiDownload，用于向 sidepanel 广播终态 */
  const requestId = ctx.requestId;

  if (options.ffmpeg || ctx.ffmpegAction || ctx.isSendFfmpeg) {
    if (!G.isFirefox && fileBlob.size > G.chromeLimitSize) {
      apiDownload(fileBlob, fileName, ext, options, requestId, (ok, error) => {
        if (ok) { down.destroy(); }
        onSettled?.(ok, error);
      });
      return;
    }
    if (options.customFilename && originalExt) {
      fileName += "." + originalExt;
    } else if (ext !== "mp4" && ext !== "mp3") {
      fileName = fileName + ".mp4";
    } else {
      fileName = fileName + "." + ext;
    }
    let action = options.onlyAudio ? "onlyAudio" : "transcode";
    if (ctx.ffmpegAction) {
      action = ctx.ffmpegAction;
    }
    if (ctx.isSendFfmpeg) {
      action = "addFile";
    }
    const data = {
      Message: "catCatchFFmpeg",
      action: action,
      files: [
        {
          data: G.isFirefox ? fileBlob : URL.createObjectURL(fileBlob),
          name: `memory${new Date().getTime()}.${ext}`
        }
      ],
      title: fileName,
      output: fileName,
      name: "memory" + new Date().getTime() + "." + ext,
      active: G.isMobile,
      tabId: 0
    };
    if (ctx.quantity) {
      data.quantity = ctx.quantity;
    }
    if (ctx.taskId) {
      data.taskId = ctx.taskId;
    }
    chrome.runtime.sendMessage(data, function (response) {
      // background 正常回 "ok"：ffmpeg 页面已接管，最终文件（mp4）由 ffmpeg 产出，
      // 本页不再额外保存原始分片，否则会多出一个「xxx.mp4.ts」残留文件
      if (!chrome.runtime?.lastError && response === "ok") {
        down.destroy();
        // 通知 sidepanel 下载流程结束（否则资源行会一直停在“合并中”）
        broadcastProgress({ type: "complete", requestId });
        // ffmpeg 已接管转码与落盘（终态由 ffmpeg 页保证），本页视为保存成功
        onSettled?.(true);
        return;
      }
      // ffmpeg 不可用时兜底走浏览器直接下载
      apiDownload(fileBlob, fileName, ext, options, requestId, (ok, error) => {
        if (ok) { down.destroy(); }
        onSettled?.(ok, error);
      });
    });
  } else {
    // 文件名自带合法扩展名（如 URL 参数 filename=xxx.mp4）时优先沿用，否则用分片 URL 推断的 ext
    // destroy 推迟到落盘成功：保存失败时 buffer 仍保留，支持不重新下载直接重试保存
    apiDownload(fileBlob, fileName, originalExt || ext, options, requestId, (ok, error) => {
      if (ok) { down.destroy(); }
      onSettled?.(ok, error);
    });
  }
}

/**
 * 调用 chrome.downloads API 下载合并后的 Blob
 * @param fileBlob 文件 Blob
 * @param fileName 文件名（不含扩展名）
 * @param ext 扩展名
 * @param options 下载选项
 * @param requestId 关联的嗅探资源 id（透传给进度广播，sidepanel 据此结束“合并中”态；可空）
 */
export function apiDownload(
  fileBlob: Blob,
  fileName: string,
  ext: string,
  options: DownloadOptions,
  requestId?: string,
  /** 落盘终态回调：complete → (true)；中断/发起失败 → (false, 原因)。不静默吞任何失败 */
  onSettled?: (ok: boolean, error?: string) => void
): void {
  chrome.downloads.download(
    {
      url: URL.createObjectURL(fileBlob),
      filename: fileName + "." + ext,
      saveAs: options.saveAs
    },
    function (downloadId: number) {
      if (downloadId) {
        // 广播：文件已提交浏览器，正在写入磁盘
        broadcastProgress({ type: "saving", requestId });
        /** 终态是否已结算（防止 onChanged 与 search 兜底重复广播） */
        let settled = false;
        /** 下载到达终态（完成/中断）后结算：广播 complete + 回传落盘结果 */
        const finish = function (ok: boolean, error?: string) {
          if (settled) {
            return;
          }
          settled = true;
          chrome.downloads.onChanged.removeListener(onComplete);
          broadcastProgress({ type: "complete", requestId });
          onSettled?.(ok, error);
          if (ok && options.autoClose) {
            setTimeout(() => window.close(), 300);
          }
        };
        const onComplete = function (delta: any) {
          if (
            delta.id === downloadId &&
            delta.state &&
            (delta.state.current === "complete" ||
              delta.state.current === "interrupted")
          ) {
            finish(
              delta.state.current === "complete",
              delta.state.current === "interrupted"
                ? delta.error?.current || "下载中断"
                : undefined
            );
          }
        };
        chrome.downloads.onChanged.addListener(onComplete);
        // 兜底：小文件可能在监听挂载前就已写完，主动查询一次当前状态
        chrome.downloads.search({ id: downloadId }, function (items) {
          const state = items && items[0] && items[0].state;
          if (state === "complete" || state === "interrupted") {
            finish(
              state === "complete",
              state === "interrupted"
                ? items[0].error || "下载中断"
                : undefined
            );
          }
        });
      } else if (
        chrome.runtime?.lastError?.message === "Invalid filename"
      ) {
        apiDownload(fileBlob, stringModify(fileName), ext, options, requestId, onSettled);
      } else {
        // 其余失败（用户取消保存对话框 / 浏览器拒绝等）不再静默吞掉，如实上抛
        onSettled?.(false, chrome.runtime?.lastError?.message || "保存发起失败");
      }
    }
  );
}

/**
 * 解析 m3u8 文本内容为分片列表（轻量级纯文本解析，不依赖 hls.js）
 * 当无 hls.js 时作为 fallback；优先使用 hls.js 的解析能力
 * @param m3u8Text m3u8 文本
 * @param baseUrl 基础 URL（用于补全相对路径）
 * @returns 分片列表与加密信息
 */
export function m3u8Parser(
  m3u8Text: string,
  baseUrl: string = ""
): {
  fragments: Fragment[];
  totalDuration: number;
  isEncrypted: boolean;
  isSampleAES: boolean;
  live: boolean;
} {
  const lines = m3u8Text.split("\n");
  const fragments: Fragment[] = [];
  let totalDuration = 0;
  let isEncrypted = false;
  let isSampleAES = false;
  let live = true;
  let extInf = 0;
  let byteRange: number[] | undefined;
  let encryptionMethod = "";
  let keyUrl = "";
  let iv: Uint8Array | undefined;
  let initSegmentUrl = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("#EXT-X-ENDLIST")) {
      live = false;
    } else if (line.startsWith("#EXT-X-KEY")) {
      isEncrypted = true;
      const methodMatch = /METHOD=([A-Z0-9-]+)/.exec(line);
      if (methodMatch) {
        encryptionMethod = methodMatch[1];
        if (encryptionMethod === "SAMPLE-AES-CTR") {
          isSampleAES = true;
        }
      }
      const uriMatch = /URI="([^"]+)"/.exec(line);
      if (uriMatch) {
        keyUrl = uriMatch[1];
        if (baseUrl && !/^[\w]+:.+/i.test(keyUrl)) {
          // 相对路径按 manifest URL 规范解析（原版由 hls.js 完成），避免字符串拼接产生坏地址
          try {
            keyUrl = new URL(keyUrl, baseUrl).href;
          } catch {
            keyUrl = baseUrl + keyUrl;
          }
        }
      }
      const ivMatch = /IV=0x([0-9a-fA-F]+)/.exec(line);
      if (ivMatch) {
        iv = StringToUint8Array(ivMatch[1]);
      }
    } else if (line.startsWith("#EXT-X-MAP")) {
      const uriMatch = /URI="([^"]+)"/.exec(line);
      if (uriMatch) {
        initSegmentUrl = uriMatch[1];
        if (baseUrl && !/^[\w]+:.+/i.test(initSegmentUrl)) {
          // 同 keyUrl：相对路径按 URL 规范解析
          try {
            initSegmentUrl = new URL(initSegmentUrl, baseUrl).href;
          } catch {
            initSegmentUrl = baseUrl + initSegmentUrl;
          }
        }
      }
    } else if (line.startsWith("#EXTINF")) {
      const match = /#EXTINF:([\d.]+)/.exec(line);
      extInf = match ? parseFloat(match[1]) : 0;
    } else if (line.startsWith("#EXT-X-BYTERANGE")) {
      const match = /#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?/.exec(line);
      if (match) {
        const length = parseInt(match[1]);
        const start = match[2] ? parseInt(match[2]) : 0;
        byteRange = [start, start + length];
      }
    } else if (!line.startsWith("#")) {
      let url = line;
      if (baseUrl && !/^[\w]+:.+/i.test(url)) {
        // 分片相对路径按 manifest URL 规范解析（原版由 hls.js 解析时的行为）
        try {
          url = new URL(url, baseUrl).href;
        } catch {
          url = baseUrl + url;
        }
      }
      fragments.push({
        url,
        duration: extInf,
        sn: fragments.length,
        cc: 0,
        encrypted: isEncrypted,
        byteRange,
        decryptdata: isEncrypted
          ? {
              method: encryptionMethod,
              uri: keyUrl,
              iv
            }
          : undefined,
        initSegment: initSegmentUrl
          ? { url: initSegmentUrl }
          : undefined
      });
      totalDuration += extInf;
      extInf = 0;
      byteRange = undefined;
    }
  }
  return {
    fragments,
    totalDuration,
    isEncrypted,
    isSampleAES,
    live
  };
}
