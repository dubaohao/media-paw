/**
 * MP4 盒子结构解析工具
 * 用法: node scripts/mp4-inspect.mjs <mp4文件路径>
 * 输出文件中所有 box 的关键字段，定位时长翻倍根因
 */
import { readFileSync } from "fs";
import { argv } from "process";

const file = argv[2];
if (!file) {
  console.error("用法: node scripts/mp4-inspect.mjs <mp4文件路径>");
  process.exit(1);
}

const buf = readFileSync(file);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const u8 = new Uint8Array(buf);

/** 读 4 字节 ASCII 类型 */
function type4(off) {
  return String.fromCharCode(u8[off], u8[off+1], u8[off+2], u8[off+3]);
}
/** 读 uint32 大端 */
function u32(off) {
  return dv.getUint32(off);
}
/** 读 uint64 大端（返回 BigInt） */
function u64(off) {
  return dv.getBigUint64(off);
}

let moovCount = 0;
let moofCount = 0;
let mdatCount = 0;

/** 递归解析 box */
function parseBox(off, end, depth) {
  const indent = "  ".repeat(depth);
  while (off + 8 <= end) {
    let size = u32(off);
    const type = type4(off + 4);
    if (size < 8 || off + size > end) break;

    // 扩展大小（largesize）
    let hdrLen = 8;
    if (size === 1) {
      size = Number(u64(off + 8));
      hdrLen = 16;
    }
    const bodyOff = off + hdrLen;
    const bodyEnd = off + size;

    if (type === "moov") {
      moovCount++;
      console.log(`${indent}${type} #${moovCount} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "trak") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "mdia") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "minf") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "stbl") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "mvex") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "moof") {
      moofCount++;
      if (moofCount <= 3 || moofCount % 50 === 0 || moofCount > moofCount - 3) {
        console.log(`${indent}${type} #${moofCount} off=${off} size=${size}`);
        parseBox(bodyOff, bodyEnd, depth + 1);
      } else if (moofCount === 4) {
        console.log(`${indent}${type} ... (省略中间)`);
      }
    } else if (type === "traf") {
      console.log(`${indent}${type} off=${off} size=${size}`);
      parseBox(bodyOff, bodyEnd, depth + 1);
    } else if (type === "mvhd") {
      const ver = u8[bodyOff];
      const timescale = u32(bodyOff + 12);
      let duration;
      if (ver === 0) {
        duration = u32(bodyOff + 16);
      } else {
        duration = Number(u64(bodyOff + 20));
      }
      console.log(`${indent}${type} ver=${ver} timescale=${timescale} duration=${duration} (${(duration/timescale).toFixed(2)}s)`);
    } else if (type === "tkhd") {
      const ver = u8[bodyOff];
      let trackId, duration;
      if (ver === 0) {
        trackId = u32(bodyOff + 12);
        duration = u32(bodyOff + 20);
      } else {
        trackId = u32(bodyOff + 20);
        duration = u32(bodyOff + 32);
      }
      const mvhdTs = 90000; // 默认，后续会修正
      console.log(`${indent}${type} ver=${ver} trackId=${trackId} duration=${duration} (${mvhdTs > 0 ? (duration/mvhdTs).toFixed(2)+"s" : "?"})`);
    } else if (type === "mdhd") {
      const ver = u8[bodyOff];
      const timescale = u32(bodyOff + 12);
      let duration;
      if (ver === 0) {
        duration = u32(bodyOff + 16);
      } else {
        duration = Number(u64(bodyOff + 20));
      }
      console.log(`${indent}${type} ver=${ver} timescale=${timescale} duration=${duration} (${(duration/timescale).toFixed(2)}s)`);
    } else if (type === "hdlr") {
      const ver = u8[bodyOff];
      const handlerType = type4(bodyOff + 8);
      console.log(`${indent}${type} ver=${ver} handler=${handlerType}`);
    } else if (type === "trex") {
      const ver = u8[bodyOff];
      const trackId = u32(bodyOff + 4);
      const defaultSampleDuration = u32(bodyOff + 8);
      const defaultSampleSize = u32(bodyOff + 12);
      console.log(`${indent}${type} ver=${ver} trackId=${trackId} defaultSampleDuration=${defaultSampleDuration} defaultSampleSize=${defaultSampleSize}`);
    } else if (type === "mehd") {
      const ver = u8[bodyOff];
      let fragDur;
      if (ver === 0) {
        fragDur = u32(bodyOff + 4);
      } else {
        fragDur = Number(u64(bodyOff + 4));
      }
      console.log(`${indent}${type} ver=${ver} fragmentDuration=${fragDur}`);
    } else if (type === "mfhd") {
      const ver = u8[bodyOff];
      const seq = u32(bodyOff + 4);
      console.log(`${indent}${type} ver=${ver} sequence=${seq}`);
    } else if (type === "tfhd") {
      const ver = u8[bodyOff];
      const flags = (u8[bodyOff+1] << 16) | (u8[bodyOff+2] << 8) | u8[bodyOff+3];
      const trackId = u32(bodyOff + 4);
      console.log(`${indent}${type} ver=${ver} flags=0x${flags.toString(16)} trackId=${trackId}`);
    } else if (type === "tfdt") {
      const ver = u8[bodyOff];
      let decodeTime;
      if (ver === 0) {
        decodeTime = u32(bodyOff + 4);
      } else {
        decodeTime = Number(u64(bodyOff + 4));
      }
      console.log(`${indent}${type} ver=${ver} baseMediaDecodeTime=${decodeTime}`);
    } else if (type === "trun") {
      const ver = u8[bodyOff];
      const flags = (u8[bodyOff+1] << 16) | (u8[bodyOff+2] << 8) | u8[bodyOff+3];
      const sampleCount = u32(bodyOff + 4);
      let p = bodyOff + 8;
      let totalDur = 0;
      if (flags & 0x000001) p += 4; // data_offset
      if (flags & 0x000004) p += 4; // first_sample_flags
      for (let i = 0; i < sampleCount && i < 100; i++) {
        let dur = 0;
        if (flags & 0x000100) { dur = u32(p); p += 4; }
        if (flags & 0x000200) p += 4;
        if (flags & 0x000400) p += 4;
        if (flags & 0x000800) p += 4;
        totalDur += dur;
      }
      console.log(`${indent}${type} ver=${ver} flags=0x${flags.toString(16)} sampleCount=${sampleCount} totalDur(前100个)=${totalDur}`);
    } else if (type === "mdat") {
      mdatCount++;
      console.log(`${indent}${type} #${mdatCount} off=${off} size=${size}`);
    } else if (type === "ftyp" || type === "free" || type === "styp") {
      console.log(`${indent}${type} off=${off} size=${size}`);
    } else {
      console.log(`${indent}${type} off=${off} size=${size}`);
    }

    off += size;
  }
}

console.log(`\n=== MP4 文件结构分析 ===`);
console.log(`文件: ${file}`);
console.log(`文件大小: ${buf.length} bytes (${(buf.length/1024/1024).toFixed(2)} MB)\n`);

parseBox(0, buf.length, 0);

console.log(`\n=== 汇总 ===`);
console.log(`moov 数量: ${moovCount}`);
console.log(`moof 数量: ${moofCount}`);
console.log(`mdat 数量: ${mdatCount}`);
if (moovCount > 1) {
  console.log("⚠️  发现多个 moov 盒子！这可能导致时长翻倍。");
}
if (moofCount > 0) {
  console.log(`moof 数量 / 2 (每 buffer 2 moof) = ${Math.floor(moofCount/2)} 个分片`);
}
