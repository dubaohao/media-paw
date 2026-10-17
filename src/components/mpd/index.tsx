// @ts-nocheck
/**
 * MPD 页面根组件：设置标题、注入运行时样式（移动端样式 + 用户自定义 CSS），
 * 包裹 MpdStoreProvider + MpdApp。静态样式（public/options）由 src/mpd.tsx 入口 import。
 */
import React, { useEffect } from "react";
import { i18n } from "~lib/init";
import { loadCSS } from "~lib/function";
import { MpdStoreProvider } from "./store";
import { MpdApp } from "./MpdApp";

/** MPD 页面根组件 */
export default function MpdRoot() {
  useEffect(() => {
    // 运行时样式：移动端 mobile.css（UA 条件）+ 用户自定义 G.css
    loadCSS();
    document.title = i18n.titledash || "titledash";
  }, []);

  return (
    <div className="wrapper1024 dash">
      <MpdStoreProvider>
        <MpdApp />
      </MpdStoreProvider>
    </div>
  );
}
