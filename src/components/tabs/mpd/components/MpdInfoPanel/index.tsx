// @ts-nocheck
/**
 * MPD 信息面板：展示清单 URL/时长/轨道数/DRM/分片预览/视频音频下拉与转换按钮
 * 迁移自 mpd.html 的 #main 区块，保留原 CSS 类名（block/flex/select/line 等）。
 */
import React from "react";
import { i18n } from "~lib/init";
import { formatDuration } from "~lib/mpd-core";
import { useMpdStore } from "~components/tabs/mpd/store";

/** MPD 信息面板组件 */
export function MpdInfoPanel() {
  const {
    mpdUrl,
    duration,
    drm,
    tracks,
    previewType,
    previewId,
    segmentText,
    initUri,
    countText,
    selectPreview,
    convertToM3U8
  } = useMpdStore();

  const videoTracks = tracks.filter(t => t.type === "video");
  const audioTracks = tracks.filter(t => t.type === "audio");

  /** 获取当前预览轨道的显示文本 */
  const previewLabel = (() => {
    const t = tracks.find(
      x => x.id === previewId && x.type === previewType
    );
    if (!t) { return ""; }
    return `${t.type === "video" ? i18n.video : i18n.audio}: ${t.label}`;
  })();

  return (
    <div className="optionBox">
      {/* MPD URL */}
      <div className="block">
        mpd url
        <p>
          <a href={mpdUrl} target="_blank" rel="noreferrer">
            {mpdUrl}
          </a>
        </p>
      </div>

      {/* DRM 信息（存在时显示） */}
      {drm.length > 0 && (
        <div className="block">
          <b>{i18n.DRMerror}</b>
          <br />
          <br />
          {drm.map((item, idx) => (
            <div key={idx} style={{ marginBottom: 4 }}>
              <b>{item.encryptionType}</b>
              <input
                value={item.pssh}
                readOnly
                spellCheck={false}
                className="width100"
                style={{ width: "100%" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* 轨道数量与时长信息 */}
      <div className="videoInfo flex">
        <div>{countText}</div>
        <div>{previewLabel}</div>
      </div>

      {/* 分片 URL 预览 */}
      <div className="block" id="textarea">
        <textarea
          value={segmentText}
          readOnly
          spellCheck={false}
          data-type="link"
          className="width100"
          style={{ width: "100%", minHeight: 120 }}
        />
      </div>

      {/* 初始化分片 URL */}
      {initUri && (
        <div className="block" id="tips">
          initialization:{" "}
          <input
            type="text"
            value={initUri}
            readOnly
            spellCheck={false}
            className="width100"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {/* 视频轨道选择与操作 */}
      {videoTracks.length > 0 && (
        <>
          <div className="flex">
            <div>
              <p data-i18n-outer="selectVideo">{i18n.selectVideo}</p>:{" "}
              <select
                className="select"
                value={`${previewType}|${previewId}`}
                onChange={e => {
                  const [type, id] = e.target.value.split("|");
                  selectPreview(type as any, id);
                }}
              >
                {videoTracks.map(t => (
                  <option key={t.id} value={`video|${t.id}`}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={convertToM3U8} data-i18n="convertToM3U8">
              {i18n.convertToM3U8}
            </button>
          </div>
          <div className="line"></div>
        </>
      )}

      {/* 音频轨道选择与操作 */}
      {audioTracks.length > 0 && (
        <div className="flex">
          <div>
            <p data-i18n-outer="selectAudio">{i18n.selectAudio}</p>:{" "}
            <select
              className="select"
              value={previewType === "audio" ? `audio|${previewId}` : ""}
              onChange={e => {
                const [type, id] = e.target.value.split("|");
                selectPreview(type as any, id);
              }}
            >
              {audioTracks.map(t => (
                <option key={t.id} value={`audio|${t.id}`}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={convertToM3U8} data-i18n="convertToM3U8">
            {i18n.convertToM3U8}
          </button>
        </div>
      )}

      {/* 时长 */}
      <div className="block" style={{ marginTop: 8 }}>
        {i18n.duration || "duration"}: {formatDuration(duration)}
      </div>
    </div>
  );
}
