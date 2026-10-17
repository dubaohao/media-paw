// @ts-nocheck
/**
 * MPD 主容器：解析 URL 参数（url/requestId/title），等待 G 就绪后触发解析，
 * 无 url 参数时显示自定义 URL 输入；解析中显示 loading；完成后显示信息面板与下载列表。
 */
import React, { useEffect, useState } from "react";
import { G, i18n } from "~lib/init";
import { awaitG, setRequestHeaders, JSONparse } from "~lib/function";
import { useMpdStore } from "./store";
import { MpdInfoPanel } from "./MpdInfoPanel";
import { MpdDownloadList } from "./MpdDownloadList";

/** MPD 主应用组件 */
export function MpdApp() {
  const { parsing, showCustomInput, mpdUrl, parseUrl, error } = useMpdStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URL(location.href).searchParams;
    const url = params.get("url") || "";
    const requestHeaders = params.get("requestHeaders");
    const title = params.get("title") || "";
    const requestId = params.get("requestId") || "";

    // 修改当前标签下的所有 xhr 的 requestHeaders（对应原版 setRequestHeaders）
    const headers = JSONparse(requestHeaders);
    setRequestHeaders(headers, () => {
      awaitG(() => {
        setReady(true);
        parseUrl(url);
      });
    });
  }, [parseUrl]);

  /** 自定义 URL 输入：跳转到带参数的 mpd.html（对应原版 #parse 点击） */
  const handleParse = () => {
    const input = document.getElementById("mpdUrl") as HTMLInputElement;
    const refererInput = document.getElementById("referer") as HTMLInputElement;
    const url = (input?.value || "").trim();
    if (!url) { return; }
    let target = `tabs/mpd.html?url=${encodeURIComponent(url)}`;
    const referer = (refererInput?.value || "").trim();
    if (referer) {
      target += `&requestHeaders=${JSON.stringify({ referer })}`;
    }
    chrome.tabs.update({ url: target });
  };

  if (!ready || parsing) {
    return (
      <section id="loading">
        <div className="optionBox">{i18n.loading}</div>
      </section>
    );
  }

  if (showCustomInput) {
    return (
      <section id="mpdCustom">
        <h1 className="optionsTitle">{i18n.titledash}</h1>
        <div className="optionBox">
          <input
            type="text"
            id="mpdUrl"
            placeholder="mpd URL"
            className="fullInput"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <input
            type="text"
            id="referer"
            placeholder="Referer"
            className="fullInput"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <button type="button" onClick={handleParse} data-i18n="parser">
            {i18n.parser}
          </button>
          {error && (
            <div style={{ color: "#e74c3c", marginTop: 8 }}>{error}</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="main">
      <h1 className="optionsTitle">{i18n.titledash}</h1>
      <MpdInfoPanel />
      <div className="line"></div>
      <MpdDownloadList />
    </section>
  );
}
