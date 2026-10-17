// @ts-nocheck
import { G, cacheData, cacheDataReady, i18n, reFilename } from "~lib/init";
import { clearRedundant, stringModify, isEmpty, filterFileName, templates, send2local, isLockUrl, isDamnUrl, openParser } from "~lib/function";

// 下载储存防抖状态（原为 init 全局，现为本模块局部状态）
let debounce = undefined;
let debounceCount = 0;
let debounceTime = 0;

// 按 tabId 缓存 content-script 提取的自定义页面标题（用于下载文件名 ${title}）
const pageTitles = new Map();
// 规则标题重报请求的冷却时间（按 tabId）：pageTitles 缺失时主动请求 content-script 重报，
// 3 秒冷却避免无规则站点/消息失败场景下每次嗅探都发消息
const titleRequestTime = new Map();

// 自动下载等待标题就绪的挂起队列：tabId → [{ info, timer }]
// 规则标题到达（setPageTitle）或 10 秒超时（先到先触发）后才真正发起下载，
// 避免下载文件名在标题提取完成前就定格成 URL/NULL。info 与 cacheData 同引用，标题回填自动生效。
const autoDownPending = new Map();
const AUTO_DOWN_TITLE_WAIT = 10000;

/**
 * 为自动下载生成文件名：background 侧的 info 没有侧边栏 normalize 计算的 downFileName，
 * 需要现算（TitleName 开启用模板，否则 标题.扩展名；标题未就绪时回退 URL 提取名）。
 * @param {Object} info 嗅探入库的资源对象
 * @returns {String} 下载文件名
 */
function buildAutoDownFileName(info) {
    if (G.TitleName) {
        return filterFileName(templates(G.downFileName, info));
    }
    const rawTitle = info.title && info.title != "NULL" ? stringModify(info.title) : "";
    const base = rawTitle || stringModify(info.name || "index");
    return base + (info.ext ? "." + info.ext : "");
}

/**
 * 立即触发某个 tab 挂起的自动下载（清定时器并逐个走解析器链路）
 * @param {Number} tabId 标签页 ID
 */
function flushTabAutoDown(tabId) {
    const list = autoDownPending.get(tabId);
    if (!list) { return; }
    autoDownPending.delete(tabId);
    for (const item of list) {
        clearTimeout(item.timer);
        try {
            // 触发时按最新标题重算文件名（挂起时标题可能尚未就绪）
            item.info.downFileName = buildAutoDownFileName(item.info);
            openParser(item.info, { autoDown: true });
        } catch (e) { console.log(e); }
    }
}

/**
 * 挂起一个解析类资源的自动下载，等待规则标题就绪（同一 tab 的资源共用一个超时定时器）
 * @param {Object} info 嗅探入库的资源对象（与 cacheData 同引用）
 */
function scheduleAutoDown(info) {
    let list = autoDownPending.get(info.tabId);
    if (!list) { list = []; autoDownPending.set(info.tabId, list); }
    if (list.some(item => item.info.requestId == info.requestId)) { return; }
    const timer = setTimeout(function () {
        flushTabAutoDown(info.tabId);
    }, AUTO_DOWN_TITLE_WAIT);
    list.push({ info, timer });
}

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
/**
 * 标签页发生页面导航时的标题重置：
 * 1. 清掉旧页面规则标题缓存，防止新页面最早的嗅探请求抢到旧标题并被锁定；
 * 2. 冻结该 tab 已有资源（titleLocked=true）：不管它们是否已拿到规则标题，
 *    名称从此定格，新页面的标题上报不会再改动旧资源；
 * 3. 广播给 sidepanel 同步冻结列表中的旧资源。
 * @param {Number} tabId 发生导航的标签页 ID
 */
function resetTabTitleOnNav(tabId) {
    if (tabId <= 0) { return; }
    pageTitles.delete(tabId);
    titleRequestTime.delete(tabId);
    const list = cacheData[tabId];
    if (list) {
        for (const item of list) { item.titleLocked = true; }
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
    }
    try {
        chrome.runtime.sendMessage({ Message: "pageNavReset", tabId: tabId });
    } catch (e) { /* sidepanel 未开则忽略 */ }
}

// 主框架开始导航（最早的导航事件）：冻结旧页面资源、作废旧规则标题
chrome.webNavigation.onBeforeNavigate.addListener(function (details) {
    if (details.frameId === 0) { resetTabTitleOnNav(details.tabId); }
});
// SPA 无刷新跳转（pushState/replaceState）：同样冻结旧资源（hash 路由由 content-script 补报）
chrome.webNavigation.onHistoryStateUpdated.addListener(function (details) {
    if (details.frameId === 0) { resetTabTitleOnNav(details.tabId); }
});
chrome.runtime.onConnect.addListener(function (Port) {
    if (chrome.runtime.lastError || Port.name !== "HeartBeat") return;
    Port.postMessage("HeartBeat");
    Port.onMessage.addListener(function (message, Port) { return; });
    const interval = setInterval(function () {
        clearInterval(interval);
        Port.disconnect();
    }, 250000);
    Port.onDisconnect.addListener(function () {
        interval && clearInterval(interval);
        if (chrome.runtime.lastError) { return; }
    });
});

/**
 *  定时任务
 *  nowClear clear 清理冗余数据
 *  save 保存数据
 */
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "nowClear" || alarm.name === "clear") {
        clearRedundant();
        return;
    }
    if (alarm.name === "save") {
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }
});

// onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
// chrome.webRequest.onBeforeRequest.addListener(
//     function (data) {
//         try { findMedia(data, true); } catch (e) { console.log(e); }
//     }, { urls: ["<all_urls>"] }, ["requestBody"]
// );
// 保存requestHeaders
chrome.webRequest.onSendHeaders.addListener(
    function (data) {
        if (G && G.initSyncComplete && !G.enable) { return; }
        if (data.requestHeaders) {
            G.requestHeaders.set(data.requestId, data.requestHeaders);
            data.allRequestHeaders = data.requestHeaders;
        }
        // 标记抓取渠道：请求发送阶段（URL后缀 / 用户自定义正则）
        data.catchSource = "webRequest请求阶段(URL/正则)";
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ['requestHeaders',
        chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);
// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try {
            data.allRequestHeaders = G.requestHeaders.get(data.requestId);
            if (data.allRequestHeaders) {
                G.requestHeaders.delete(data.requestId);
            }
            // 标记抓取渠道：响应开始阶段（Content-Type / Content-Disposition 等响应头判断）
            data.catchSource = "webRequest响应头(MIME/附件)";
            findMedia(data);
        } catch (e) { console.log(e, data); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// 删除失败的requestHeadersData
chrome.webRequest.onErrorOccurred.addListener(
    function (data) {
        G.requestHeaders.delete(data.requestId);
        G.blackList.delete(data.requestId);
    }, { urls: ["<all_urls>"] }
);

function findMedia(data, isRegex = false, filter = false, timer = false) {
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (!G || !G.initSyncComplete || !G.initLocalComplete || G.tabId == undefined || cacheData.init) {
        if (timer) { return; }
        setTimeout(() => {
            findMedia(data, isRegex, filter, true);
        }, 500);
        return;
    }

    if (G.damn && G.damnUrlSet.has(data.tabId)) {
        return;
    }

    // 检查 是否启用 是否在当前标签是否在屏蔽列表中
    const blockUrlFlag = data.tabId && data.tabId > 0 && G.blockUrlSet.has(data.tabId);
    if (!G.enable || (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag)) {
        return;
    }

    data.getTime = Date.now();

    if (!isRegex && G.blackList.has(data.requestId)) {
        G.blackList.delete(data.requestId);
        return;
    }
    // 屏蔽特殊页面发起的资源
    if (data.initiator != "null" &&
        data.initiator != undefined &&
        isSpecialPage(data.initiator)) { return; }
    if (G.isFirefox &&
        data.originUrl &&
        isSpecialPage(data.originUrl)) { return; }
    // 屏蔽特殊页面的资源
    if (isSpecialPage(data.url)) { return; }
    const urlParsing = new URL(data.url);
    let [name, ext] = fileNameParse(urlParsing.pathname);

    //正则匹配
    if (isRegex && !filter) {
        for (let key in G.Regex) {
            if (!G.Regex[key].state) { continue; }
            G.Regex[key].regex.lastIndex = 0;
            let result = G.Regex[key].regex.exec(data.url);
            if (result == null) { continue; }
            if (G.Regex[key].blackList) {
                G.blackList.add(data.requestId);
                return;
            }
            data.extraExt = G.Regex[key].ext ? G.Regex[key].ext : undefined;
            // 正则命中，更新抓取渠道为具体的正则规则名
            data.catchSource = `自定义正则规则: ${G.Regex[key].name ?? key}`;
            if (result.length == 1) {
                findMedia(data, true, true);
                return;
            }
            result.shift();
            result = result.map(str => decodeURIComponent(str));
            if (!result[0].startsWith('https://') && !result[0].startsWith('http://')) {
                result[0] = urlParsing.protocol + "//" + data.url;
            }
            data.url = result.join("");
            findMedia(data, true, true);
            return;
        }
        return;
    }

    // 非正则匹配
    if (!isRegex) {
        // 获取头部信息
        data.header = getResponseHeadersValue(data);
        //检查后缀
        if (!filter && ext != undefined) {
            filter = CheckExtension(ext, data.header?.size);
            if (filter == "break") { return; }
            if (filter) { data.catchReason = `URL后缀 .${ext}`; }
        }
        //检查类型
        if (!filter && data.header?.type != undefined) {
            filter = CheckType(data.header.type, data.header?.size);
            if (filter == "break") { return; }
            if (filter) { data.catchReason = `Content-Type: ${data.header.type}`; }
        }
        //查找附件
        if (!filter && data.header?.attachment != undefined) {
            const res = data.header.attachment.match(reFilename);
            if (res && res[1]) {
                [name, ext] = fileNameParse(decodeURIComponent(res[1]));
                filter = CheckExtension(ext, 0);
                if (filter == "break") { return; }
                if (filter) { data.catchReason = `Content-Disposition附件 .${ext}`; }
            }
        }
        //放过类型为media的资源
        if (data.type == "media") {
            filter = true;
            data.catchReason ??= "浏览器识别为media类型";
        }
    }
    // 直接带过滤标记入库的资源（正则提取 / 深度搜索上报），记录判定依据
    data.catchReason ??= (isRegex ? "正则/脚本直接上报" : "过滤规则命中");

    if (!filter) { return; }

    // 谜之原因 获取得资源 tabId可能为 -1 firefox中则正常
    // 检查是 -1 使用当前激活标签得tabID
    data.tabId = data.tabId == -1 ? G.tabId : data.tabId;

    cacheData[data.tabId] ??= [];
    cacheData[G.tabId] ??= [];

    // 缓存数据大于9999条 清空缓存 避免内存占用过多
    if (cacheData[data.tabId].length > G.maxLength) {
        cacheData[data.tabId] = [];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }

    // 查重 避免CPU占用 大于500 强制关闭查重
    // if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
    //     for (let item of cacheData[data.tabId]) {
    //         if (item.url.length == data.url.length &&
    //             item.cacheURL.pathname == urlParsing.pathname &&
    //             item.cacheURL.host == urlParsing.host &&
    //             item.cacheURL.search == urlParsing.search) { return; }
    //     }
    // }

    if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
        const tabFingerprints = G.urlMap.get(data.tabId) || new Set();
        if (tabFingerprints.has(data.url)) {
            return; // 找到重复，直接返回
        }
        tabFingerprints.add(data.url);
        G.urlMap.set(data.tabId, tabFingerprints);
        if (tabFingerprints.size >= 500) {
            tabFingerprints.clear();
        }
    }

    chrome.tabs.get(data.tabId, async function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        data.requestHeaders = getRequestHeaders(data);
        // requestHeaders 中cookie 单独列出来
        if (data.requestHeaders?.cookie) {
            data.cookie = data.requestHeaders.cookie;
            data.requestHeaders.cookie = undefined;
        }
        const info = {
            name: name,
            url: data.url,
            size: data.header?.size,
            ext: ext,
            type: data.mime ?? data.header?.type,
            tabId: data.tabId,
            isRegex: isRegex,
            requestId: data.requestId ?? Date.now().toString(),
            initiator: data.initiator,
            requestHeaders: data.requestHeaders,
            cookie: data.cookie,
            // cacheURL: { host: urlParsing.host, search: urlParsing.search, pathname: urlParsing.pathname },
            getTime: data.getTime,
            // 最后更新时间：初始等于创建时间，之后每次标题变更（规则回填/兜底/手动改名）刷新
            updateTime: data.getTime
        };
        // 不存在扩展使用类型
        if (info.ext === undefined && info.type !== undefined) {
            info.ext = info.type.split("/")[1];
        }
        // 正则匹配的备注扩展
        if (data.extraExt) {
            info.ext = data.extraExt;
        }
        // 不存在 initiator 和 referer 使用web url代替initiator
        if (info.initiator == undefined || info.initiator == "null") {
            info.initiator = info.requestHeaders?.referer ?? webInfo?.url;
        }
        // 装载页面信息（优先使用 content-script 按域名规则提取的自定义标题）
        // 规则标题一旦采用即锁定：之后页面导航/标题变化不再自动覆盖（用户手动改标题除外）；
        // 浏览器标签标题仅作兜底，不锁定，等待规则标题到达后补设一次
        const ruleTitle = pageTitles.get(data.tabId);
        // pageTitles 为纯内存缓存，SW 重启后丢失且 content-script 因去重不会主动重报；
        // 嗅探时发现该 tab 无规则标题缓存，主动请求 content-script 重报（3 秒冷却防轰炸）
        if (ruleTitle === undefined && data.tabId > 0 && G.titleRules?.length > 0) {
            const now = Date.now();
            if (now - (titleRequestTime.get(data.tabId) || 0) > 3000) {
                titleRequestTime.set(data.tabId, now);
                chrome.tabs.sendMessage(data.tabId, { Message: "requestPageTitle" }, function () { void chrome.runtime.lastError; });
            }
        }
        info.title = ruleTitle ?? webInfo?.title ?? "NULL";
        info.titleLocked = !!ruleTitle;
        info.favIconUrl = webInfo?.favIconUrl;
        info.webUrl = webInfo?.url;
        // 屏蔽资源
        if (!isRegex && G.blackList.has(data.requestId)) {
            G.blackList.delete(data.requestId);
            return;
        }
        // 打印抓取渠道与判定依据（Service Worker 控制台，可按 [猫爪] 过滤）
        console.log(
            `%c[猫爪] 嗅探到资源 [${data.catchSource ?? "未知渠道"}] 依据: ${data.catchReason ?? "-"}`,
            "color:#fff;background:#e8743c;padding:2px 6px;border-radius:3px;",
            { 文件名: info.name, 类型: info.ext, 大小: info.size, 页面: info.webUrl, 地址: info.url }
        );
        // 发送到popup 并检查自动下载
        chrome.runtime.sendMessage({ Message: "sidepanelAddData", data: info }, function () {
            if (G.autoDownload && chrome.downloads?.State) {
                try {
                    // m3u8/mpd 清单类资源：chrome.downloads 只能下到索引/清单文本，
                    // 必须走解析器链路（追加到下载页任务并自动开始下载），与手动点击行为一致。
                    // background 侧 info 没有 parsing 字段（那是侧边栏展示时计算的），用 ext/mime 判断。
                    // 规则标题已就绪（pageTitles 有缓存）直接下载；否则挂起等待标题到达或 10 秒超时
                    const downType = (info.ext || "").toLowerCase();
                    if (downType == "m3u8" || downType == "m3u" || downType == "mpd" ||
                        /mpegurl|dash\+xml/i.test(info.type || "")) {
                        if (pageTitles.has(info.tabId) || info.tabId <= 0) {
                            // background 的 info 没有侧边栏计算的 downFileName 字段，现算后传给下载页
                            info.downFileName = buildAutoDownFileName(info);
                            openParser(info, { autoDown: true });
                        } else {
                            scheduleAutoDown(info);
                        }
                    } else {
                        const downDir = info.title == "NULL" ? "CatCatch/" : stringModify(info.title) + "/";
                        let fileName = isEmpty(info.name) ? stringModify(info.title) + '.' + info.ext : decodeURIComponent(stringModify(info.name));
                        if (G.TitleName) {
                            fileName = filterFileName(templates(G.downFileName, info));
                        } else {
                            fileName = downDir + fileName;
                        }
                        chrome.downloads.download({
                            url: info.url,
                            filename: fileName
                        });
                    }
                } catch (e) { return; }
            }
            if (chrome.runtime.lastError) { return; }
        });

        // 数据发送
        if (G.send2local) {
            try { send2local("catch", { ...info, requestHeaders: data.allRequestHeaders }, info.tabId); } catch (e) { console.log(e); }
        }

        // 储存数据
        cacheData[info.tabId] ??= [];
        cacheData[info.tabId].push(info);

        // 当前标签媒体数量大于100 开启防抖 等待5秒储存 或 积累10个资源储存一次。
        if (cacheData[info.tabId].length >= 100 && debounceCount <= 10) {
            debounceCount++;
            clearTimeout(debounce);
            debounce = setTimeout(function () { save(info.tabId); }, 5000);
            return;
        }
        // 时间间隔小于500毫秒 等待2秒储存
        if (Date.now() - debounceTime <= 500) {
            clearTimeout(debounce);
            debounceTime = Date.now();
            debounce = setTimeout(function () { save(info.tabId); }, 2000);
            return;
        }
        save(info.tabId);
    });
}
// cacheData数据 储存到 chrome.storage.local
function save(tabId) {
    clearTimeout(debounce);
    debounceTime = Date.now();
    debounceCount = 0;
    if (cacheData[tabId]) {
        // 单个标签数据超过99条 不再保存到storage
        if (cacheData[tabId]?.length <= 99) {
            console.log(`[猫爪] save 写 storage tab=${tabId} 条数=${cacheData[tabId].length}`);
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }, function () {
                chrome.runtime.lastError && console.log(chrome.runtime.lastError);
            });
        } else {
            console.log(`[猫爪] save 跳过（超99条不持久化） tab=${tabId} 条数=${cacheData[tabId].length}`);
        }
        SetIcon({ number: cacheData[tabId].length, tabId: tabId });
    }
}

/**
 * 监听 扩展 message 事件
 */
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (chrome.runtime.lastError) { return; }
    // content-script 上报按域名规则提取的自定义页面标题，按 tabId 缓存
    if (Message.Message == "setPageTitle" && sender.tab?.id != null) {
        const titleTabId = sender.tab.id;
        pageTitles.set(titleTabId, Message.title);
        titleRequestTime.delete(titleTabId);
        console.log(`[猫爪] setPageTitle tab=${titleTabId} 标题="${Message.title}"${Message.force ? "（force：重存规则）" : ""}`);
        // 时序兜底：规则标题只补设给尚未锁定的资源（资源可能在标题上报前就被嗅探到）。
        // 已锁定资源（此前已应用过规则标题/用户手动命名）不再被自动更新，避免同 tab 导航后旧视频被改名。
        // force（用户重新保存名称规则）时仅刷新与上报页面同 URL 的资源，旧页面资源不株连。
        const list = cacheData[titleTabId] || [];
        let changed = false;
        for (let i = 0; i < list.length; i++) {
            if (Message.force) {
                // force（重存规则）只作用于规则所在页面的资源
                if (!samePageUrl(list[i].webUrl, Message.url)) { continue; }
            } else if (list[i].titleLocked) {
                // 常规上报：已锁定资源（已应用规则标题或用户手动命名）跳过
                continue;
            }
            list[i].title = Message.title;
            list[i].titleLocked = true;
            list[i].updateTime = Date.now();
            changed = true;
        }
        // 持久化锁定结果，防止 SW 重启后从旧快照恢复导致锁定丢失
        if (changed) { save(titleTabId); }
        // 通知 sidepanel 刷新显示（如果开着）
        try {
            chrome.runtime.sendMessage({
                Message: "pageTitleUpdated",
                tabId: titleTabId,
                title: Message.title,
                force: !!Message.force,
                url: Message.url
            });
        } catch (e) { /* sidepanel 未开则忽略 */ }
        // 规则标题已就绪：触发该 tab 挂起的自动下载（info 与 cacheData 同引用，文件名已拿到最新标题）
        if (G.autoDownload) { flushTabAutoDown(titleTabId); }
        return true;
    }
    // content-script 检测到 SPA 路由切换（hash 路由等不触发 webNavigation 的场景）：冻结旧资源
    if (Message.Message == "pageNavReset" && sender.tab?.id != null) {
        resetTabTitleOnNav(sender.tab.id);
        return true;
    }
    // 用户在页面上点选 DOM 作为某条资源的标题：更新缓存数据，下次 popup 打开即生效
    if (Message.Message == "titlePicked" && Message.requestId && Message.title) {
        for (let tabId in cacheData) {
            const list = cacheData[tabId] || [];
            for (let i = 0; i < list.length; i++) {
                if (list[i].requestId === Message.requestId) {
                    list[i].title = Message.title;
                    list[i]._title = Message.title;
                    // 用户手动命名：允许覆盖锁定值，同时锁定，后续自动标题更新不再改动
                    list[i].titleLocked = true;
                    list[i].updateTime = Date.now();
                    save(tabId);
                    sendResponse("ok");
                    return true;
                }
            }
        }
        sendResponse("not found");
        return true;
    }
    if (!G.initLocalComplete || !G.initSyncComplete) {
        sendResponse("error");
        return true;
    }
    // 以下检查是否有 tabId 不存在使用当前标签
    Message.tabId = Message.tabId ?? G.tabId;

    // 从缓存中保存数据到本地
    if (Message.Message == "pushData") {
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        sendResponse("ok");
        return true;
    }
    // 获取所有数据
    if (Message.Message == "getAllData") {
        // 等待 SW 重启后的 cacheData 恢复完成，避免侧边栏拿到空壳快照
        cacheDataReady.then(function () { sendResponse(cacheData); });
        return true;
    }
    /**
     * 设置扩展图标数字
     * 提供 type 删除标签为 tabId 的数字
     * 不提供type 删除所有标签的数字
     */
    if (Message.Message == "ClearIcon") {
        Message.type ? SetIcon({ tabId: Message.tabId }) : SetIcon();
        sendResponse("ok");
        return true;
    }
    // 启用/禁用扩展
    if (Message.Message == "enable") {
        G.enable = !G.enable;
        chrome.storage.sync.set({ enable: G.enable });
        // dev 模式工具栏图标加 DEV 标识，与生产版区分
        chrome.action.setIcon({ path: process.env.NODE_ENV === "development"
            ? (G.enable ? "/assets/img/icon-dev.png" : "/assets/img/icon-disable-dev.png")
            : (G.enable ? "/assets/img/icon.png" : "/assets/img/icon-disable.png") });
        // SW 控制台打印嗅探总开关状态
        console.log(
            `%c[猫爪] 嗅探总开关已${G.enable ? "开启 ▶" : "暂停 ⏸"}`,
            G.enable
                ? "color:#fff;background:#27ae60;padding:2px 6px;border-radius:3px;"
                : "color:#fff;background:#7f8c8d;padding:2px 6px;border-radius:3px;"
        );
        sendResponse(G.enable);
        return true;
    }
    /**
     * 提供requestId数组 获取指定的数据
     */
    if (Message.Message == "getData" && Message.requestId) {
        // 判断Message.requestId是否数组
        if (!Array.isArray(Message.requestId)) {
            Message.requestId = [Message.requestId];
        }
        // 等待恢复完成再查，避免 SW 重启窗口期返回空
        cacheDataReady.then(function () {
            const response = [];
            if (Message.requestId.length) {
                for (let item in cacheData) {
                    for (let data of cacheData[item]) {
                        if (Message.requestId.includes(data.requestId)) {
                            response.push(data);
                        }
                    }
                }
            }
            sendResponse(response.length ? response : "error");
        });
        return true;
    }
    /**
     * 提供 tabId 获取该标签数据
     */
    if (Message.Message == "getData") {
        // 等待恢复完成再返回，避免 SW 重启窗口期返回空
        cacheDataReady.then(function () { sendResponse(cacheData[Message.tabId]); });
        return true;
    }
    /**
     * 获取各按钮状态
     * 模拟手机 自动下载 启用 以及各种脚本状态
     */
    if (Message.Message == "getButtonState") {
        let state = {
            MobileUserAgent: G.featMobileTabId.has(Message.tabId),
            AutoDown: !!G.autoDownload,
            enable: G.enable,
        }
        G.scriptList.forEach(function (item, key) {
            state[item.key] = item.tabId.has(Message.tabId);
        });
        sendResponse(state);
        return true;
    }
    // 对tabId的标签 进行模拟手机操作
    if (Message.Message == "mobileUserAgent") {
        mobileUserAgent(Message.tabId, !G.featMobileTabId.has(Message.tabId));
        chrome.tabs.reload(Message.tabId, { bypassCache: true });
        sendResponse("ok");
        return true;
    }
    // 全局自动下载开关（原为按 tabId 生效，现改为全局，所有 tab 统一生效）
    if (Message.Message == "autoDown") {
        G.autoDownload = !G.autoDownload;
        chrome.storage.sync.set({ autoDownload: G.autoDownload });
        sendResponse("ok");
        return true;
    }
    // 对tabId的标签 脚本注入或删除
    if (Message.Message == "script") {
        if (G.damn && G.damnUrlSet.has(Message.tabId)) {
            return;
        }
        if (!G.scriptList.has(Message.script)) {
            sendResponse("error no exists");
            return false;
        }
        const script = G.scriptList.get(Message.script);
        const scriptTabid = script.tabId;
        const refresh = Message.refresh ?? script.refresh;
        if (scriptTabid.has(Message.tabId)) {
            scriptTabid.delete(Message.tabId);
            // SW 控制台打印页面功能脚本关闭
            console.log(
                `%c[猫爪] 页面功能关闭 ⏸ ${script.name}（tabId: ${Message.tabId}）${refresh ? "，即将刷新页面" : ""}`,
                "color:#fff;background:#7f8c8d;padding:2px 6px;border-radius:3px;"
            );
            if (Message.script == "search.js") {
                G.deepSearchTemporarilyClose = Message.tabId;
            }
            refresh && chrome.tabs.reload(Message.tabId, { bypassCache: true });
            sendResponse("ok");
            return true;
        }
        scriptTabid.add(Message.tabId);
        // SW 控制台打印页面功能开启
        console.log(
            `%c[猫爪] 页面功能开启 ▶ ${script.name}（${Message.script}，world: ${script.world}，tabId: ${Message.tabId}）`,
            "color:#fff;background:#2980b9;padding:2px 6px;border-radius:3px;"
        );
        if (refresh) {
            chrome.tabs.reload(Message.tabId, { bypassCache: true });
        } else {
            const files = [`assets/catch-script/${Message.script}`];
            script.i18n && files.unshift("assets/catch-script/i18n.js");
            chrome.scripting.executeScript({
                target: { tabId: Message.tabId, allFrames: script.allFrames },
                files: files,
                injectImmediately: true,
                world: script.world
            });
        }
        sendResponse("ok");
        return true;
    }
    // 脚本注入 脚本申请多语言文件
    if (Message.Message == "scriptI18n") {
        chrome.scripting.executeScript({
            target: { tabId: Message.tabId, allFrames: true },
            files: ["assets/catch-script/i18n.js"],
            injectImmediately: true,
            world: "MAIN"
        });
        sendResponse("ok");
        return true;
    }
    // Heart Beat
    if (Message.Message == "HeartBeat") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].id) {
                G.tabId = tabs[0].id;
            }
        });
        sendResponse("HeartBeat OK");
        return true;
    }
    // 清理数据
    if (Message.Message == "clearData") {
        // 当前标签
        if (Message.type) {
            delete cacheData[Message.tabId];
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
            clearRedundant();
            // 广播给所有扩展页面（下载页等）同步清理关联任务
            try { chrome.runtime.sendMessage({ Message: "MediaDataCleared", type: true, tabId: Message.tabId }); } catch (e) { }
            sendResponse("OK");
            return true;
        }
        // 其他标签
        for (let item in cacheData) {
            if (item == Message.tabId) { continue; }
            delete cacheData[item];
        }
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        clearRedundant();
        try { chrome.runtime.sendMessage({ Message: "MediaDataCleared", type: false, tabId: Message.tabId }); } catch (e) { }
        sendResponse("OK");
        return true;
    }
    // 删除单条资源（按 requestId 从 cacheData[tabId] 数组中移除）
    if (Message.Message == "deleteMedia") {
        const list = cacheData[Message.tabId];
        if (list) {
            const index = list.findIndex(item => String(item.requestId) === String(Message.requestId));
            if (index !== -1) {
                list.splice(index, 1);
                (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
                // 更新扩展图标数字
                if (cacheData[Message.tabId] && cacheData[Message.tabId].length <= 99) {
                    SetIcon({ number: cacheData[Message.tabId].length, tabId: Message.tabId });
                }
                // 广播给所有扩展页面（侧边栏删本地行、下载页关关联任务）
                try { chrome.runtime.sendMessage({ Message: "MediaDataDeleted", tabId: Message.tabId, requestId: Message.requestId }); } catch (e) { }
            }
        }
        sendResponse("OK");
        return true;
    }
    // 清理冗余数据
    if (Message.Message == "clearRedundant") {
        clearRedundant();
        sendResponse("OK");
        return true;
    }
    // 从 content-script 或 catch-script 传来的媒体url
    if (Message.Message == "addMedia") {
        // 标记抓取渠道：页面内深度搜索（Hook XHR/fetch/Worker 发现）
        const catchSource = "深度搜索(页面内XHR/fetch/Worker)";
        chrome.tabs.query({}, function (tabs) {
            for (let item of tabs) {
                if (item.url == Message.href) {
                    findMedia({ url: Message.url, tabId: item.id, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, requestHeaders: Message.requestHeaders, catchSource }, true, true);
                    return true;
                }
            }
            findMedia({ url: Message.url, tabId: -1, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, initiator: Message.href, requestHeaders: Message.requestHeaders, catchSource }, true, true);
        });
        sendResponse("ok");
        return true;
    }
    // ffmpeg网页通信
    if (Message.Message == "catCatchFFmpeg") {
        const data = { ...Message, Message: "ffmpeg", tabId: Message.tabId ?? sender.tab.id, version: G.ffmpegConfig.version };
        chrome.tabs.query({ url: G.ffmpegConfig.url + "*" }, function (tabs) {
            if (chrome.runtime.lastError || !tabs.length) {
                chrome.tabs.create({ url: G.ffmpegConfig.url, active: Message.active ?? true }, function (tab) {
                    if (chrome.runtime.lastError) { return; }
                    G.ffmpegConfig.tab = tab.id;
                    G.ffmpegConfig.cacheData.push(data);
                });
                return true;
            }
            if (tabs[0].status == "complete") {
                chrome.tabs.sendMessage(tabs[0].id, data);
            } else {
                G.ffmpegConfig.tab = tabs[0].id;
                G.ffmpegConfig.cacheData.push(data);
            }
        });
        sendResponse("ok");
        return true;
    }
    // 发送数据到本地
    if (Message.Message == "send2local" && G.send2local) {
        try { send2local(Message.action, Message.data, Message.tabId); } catch (e) { console.log(e); }
        sendResponse("ok");
        return true;
    }
    if (Message.Message == "damnUrlHas") {
        sendResponse(G.damnUrlSet.has(Message.tabId));
        return true;
    }
});

// 选定标签 更新G.tabId
// chrome.tabs.onHighlighted.addListener(function (activeInfo) {
//     if (activeInfo.windowId == -1 || !activeInfo.tabIds || !activeInfo.tabIds.length) { return; }
//     G.tabId = activeInfo.tabIds[0];
// });

/**
 * 监听 切换标签
 * 更新全局变量 G.tabId 为当前标签
 */
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabId;
    if (cacheData[G.tabId] !== undefined) {
        SetIcon({ number: cacheData[G.tabId].length, tabId: G.tabId });
        return;
    }
    SetIcon({ tabId: G.tabId });
});

// 切换窗口，更新全局变量G.tabId
chrome.windows.onFocusChanged.addListener(function (activeInfo) {
    if (activeInfo == -1) { return; }
    chrome.tabs.query({ active: true, windowId: activeInfo }, function (tabs) {
        if (tabs[0] && tabs[0].id) {
            G.tabId = tabs[0].id;
        } else {
            G.tabId = -1;
        }
    });
}, { filters: ["normal"] });

/**
 * 监听 标签页面更新
 * 检查 清理数据
 * 检查 是否在屏蔽列表中
 */
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (isSpecialPage(tab.url) || tabId <= 0 || !G.initSyncComplete) { return; }
    // console.log('onUpdated', tabId, changeInfo, tab);
    if (changeInfo.status && changeInfo.status == "loading" && G.autoClearMode == 2) {
        G.urlMap.delete(tabId);
        chrome.alarms.get("save", function (alarm) {
            if (!alarm) {
                delete cacheData[tabId];
                SetIcon({ tabId: tabId });
                chrome.alarms.create("save", { when: Date.now() + 1000 });
            }
        });
    }
    // 检查当前标签是否在屏蔽列表中
    if (changeInfo.url && tabId > 0) {
        if (G.blockUrl.length) {
            G.blockUrlSet.delete(tabId);
            if (isLockUrl(changeInfo.url)) {
                G.blockUrlSet.add(tabId);
            }
        }

        G.damnUrlSet.delete(tabId);
        if (isDamnUrl(changeInfo.url)) {
            G.damnUrlSet.add(tabId);
        }
    }
    // 标签标题兜底回填：后台 tab 的媒体请求往往在页面标题就绪前就被嗅探入库（入库时 webInfo.title
    // 为空/站点名），此处在该 tab 标题变化时把未锁定资源的标题补为最新标签标题。
    // 不设 titleLocked——规则标题（setPageTitle）后到达仍可覆盖；导航时 resetTabTitleOnNav 会冻结旧资源
    if (changeInfo.title && tabId > 0) {
        const titleList = cacheData[tabId];
        if (titleList) {
            let titleChanged = false;
            for (let i = 0; i < titleList.length; i++) {
                if (titleList[i].titleLocked) { continue; }
                titleList[i].title = changeInfo.title;
                titleList[i].updateTime = Date.now();
                titleChanged = true;
            }
            if (titleChanged) {
                save(tabId);
                try {
                    chrome.runtime.sendMessage({ Message: "pageTitleUpdated", tabId: tabId, title: changeInfo.title, fallback: true });
                } catch (e) { /* sidepanel 未开则忽略 */ }
            }
        }
    }
    chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html?tabId=" + tabId
    });
});

/**
 * 监听 frame 正在载入
 * 检查 是否在屏蔽列表中 (frameId == 0 为主框架)
 * 检查 自动清理 (frameId == 0 为主框架)
 * 检查 注入脚本
 */
chrome.webNavigation.onCommitted.addListener(function (details) {
    if (isSpecialPage(details.url) || details.tabId <= 0 || !G.initSyncComplete) { return; }
    // console.log('onCommitted', details);

    // 刷新页面 检查是否在屏蔽列表中
    if (details.frameId == 0) {
        // 整页导航：作废旧页面的规则标题，防止新页面嗅探到的资源继承旧标题
        pageTitles.delete(details.tabId);
        titleRequestTime.delete(details.tabId);
        G.blockUrlSet.delete(details.tabId);
        if (isLockUrl(details.url)) {
            G.blockUrlSet.add(details.tabId);
        }

        G.damnUrlSet.delete(details.tabId);
        if (isDamnUrl(details.url)) {
            G.damnUrlSet.add(details.tabId);
        }
    }

    // 刷新清理角标数
    if (details.frameId == 0 && (!['auto_subframe', 'manual_subframe', 'form_submit'].includes(details.transitionType)) && G.autoClearMode == 1) {
        delete cacheData[details.tabId];
        G.urlMap.delete(details.tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        SetIcon({ tabId: details.tabId });
    }

    // chrome内核版本 102 以下不支持 chrome.scripting.executeScript API
    if (G.version < 102) { return; }

    if (G.deepSearch && G.deepSearchTemporarilyClose != details.tabId) {
        G.scriptList.get("search.js").tabId.add(details.tabId);
        G.deepSearchTemporarilyClose = null;
    }

    // catch-script 脚本
    const autoInjectScripts = [];   // 收集本次主框架自动注入的脚本名，用于汇总日志
    G.scriptList.forEach(function (item, script) {
        if (!item.tabId.has(details.tabId) || !item.allFrames) { return true; }
        if (details.frameId == 0) { autoInjectScripts.push(`${item.name}(${script})`); }

        const files = [`assets/catch-script/${script}`];
        item.i18n && files.unshift("assets/catch-script/i18n.js");
        chrome.scripting.executeScript({
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            files: files,
            injectImmediately: true,
            world: item.world
        });
    });
    // 主框架导航完成时汇总打印一次本次自动注入的页面脚本（子框架注入不重复打印）
    if (details.frameId == 0 && autoInjectScripts.length) {
        console.log(
            `%c[猫爪] 页面加载，自动注入脚本 → [${autoInjectScripts.join("、")}]（含同源子框架）`,
            "color:#fff;background:#2980b9;padding:2px 6px;border-radius:3px;",
            { tabId: details.tabId, url: details.url }
        );
    }

    // 模拟手机
    if (G.initLocalComplete && G.featMobileTabId.size > 0 && G.featMobileTabId.has(details.tabId)) {
        chrome.scripting.executeScript({
            args: [G.MobileUserAgent.toString()],
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            func: function () {
                Object.defineProperty(navigator, 'userAgent', { value: arguments[0], writable: false });
            },
            injectImmediately: true,
            world: "MAIN"
        });
    }
});

/**
 * 监听 标签关闭 清理数据
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    chrome.alarms.get("nowClear", function (alarm) {
        !alarm && chrome.alarms.create("nowClear", { when: Date.now() + 1000 });
    });
    if (G.initSyncComplete) {
        G.blockUrlSet.has(tabId) && G.blockUrlSet.delete(tabId);
        G.damnUrlSet.has(tabId) && G.damnUrlSet.delete(tabId);
    }
});

/**
 * 浏览器 扩展快捷键
 */
chrome.commands.onCommand.addListener(function (command) {
    if (command == "auto_down") {
        G.autoDownload = !G.autoDownload;
        chrome.storage.sync.set({ autoDownload: G.autoDownload });
    } else if (command == "catch") {
        const scriptTabid = G.scriptList.get("catch.js").tabId;
        scriptTabid.has(G.tabId) ? scriptTabid.delete(G.tabId) : scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    } else if (command == "m3u8") {
        chrome.tabs.create({ url: "tabs/m3u8.html" });
    } else if (command == "clear") {
        delete cacheData[G.tabId];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        clearRedundant();
        SetIcon({ tabId: G.tabId });
    } else if (command == "enable") {
        G.enable = !G.enable;
        chrome.storage.sync.set({ enable: G.enable });
        // dev 模式工具栏图标加 DEV 标识，与生产版区分
        chrome.action.setIcon({ path: process.env.NODE_ENV === "development"
            ? (G.enable ? "/assets/img/icon-dev.png" : "/assets/img/icon-disable-dev.png")
            : (G.enable ? "/assets/img/icon.png" : "/assets/img/icon-disable.png") });
        // SW 控制台打印快捷键切换的嗅探状态
        console.log(
            `%c[猫爪] 快捷键切换：嗅探已${G.enable ? "开启 ▶" : "暂停 ⏸"}`,
            G.enable
                ? "color:#fff;background:#27ae60;padding:2px 6px;border-radius:3px;"
                : "color:#fff;background:#7f8c8d;padding:2px 6px;border-radius:3px;"
        );
    } else if (command == "reboot") {
        chrome.runtime.reload();
    } else if (command == "deepSearch") {
        const script = G.scriptList.get("search.js");
        const scriptTabid = script.tabId;
        if (scriptTabid.has(G.tabId)) {
            scriptTabid.delete(G.tabId);
            G.deepSearchTemporarilyClose = G.tabId;
            chrome.tabs.reload(G.tabId, { bypassCache: true });
            return;
        }
        scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    }
});

/**
 * 监听 页面完全加载完成 判断是否在线ffmpeg页面
 * 如果是在线ffmpeg 则发送数据
 */
chrome.webNavigation.onCompleted.addListener(function (details) {
    if (G.ffmpegConfig.tab && details.tabId == G.ffmpegConfig.tab) {
        setTimeout(() => {
            G.ffmpegConfig.cacheData.forEach(data => {
                chrome.tabs.sendMessage(details.tabId, data);
            });
            G.ffmpegConfig.cacheData = [];
            G.ffmpegConfig.tab = 0;
        }, 500);
    }
});

// 操作符检查
function operatorCheck(size, Obj) {
    const targetSize = Obj.size * 1024;
    switch (Obj.operator) {
        case "=":
            return size == targetSize;
        case "<":
            return size < targetSize;
        case ">":
            return size > targetSize;
        case "<=":
            return size <= targetSize;
        case ">=":
            return size >= targetSize;
        case "!=":
            return size != targetSize;
        case "~":
            return (Obj.min ? size >= Obj.min * 1024 : true) && (Obj.max ? size <= Obj.max * 1024 : true);
        default:
            return size <= targetSize;
    }
}

/**
 * 检查扩展名和大小
 * @param {String} ext 
 * @param {Number} size 
 * @returns {Boolean|String}
 */
function CheckExtension(ext, size) {
    const Ext = G.Ext.get(ext);
    if (!Ext) { return false; }
    if (!Ext.state) { return "break"; }
    // if (Ext.size != 0 && size != undefined && size <= Ext.size * 1024) { return "break"; }
    if (Ext.size != 0 && size != undefined && !operatorCheck(size, Ext)) {
        return "break";
    }
    return true;
}

/**
 * 检查类型和大小
 * @param {String} dataType 
 * @param {Number} dataSize 
 * @returns {Boolean|String}
 */
function CheckType(dataType, dataSize) {
    const typeInfo = G.Type.get(dataType.split("/")[0] + "/*") || G.Type.get(dataType);
    if (!typeInfo) { return false; }
    if (!typeInfo.state) { return "break"; }
    if (typeInfo.size != 0 && dataSize != undefined && !operatorCheck(dataSize, typeInfo)) {
        return "break";
    }
    return true;
}

/**
 * 获取文件名及扩展名
 * @param {String} pathname 
 * @returns {Array}
 */
function fileNameParse(pathname) {
    let fileName = decodeURI(pathname.split("/").pop());
    let ext = fileName.split(".");
    ext = ext.length == 1 ? undefined : ext.pop().toLowerCase();
    return [fileName, ext ? ext : undefined];
}

/**
 * 获取响应头信息
 * @param {Object} data 
 * @returns {Object}
 */
function getResponseHeadersValue(data) {
    const header = {};
    if (data.responseHeaders == undefined || data.responseHeaders.length == 0) { return header; }
    for (let item of data.responseHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "content-length") {
            header.size ??= parseInt(item.value);
        } else if (item.name == "content-type") {
            header.type = item.value.split(";")[0].toLowerCase();
        } else if (item.name == "content-disposition") {
            header.attachment = item.value;
        } else if (item.name == "content-range") {
            let size = item.value.split('/')[1];
            if (size !== '*') {
                header.size = parseInt(size);
            }
        }
    }
    return header;
}

/**
 * 获取请求头
 * @param {Object} data 
 * @returns {Object|Boolean}
 */
function getRequestHeaders(data) {
    if (data.allRequestHeaders == undefined || data.allRequestHeaders.length == 0) { return false; }
    const header = {};
    for (let item of data.allRequestHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "referer") {
            header.referer = item.value;
        } else if (item.name == "origin") {
            header.origin = item.value;
        } else if (item.name == "cookie") {
            header.cookie = item.value;
        } else if (item.name == "authorization") {
            header.authorization = item.value;
        }
    }
    if (Object.keys(header).length) {
        return header;
    }
    return false;
}
//设置扩展图标
function SetIcon(obj) {
    if (obj?.number == 0 || obj?.number == undefined) {
        chrome.action.setBadgeText({ text: "", tabId: obj?.tabId ?? G.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "还没闻到味儿~", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    } else if (G.badgeNumber) {
        obj.number = obj.number > 999 ? "999+" : obj.number.toString();
        chrome.action.setBadgeText({ text: obj.number, tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "抓到 " + obj.number + " 条鱼", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    }
}

// 模拟手机端
function mobileUserAgent(tabId, change = false) {
    if (change) {
        G.featMobileTabId.add(tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabId],
            addRules: [{
                "id": tabId,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [{
                        "header": "User-Agent",
                        "operation": "set",
                        "value": G.MobileUserAgent
                    }]
                },
                "condition": {
                    "tabIds": [tabId],
                    "resourceTypes": Object.values(chrome.declarativeNetRequest.ResourceType)
                }
            }]
        });
        return true;
    }
    G.featMobileTabId.delete(tabId) && (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}

// 判断特殊页面
function isSpecialPage(url) {
    if (!url || url == "null") { return true; }
    return !(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:"));
}

/**
 * 判断两个页面 URL 是否属于同一个页面（同源 + 同路径，忽略 query/hash 差异）
 * 用于 force 刷新名称规则时，只更新规则所在页面的资源，不株连同 tab 的旧页面资源
 * @param {String} a 资源嗅探时记录的页面 URL（info.webUrl）
 * @param {String} b 标题上报时的页面 URL（content-script location.href）
 * @returns {Boolean}
 */
function samePageUrl(a, b) {
    if (!a || !b) { return false; }
    try {
        const ua = new URL(a);
        const ub = new URL(b);
        return ua.origin === ub.origin && ua.pathname === ub.pathname;
    } catch (e) { return a === b; }
}

// 测试
// chrome.storage.local.get(function (data) { console.log(data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log(rules); });
// chrome.tabs.query({}, function (tabs) { for (let item of tabs) { console.log(item.id); } });