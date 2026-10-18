// @ts-nocheck
/**
 * 分片进度区与切片列表
 * 迁移自 m3u8.html 的 #textarea 区块与 js/m3u8.js 的分片相关逻辑
 *
 * 结构（自上而下）：
 * - ProgressOverview 进度区：左（数量+百分比+分片网格）右（环形饼图+大小/时长图例）
 * - 查看所有切片 details（默认收起）：每个切片一行，显示序号 / 地址 / 下载百分比，失败可单独重试
 */
import React, { useState, useEffect } from "react";
import { i18n } from "~lib/init";
import { byteToSize, secToTime } from "~lib/function";
import { useM3u8Store } from "~components/tabs/m3u8/store";
import type { SegmentProgress } from "~lib/m3u8-parser";

/** 单个切片项：序号 / 地址 / 下载百分比，失败时可单独重试 */
function SegmentItem({ seg }: { seg: SegmentProgress }) {
  const { retrySegment } = useM3u8Store();
  const percent =
    seg.state === "error"
      ? (seg as any).error || String(i18n.dataFetchFailed)
      : seg.state === "downloading" && seg.retryCount > 0
        ? `${i18n.retryDownload} ${seg.retryCount}/${seg.maxRetry ?? 2}…`
        : seg.total > 0
          ? ((seg.received / seg.total) * 100).toFixed(2) + "%"
          : seg.state === "success"
            ? "100%"
            : i18n.waitDownload;
  return (
    <div id={`downItem${seg.index}`} className="downItem">
      {/* 序号 */}
      <span className="downIndex">#{seg.index + 1}</span>
      {/* 分片地址（点击可打开） */}
      <a href={seg.url} target="_blank" rel="noreferrer" title={seg.url}>
        {seg.url}
      </a>
      {/* 下载百分比 / 错误信息 */}
      <span
        className={`percentage ${seg.state === "error" ? "error" : ""}`}
        title={percent}
      >
        {percent}
      </span>
      {/* 失败重试 */}
      {seg.state === "error" && (
        <button onClick={() => retrySegment(seg.index)}>
          {i18n.retryDownload}
        </button>
      )}
    </div>
  );
}

/** 进度区：四项指标（数量/大小/时长/百分比）+ 分片网格 */
function ProgressOverview() {
  const { segments, progress, playlist } = useM3u8Store();
  if (!segments.length) {
    return null;
  }
  const pct = progress.total
    ? Math.floor((progress.success / progress.total) * 100)
    : 0;
  const totalSize = playlist?.estimateFileSize || 0;
  const totalDuration = playlist?.totalDuration || 0;

  return (
    <div className="progressArea">
      {/* 四项指标：数量 / 大小 / 时长 / 百分比 */}
      <div className="progressStats">
        <div>
          <div className="progressStatLabel">{i18n.slices}</div>
          <div className="progressStatValue">
            {progress.success}/{progress.total}
          </div>
        </div>
        <div>
          <div className="progressStatLabel">{i18n.downloaded}</div>
          <div className="progressStatValue">
            {byteToSize(progress.buffersize)}
            {totalSize > 0 && ` / ${byteToSize(totalSize)}`}
          </div>
        </div>
        <div>
          <div className="progressStatLabel">{i18n.downloadedVideoLength}</div>
          <div className="progressStatValue">
            {secToTime(progress.duration)}
            {totalDuration > 0 && ` / ${secToTime(totalDuration)}`}
          </div>
        </div>
        <div>
          <div className="progressStatLabel">{i18n.downloadProgress}</div>
          <div className="progressStatValue">{pct}%</div>
        </div>
      </div>

      {/* 分片网格：灰=等待 绿=成功 红=失败 */}
      <div className="fragGrid">
        {segments.map(seg => (
          <span
            key={seg.index}
            className={`fragCell ${
              seg.state === "success"
                ? "ok"
                : seg.state === "error"
                  ? "err"
                  : ""
            }`}
            data-idx={seg.index}
            title={`#${seg.index + 1} ${seg.state}`}
          />
        ))}
      </div>
    </div>
  );
}

/** 切片列表与进度总览 */
export function M3u8DownloadList() {
  const { segments, progress, playlist, downloadState } = useM3u8Store();

  /** 下载启动后无需切换视图（列表常显于折叠区内） */

  /** 无 playlist 时不渲染 */
  if (!playlist) {
    return null;
  }

  return (
    <div className="block" id="textarea">
      {/* 进度区：左网格右饼图 */}
      <ProgressOverview />

      {/* 查看所有切片：默认收起，展开后显示每个切片的序号/地址/下载百分比 */}
      <details>
        <summary className="button">{i18n.viewSlices}</summary>
        <div id="downList">
          {segments.length
            ? segments.map(seg => (
                <SegmentItem key={seg.index} seg={seg} />
              ))
            : i18n.waitDownload}
        </div>
      </details>
    </div>
  );
}
