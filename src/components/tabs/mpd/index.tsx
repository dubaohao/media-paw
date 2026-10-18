// @ts-nocheck
/**
 * MPD 页面组件：解析 URL 参数（url/requestId/title），等待 G 就绪后触发解析，
 * 无 url 参数时显示自定义 URL 输入；解析中显示 loading；完成后显示信息面板与下载列表。
 * 运行时样式（mobile.css + 用户自定义 G.css）与标题在此注入；静态样式由 src/mpd.tsx 入口 import。
 */
import React, { useEffect, useState } from "react";
import { i18n } from "~lib/init";
import { awaitG, setRequestHeaders, JSONparse, loadCSS } from "~lib/function";
import { useMpdStore, MpdStoreProvider } from "./store";
import { MpdInfoPanel } from "./components/MpdInfoPanel";
import { MpdDownloadList } from "./components/MpdDownloadList";

/** MPD 页面根组件：注入运行时样式与标题，套 StoreProvider 后挂载主视图 */
export default function MpdPage() {
  useEffect(() => {
    // 运行时样式：移动端 mobile.css（UA 条件）+ 用户自定义 G.css
    loadCSS();
    document.title = i18n.titledash || "titledash";
  }, []);

  return (
    <div className="wrapper1024 dash">
      <MpdStoreProvider>
        <MpdMain />
      </MpdStoreProvider>
    </div>
  );
}

/** MPD 主视图（StoreProvider 内层）：URL 参数解析、loading / 自定义输入 / 信息面板三分支 */
function MpdMain() {
  const { parsing, showCustomInput, parseUrl, error } = useMpdStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URL(location.href).searchParams;
    const url = params.get("url") || "";
    const requestHeaders = params.get("requestHeaders");
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
