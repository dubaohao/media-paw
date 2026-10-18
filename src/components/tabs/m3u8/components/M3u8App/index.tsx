// @ts-nocheck
/**
 * M3U8 下载页主容器（下载管理器式布局：列表 + 卡片原地展开）
 * 迁移自 m3u8.html 的整体结构与 js/m3u8.js 的 init 流程
 *
 * 页面结构：
 * - 无任务 → 自定义 URL 输入表单
 * - 任务列表视图（唯一视图）：
 *   - 顶部：状态筛选 chips + 「全部停止」（有进行中任务时显示）
 *   - 每任务一张卡片：状态徽章 / 文件名 / 进度条 / 分片数 / 关闭
 *   - 点击卡片原地展开详情（信息卡 / 密钥 / 进度网格 / 操作按钮），再点收起
 */
import React, { useState, useRef, useEffect } from "react";
import { i18n, G } from "~lib/init";
import { useM3u8Store } from "~components/tabs/m3u8/store";
import { byteToSize } from "~lib/function";
import { M3u8CustomForm } from "./components/M3u8CustomForm";
import { AesDecryptorPanel } from "./components/AesDecryptorPanel";
import { M3u8DownloadList } from "./components/M3u8DownloadList";
import { M3u8Tools } from "./components/M3u8Tools";
import { InlinePreview } from "~components/shared/InlinePreview";

/** 任务状态筛选键 */
type TaskFilter = "all" | "downloading" | "complete" | "error";

/**
 * 任务的展示状态（徽章文案 + 样式类）
 * downloading/merging 共用蓝色脉冲样式；idle/parsing/parsed 归为等待/加载
 */
function taskStateInfo(state: string, hasPlaylist: boolean) {
  switch (state) {
    case "downloading":
      return { cls: "downloading", text: i18n.downloadingShort };
    case "merging":
      return { cls: "downloading", text: i18n.merging };
    case "queued":
      return { cls: "", text: i18n.queued };
    case "paused":
      return { cls: "paused", text: i18n.paused };
    case "complete":
      return { cls: "complete", text: i18n.downloadComplete };
    case "error":
      return { cls: "error", text: i18n.downloadFailed };
    default:
      // idle（已停止）且已有解析结果 → 等待重新开始；否则为加载/解析中
      return hasPlaylist
        ? { cls: "", text: i18n.waitDownload }
        : { cls: "", text: i18n.loading };
  }
}

/** 任务在筛选维度上的归属：下载中含 downloading/merging/parsing/paused 等未完成任务 */
function matchFilter(state: string, filter: TaskFilter): boolean {
  switch (filter) {
    case "downloading":
      return state === "downloading" || state === "merging" ||
        state === "paused" || state === "queued" ||
        state === "parsing" || state === "parsed";
    case "complete":
      return state === "complete";
    case "error":
      return state === "error";
    default:
      return true;
  }
}

/**
 * 展开的任务详情区：读 activeTask 派生值渲染（详情组件仅感知 activeTask，
 * 因此仅当该卡片对应的任务处于展开态时挂载）
 */
function TaskDetail() {
  const { downloadState, playlist, tips } = useM3u8Store();

  // 解析中
  if (downloadState === "parsing" || (downloadState === "parsed" && !playlist)) {
    return (
      <div className="taskDetail">
        <div className="optionBox taskDetailLoading">{i18n.loading}</div>
      </div>
    );
  }
  // 解析失败
  if (downloadState === "error") {
    return (
      <div className="taskDetail">
        <div className="optionBox">
          {i18n.m3u8Error}
          {tips && <div className="error">{tips}</div>}
        </div>
      </div>
    );
  }
  // 已解析：信息卡 + 密钥详情 + 进度区 + 操作按钮
  return (
    <div className="taskDetail">
      <div className="optionBox">
        {/* 信息卡：下载地址 + 密钥状态（未加密也展示） */}
        <div className="infoCard">
          <div className="infoRow">
            <span className="infoLabel">{i18n.m3u8Url}</span>
            <div className="infoValue">
              <a id="m3u8_url" href={playlist?.url}>
                {playlist?.url}
              </a>
              {playlist?.live && <b>（{i18n.liveHLS}）</b>}
            </div>
          </div>
          <div className="infoRow">
            <span className="infoLabel">{i18n.secretKey}</span>
            <div className="infoValue">
              {playlist?.isEncrypted ? i18n.encryptedHLS : i18n.notEncrypted}
            </div>
          </div>
        </div>

        {/* 密钥详情（AES 加密时展示：算法/Hex/Base64/IV + 自定义 key/IV） */}
        {playlist?.isEncrypted && <AesDecryptorPanel />}

        {/* 提示信息（密钥下载失败等） */}
        {tips && (
          <div className="block" id="tips">
            {tips}
          </div>
        )}

        {/* 进度区：四项指标（数量/大小/时长/百分比）+ 分片网格 + 查看所有切片 */}
        <M3u8DownloadList />

        {/* 操作按钮：合并下载 / 停止下载 / 发送到 FFmpeg 等（停止单个入口） */}
        <M3u8Tools />
      </div>
    </div>
  );
}

/** 任务卡片：状态徽章 + 文件名 + 进度条 + 分片数；点击原地展开/收起详情 */
function TaskCard({ task, expanded }: { task: any; expanded: boolean }) {
  const { setActiveTaskId, closeTask, togglePauseTask } = useM3u8Store();
  // 预览不自动播放：展开后视频停在首帧，由用户点播放器控件手动播（折叠时 InlinePreview 内部会暂停）
  const name =
    task.options.customFilename ||
    task.fileName ||
    task.title ||
    task.url;
  const info = taskStateInfo(task.state, !!task.playlist);
  const active = task.state === "downloading" || task.state === "merging";
  /** 可暂停/继续的状态 */
  const pausable = task.state === "downloading" || task.state === "paused";
  return (
    <div
      className={`taskCard ${task.state} ${expanded ? "expanded" : ""}`}
      onClick={() => setActiveTaskId(expanded ? null : task.id)}
    >
      <div className="taskCardHead">
        {/* 状态徽章：点色 + 文案 */}
        <span className={`taskBadge ${info.cls}`}>
          <span className={`taskDot ${info.cls}`} />
          {info.text}
        </span>
        {/* 头部操作区：暂停/继续（× 左侧，收起态直接可用） */}
        <div className="taskCardOps">
          {pausable && (
            <button
              className={`taskMiniBtn ${task.state === "paused" ? "resume" : ""}`}
              title={task.state === "paused" ? i18n.resumeDownload : i18n.pauseDownload}
              onClick={e => {
                e.stopPropagation();
                togglePauseTask(task.id);
              }}
            >
              {task.state === "paused" ? "▶" : "⏸"}
            </button>
          )}
          {/* 关闭任务 */}
          <button
            className="taskChipClose"
            title={i18n.close}
            onClick={e => {
              e.stopPropagation();
              closeTask(task.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
      {/* 文件名 */}
      <div className="taskCardName" title={name}>
        {name || task.id}
      </div>
      {/* 进度条：按状态着色（下载中蓝 / 完成绿 / 失败红） */}
      <div className="taskCardBar">
        <div
          className="taskCardBarFill"
          style={{ width: `${task.progress.percent}%` }}
        />
      </div>
      {/* 汇总行：百分比 + 分片数 + 已下载大小 + 失败信息 */}
      <div className="taskCardMeta">
        <span className="taskCardPct">{task.progress.percent}%</span>
        {task.progress.total > 0 && (
          <span>
            {task.progress.success}/{task.progress.total} {i18n.slices}
          </span>
        )}
        {task.progress.buffersize > 0 && (
          <span>{byteToSize(task.progress.buffersize)}</span>
        )}
        {task.state === "error" && task.tips && (
          <span className="taskCardErr" title={task.tips}>
            {task.tips}
          </span>
        )}
      </div>
      {active && <span className="taskCardPulse" />}
      {/* 原地展开的详情区（阻断点击冒泡：内部交互不触发卡片收起） */}
      {expanded && (
        <div className="taskCardDetail" onClick={e => e.stopPropagation()}>
          {/* 原始 m3u8 在线预览（复用侧边栏 InlinePreview，hls.js 播放，默认暂停） */}
          <InlinePreview
            data={{
              url: task.url,
              requestHeaders: task.requestHeaders,
              ext: "m3u8"
            } as any}
            active={expanded}
          />
          <TaskDetail />
        </div>
      )}
    </div>
  );
}

/** 任务列表视图：「+」手动添加 + 状态筛选 chips + 「全部停止」 + 任务卡片（新任务在上） */
function TaskListView() {
  const { tasks, activeTaskId, stopAllDownload, closeAllTasks, syncTasks } = useM3u8Store();
  const [filter, setFilter] = useState<TaskFilter>("all");
  /** 手动解析表单展开态（右上角「+」切换） */
  const [showForm, setShowForm] = useState(false);
  /** 同步中标记（防连点） */
  const [syncing, setSyncing] = useState(false);

  /** 手动同步：从 background 补齐未关联任务的嗅探记录 */
  const handleSync = async () => {
    if (syncing) { return; }
    setSyncing(true);
    try {
      await syncTasks();
    } finally {
      setSyncing(false);
    }
  };

  // 有新任务加入（手动解析提交/侧边栏追加）后自动收起表单
  React.useEffect(() => {
    if (tasks.length > 0) {
      setShowForm(false);
    }
  }, [tasks.length]);

  /** 存在进行中任务时显示「全部停止」 */
  const hasRunning = tasks.some(
    t => t.state === "downloading" || t.state === "merging"
  );

  /** 各状态任务数（筛选 chip 上的计数徽标） */
  const counts = tasks.reduce(
    (acc, t) => {
      if (matchFilter(t.state, "downloading")) { acc.downloading++; }
      else if (t.state === "complete") { acc.complete++; }
      else if (t.state === "error") { acc.error++; }
      return acc;
    },
    { downloading: 0, complete: 0, error: 0 }
  );
  const filtered = tasks.filter(t => matchFilter(t.state, filter));

  /** 筛选 chip 定义（全部=showAll） */
  const filters: { key: TaskFilter; label: string; count: number }[] = [
    { key: "all", label: i18n.showAll, count: tasks.length },
    { key: "downloading", label: i18n.downloadingShort, count: counts.downloading },
    { key: "complete", label: i18n.downloadComplete, count: counts.complete },
    { key: "error", label: i18n.downloadFailed, count: counts.error }
  ];

  return (
    <div className="taskListView">
      {/* 工具行：状态筛选 + 全部停止 + 手动添加 */}
      <div className="taskToolBar">
        <div className="taskFilterBar">
          {filters.map(f => (
            <button
              key={f.key}
              className={`taskFilterChip ${filter === f.key ? "active" : ""} ${f.key}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.count > 0 && <i className="taskFilterCount">{f.count}</i>}
            </button>
          ))}
        </div>
        <div className="taskToolBtns">
          {/* 手动同步：与嗅探数据不一致时点击，从 background 补齐缺失任务 */}
          <button
            className="button syncBtn"
            title={i18n.syncData || "同步数据"}
            disabled={syncing}
            onClick={handleSync}
          >
            {syncing ? "…" : "⟳"} {i18n.syncData || "同步"}
          </button>
          {hasRunning && (
            <button className="button stopAllBtn" onClick={stopAllDownload}>
              {i18n.stopAll}
            </button>
          )}
          {/* 清空：停止并关闭全部任务（有任务时显示） */}
          {tasks.length > 0 && (
            <button className="button stopAllBtn" onClick={closeAllTasks}>
              {i18n.clearAll}
            </button>
          )}
          {/* 手动添加：展开/收起自定义 URL 解析表单 */}
          <button
            className={`button addTaskBtn ${showForm ? "active" : ""}`}
            title={i18n.addTask}
            onClick={() => setShowForm(v => !v)}
          >
            {showForm ? "×" : "+"}
          </button>
        </div>
      </div>
      {/* 手动解析弹窗（兜底：粘贴 m3u8 地址/文本解析下载）；点遮罩关闭 */}
      {showForm && (
        <div className="taskAddMask" onClick={() => setShowForm(false)}>
          <div className="taskAddModal" onClick={e => e.stopPropagation()}>
            <div className="taskAddModalHead">
              <span>{i18n.addTask}</span>
              <button
                className="taskChipClose"
                title={i18n.close}
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>
            <div className="taskAddModalBody">
              <M3u8CustomForm />
            </div>
          </div>
        </div>
      )}
      {/* 任务卡片列表：倒序（新任务在上）；activeTaskId 对应的卡片原地展开 */}
      <div className="taskList">
        {filtered.length === 0 ? (
          <div className="taskListEmpty">
            {showForm ? "" : i18n.noData}
          </div>
        ) : (
          [...filtered].reverse().map(task => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={task.id === activeTaskId}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** M3U8 应用主容器组件 */
export function M3u8App() {
  const { ready, tasks } = useM3u8Store();

  /** 注入移动端样式表（public/options 已由 src/m3u8.tsx 入口静态 import） */
  React.useEffect(() => {
    if (!G.isMobile) { return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = chrome.runtime.getURL("assets/css/mobile.css");
    document.head.appendChild(link);
  }, []);

  // G 未就绪时显示 loading
  if (!ready) {
    return (
      <section id="loading">
        <div className="optionBox" data-i18n="loading">
          {i18n.loading}
        </div>
      </section>
    );
  }

  // 任务列表视图（唯一视图；无任务时显示空态，右上角「+」展开手动解析表单）
  return (
    <div className="m3u8_wrapper wrapper1080">
      <section id="m3u8List">
        <h1 className="optionsTitle">{i18n.titleM3U8}</h1>
        <TaskListView />
      </section>
    </div>
  );
}
