// @ts-nocheck
/**
 * MPD 轨道下载列表：每轨一行，含类型/分辨率/编码/勾选/进度条/下载按钮
 * 以及顶部全轨下载/停止按钮与整体进度。
 */
import React from "react";
import { i18n } from "~lib/init";
import { useMpdStore } from "~components/tabs/mpd/store";
import type { MpdTrack } from "~lib/mpd-core";

/** 单条轨道行 */
function TrackRow({ track }: { track: MpdTrack }) {
  const { toggleTrack, selectPreview } = useMpdStore();
  const typeText =
    track.type === "video"
      ? i18n.video || "video"
      : track.type === "audio"
        ? i18n.audio || "audio"
        : "text";
  const resolution =
    track.width && track.height ? `${track.width}x${track.height}` : "-";
  const codec = track.codec || "-";
  const bandwidth = track.bandwidth
    ? `${(track.bandwidth / 1000).toFixed(0)}Kbps`
    : "-";
  const isComplete = track.state === "complete";
  const isError = track.state === "error";
  const isDownloading = track.state === "downloading";

  return (
    <div
      className="flex"
      style={{
        alignItems: "center",
        padding: "6px 0",
        borderBottom: "1px solid #eee"
      }}
    >
      <input
        type="checkbox"
        checked={track.selected}
        onChange={() => toggleTrack(track.id)}
        style={{ marginRight: 8 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>
          <b>{typeText}</b> | {track.label}
        </div>
        <div style={{ fontSize: 12, color: "#666" }}>
          {resolution} | {codec} | {bandwidth} | {track.segmentCount} slices
        </div>
        {/* 单轨进度条 */}
        {(isDownloading || isComplete || isError) && (
          <div
            style={{
              marginTop: 4,
              height: 6,
              background: "#eee",
              borderRadius: 3,
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: `${track.progress}%`,
                height: "100%",
                background: isError
                  ? "#e74c3c"
                  : isComplete
                    ? "#27ae60"
                    : "#3498db",
                transition: "width .2s"
              }}
            />
          </div>
        )}
      </div>
      <button
        onClick={() => selectPreview(track.type, track.id)}
        style={{ marginLeft: 8 }}
      >
        {i18n.preview || "preview"}
      </button>
    </div>
  );
}

/** 轨道下载列表组件 */
export function MpdDownloadList() {
  const {
    tracks,
    downloadState,
    downloadProgress,
    startDownload,
    stopDownload,
    error
  } = useMpdStore();
  const selectedCount = tracks.filter(t => t.selected).length;
  const isBusy = downloadState === "downloading" || downloadState === "merging";

  return (
    <div className="block">
      <div className="flex" style={{ marginBottom: 8, alignItems: "center" }}>
        <button
          onClick={startDownload}
          disabled={isBusy || selectedCount === 0}
          data-i18n="download"
          style={{ marginRight: 8 }}
        >
          {i18n.download || "download"}
        </button>
        {isBusy && (
          <button onClick={stopDownload} style={{ marginRight: 8 }}>
            {i18n.stop || "stop"}
          </button>
        )}
        <span style={{ fontSize: 12, color: "#666" }}>
          {selectedCount}/{tracks.length} {i18n.selected || "selected"}
        </span>
      </div>

      {/* 整体进度条 */}
      {isBusy && (
        <div
          style={{
            height: 8,
            background: "#eee",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 8
          }}
        >
          <div
            style={{
              width: `${downloadProgress}%`,
              height: "100%",
              background: "#3498db",
              transition: "width .3s"
            }}
          />
        </div>
      )}

      {error && (
        <div style={{ color: "#e74c3c", marginBottom: 8 }}>{error}</div>
      )}

      {/* 轨道列表 */}
      <div>
        {tracks.map(t => (
          <TrackRow key={`${t.type}-${t.id}`} track={t} />
        ))}
      </div>
    </div>
  );
}
