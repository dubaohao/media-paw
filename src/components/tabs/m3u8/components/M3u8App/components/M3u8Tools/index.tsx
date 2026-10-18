// @ts-nocheck
/**
 * 操作按钮区
 * 迁移自 m3u8.html 的 #mergeDown 区域与 js/m3u8.js 的按钮绑定
 *
 * 展示优化：线程数、MP4、仅音频、边下边存、另存为、跳过解密、自动关闭、下载范围
 * 等选项不再在页面展示（保留默认值逻辑，统一在设置页 M3u8ParserSection 配置），
 * 仅保留操作按钮：合并下载 / 停止下载 / 重下失败项 / 跳过失败并合并 / 发送到 FFmpeg
 */
import React from "react";
import { i18n } from "~lib/init";
import { useM3u8Store } from "~components/tabs/m3u8/store";

/** 操作按钮面板 */
export function M3u8Tools() {
  const {
    options,
    updateOptions,
    startDownload,
    retryAllErrors,
    forceMerge,
    downloadState,
    playlist,
    segments,
    progress
  } = useM3u8Store();

  const isDownloading =
    downloadState === "downloading" || downloadState === "merging";
  /** 失败分片数 */
  const errorCount = segments.filter(s => s.state === "error").length;
  /** 合并流程已启动（merging/complete）后不再显示重试与强制合并入口 */
  const mergeStarted = downloadState === "merging" || downloadState === "complete";

  return (
    <div className="block" id="button">
      <div className="merge" id="mergeDown">
        {/* 合并下载 */}
        <button
          id="mergeTs"
          className="button2"
          disabled={isDownloading}
          onClick={startDownload}
        >
          {i18n.mergeDownloads}
        </button>

        {/* 重下失败项：存在失败分片且合并流程未启动时显示 */}
        {errorCount > 0 && !mergeStarted && (
          <button
            id="retryErrors"
            className="button2"
            onClick={retryAllErrors}
          >
            {i18n.redownloadFailedItems}({errorCount})
          </button>
        )}

        {/* 跳过失败并合并：有成功分片且非流式（流式无完整 buffer 无法跳过合并） */}
        {errorCount > 0 && !mergeStarted && progress.success > 0 && !options.streamSaver && (
          <button
            id="forceMerge"
            className="button2"
            onClick={forceMerge}
          >
            {i18n.forceMerge}
          </button>
        )}

        {/* 发送到 FFmpeg */}
        <button
          id="sendFfmpeg"
          className="button"
          onClick={() => {
            updateOptions({ ffmpeg: true, streamSaver: false });
            startDownload();
          }}
        >
          {i18n.sendFfmpeg}
        </button>
      </div>
    </div>
  );
}
