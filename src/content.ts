// @ts-nocheck
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_start",
  all_frames: true
}

;(function () {
    var _videoObj = [];
    var _videoSrc = [];
    var _key = new Set();
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (chrome.runtime.lastError) { return; }
        // 获取页面视频对象
        if (Message.Message == "getVideoState") {
            let videoObj = [];
            let videoSrc = [];
            let videoFrom = [];   // 每个媒体元素所在位置（主页面 / 具体iframe），便于判断是否来自iframe
            // 主页面自身的媒体元素
            document.querySelectorAll("video, audio").forEach(function (video) {
                if (video.currentSrc != "" && video.currentSrc != undefined) {
                    videoObj.push(video);
                    videoSrc.push(video.currentSrc);
                    videoFrom.push({ 位置: "主页面", 标签: video.tagName.toLowerCase(), 地址: video.currentSrc });
                }
            });
            // 同源 iframe 内的媒体元素（跨域 iframe contentDocument 为 null，无法枚举）
            const iframe = document.querySelectorAll("iframe");
            let crossOriginIframeCount = 0;  // 跨域不可访问的 iframe 数量
            if (iframe.length > 0) {
                iframe.forEach(function (iframe) {
                    if (iframe.contentDocument == null) { crossOriginIframeCount++; return true; }
                    iframe.contentDocument.querySelectorAll("video, audio").forEach(function (video) {
                        if (video.currentSrc != "" && video.currentSrc != undefined) {
                            videoObj.push(video);
                            videoSrc.push(video.currentSrc);
                            videoFrom.push({ 位置: "同源iframe", iframe: iframe.src || "(无src)", 标签: video.tagName.toLowerCase(), 地址: video.currentSrc });
                        }
                    });
                });
            }
            if (videoObj.length > 0) {
                if (videoObj.length !== _videoObj.length || videoSrc.toString() !== _videoSrc.toString()) {
                    // 网页控制台打印 DOM 枚举渠道：仅在页面 video/audio 源发生变化时输出一次，避免轮询刷屏
                    // 明细中标注每个元素位于主页面还是同源 iframe，并统计跨域 iframe（其中内容本扩展无法直接枚举）
                    console.log(
                        "%c[猫爪] DOM枚举发现页面媒体元素 (<video>/<audio>)",
                        "color:#fff;background:#16a085;padding:2px 6px;border-radius:3px;",
                        {
                            媒体数量: videoObj.length,
                            页面iframe总数: iframe.length,
                            跨域iframe不可枚举: crossOriginIframeCount,
                            来源明细: videoFrom
                        }
                    );
                    _videoSrc = videoSrc;
                    _videoObj = videoObj;
                }
                Message.index = Message.index == -1 ? 0 : Message.index;
                const video = videoObj[Message.index];
                const timePCT = video.currentTime / video.duration * 100;
                sendResponse({
                    time: timePCT,
                    currentTime: video.currentTime,
                    duration: video.duration,
                    volume: video.volume,
                    count: _videoObj.length,
                    src: _videoSrc,
                    paused: video.paused,
                    loop: video.loop,
                    speed: video.playbackRate,
                    muted: video.muted,
                    type: video.tagName.toLowerCase()
                });
                return true;
            }
            sendResponse({ count: 0 });
            return true;
        }
        // 速度控制
        if (Message.Message == "speed") {
            _videoObj[Message.index].playbackRate = Message.speed;
            return true;
        }
        // 画中画
        if (Message.Message == "pip") {
            if (document.pictureInPictureElement) {
                try { document.exitPictureInPicture(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            try { _videoObj[Message.index].requestPictureInPicture(); } catch (e) { return true; }
            sendResponse({ state: true });
            return true;
        }
        // 全屏
        if (Message.Message == "fullScreen") {
            if (document.fullscreenElement) {
                try { document.exitFullscreen(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            setTimeout(function () {
                try { _videoObj[Message.index].requestFullscreen(); } catch (e) { return true; }
            }, 500);
            sendResponse({ state: true });
            return true;
        }
        // 播放
        if (Message.Message == "play") {
            _videoObj[Message.index].play();
            return true;
        }
        // 暂停
        if (Message.Message == "pause") {
            _videoObj[Message.index].pause();
            return true;
        }
        // 循环播放
        if (Message.Message == "loop") {
            _videoObj[Message.index].loop = Message.action;
            return true;
        }
        // 设置音量
        if (Message.Message == "setVolume") {
            _videoObj[Message.index].volume = Message.volume;
            sendResponse("ok");
            return true;
        }
        // 静音
        if (Message.Message == "muted") {
            _videoObj[Message.index].muted = Message.action;
            return true;
        }
        // 设置视频进度
        if (Message.Message == "setTime") {
            const time = Message.time * _videoObj[Message.index].duration / 100;
            _videoObj[Message.index].currentTime = time;
            sendResponse("ok");
            return true;
        }
        // 截图视频图片
        if (Message.Message == "screenshot") {
            try {
                let video = _videoObj[Message.index];
                let canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                let link = document.createElement("a");
                link.href = canvas.toDataURL("image/jpeg");
                link.download = `${location.hostname}-${secToTime(video.currentTime)}.jpg`;
                link.click();
                canvas = null;
                link = null;
                sendResponse("ok");
                return true;
            } catch (e) { console.log(e); return true; }
        }
        if (Message.Message == "getKey") {
            sendResponse(Array.from(_key));
            return true;
        }
        if (Message.Message == "ffmpeg") {
            if (!Message.files) {
                window.postMessage(Message);
                sendResponse("ok");
                return true;
            }
            Message.quantity ??= Message.files.length;
            for (let item of Message.files) {
                const data = { ...Message, ...item };
                data.type = item.type ?? "video";
                if (data.data instanceof Blob) {
                    window.postMessage(data);
                } else {
                    fetch(data.data)
                        .then(response => response.blob())
                        .then(blob => {
                            data.data = blob;
                            window.postMessage(data);
                        });
                }
            }
            sendResponse("ok");
            return true;
        }
        if (Message.Message == "getPage") {
            if (Message.find) {
                const DOM = document.querySelector(Message.find);
                DOM ? sendResponse(DOM.innerHTML) : sendResponse("");
                return true;
            }
            sendResponse(document.documentElement.outerHTML);
            return true;
        }
        // 进入「点击页面元素选取」模式
        // saveRule=true 时只保存域名规则不回传标题（设置名称规则）；否则只回传标题不存规则（选标题）
        if (Message.Message == "pickElement") {
            pickElementTitle(Message, sendResponse);
            return true; // 异步响应
        }
        // 取消选取模式（popup 二次点击定位按钮时触发）
        if (Message.Message == "pickElementCancel") {
            if (window.__catcatchPickCleanup) {
                window.__catcatchPickCleanup(true);
                window.__catcatchPickCleanup = null;
            }
            sendResponse("cancelled");
            return true;
        }
    });

    /**
     * 生成元素相对稳定的 CSS 选择器
     * 优先用 id；其次用稳定的 class（同级唯一）；否则用 tag:nth-of-type 向上拼路径
     * @param {Element} el 目标元素
     * @returns {String} CSS 选择器字符串
     */
    function getElementSelector(el) {
        if (!el || el.nodeType !== 1) { return ""; }
        // 有 id 直接用，最稳定
        if (el.id) { return "#" + CSS.escape(el.id); }
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== document.body && node !== document.documentElement) {
            let part = node.tagName.toLowerCase();
            // 优先用唯一 class
            if (node.className && typeof node.className === "string") {
                const cls = node.className.trim().split(/\s+/).filter(c => c);
                if (cls.length) {
                    // 选第一个看起来不像动态哈希的 class（长度合理且非纯数字）
                    const stable = cls.find(c => c.length > 2 && c.length < 40 && !/^\d+$/.test(c));
                    if (stable) {
                        part = part + "." + CSS.escape(stable);
                        // 检查该 class 在父级下是否唯一，唯一才用
                        try {
                            if (node.parentElement) {
                                const same = node.parentElement.querySelectorAll(part);
                                if (same.length === 1) {
                                    parts.unshift(part);
                                    node = node.parentElement;
                                    continue;
                                }
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            }
            // 用 nth-of-type
            const parent = node.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
                if (siblings.length > 1) {
                    part = part + ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
                }
            }
            parts.unshift(part);
            node = node.parentElement;
            // 路径过长则截断（最多 6 级）
            if (parts.length >= 6) { break; }
        }
        return parts.join(" > ");
    }

    /**
     * 把选取到的元素选择器保存为当前域名的标题规则（同域名覆盖）
     * @param {Element} el    被选取的元素
     * @param {String}  attr  取的属性名（空表示取 textContent）
     */
    function saveTitleRule(el, attr) {
        const selector = getElementSelector(el);
        if (!selector) { return; }
        const domain = location.hostname;
        try {
            chrome.storage.sync.get({ titleRules: [] }, function (items) {
                const rules = items.titleRules || [];
                const idx = rules.findIndex(r => r && r.domain === domain);
                const rule = { domain: domain, selector: selector, attr: attr || "", regex: "", state: true };
                if (idx >= 0) { rules[idx] = rule; } else { rules.push(rule); }
                chrome.storage.sync.set({ titleRules: rules }, function () {
                    // 规则已更新，通知立即用新规则重新提取标题
                    window.dispatchEvent(new CustomEvent("catcatch:titleRuleSaved"));
                });
            });
        } catch (e) { /* 存储不可用时忽略 */ }
    }

    /**
     * 让用户在页面上点击一个 DOM 元素，取其文本作为标题回传
     * @param {Object}   msg          chrome 消息对象（含 requestId）
     * @param {Function} sendResponse chrome 消息回调，回传 { title } 或 null
     */
    function pickElementTitle(msg, sendResponse) {
        let hovered = null;
        let done = false;
        let responded = false;
        // 顶部提示条
        const tip = document.createElement("div");
        tip.id = "__catcatch_pick_tip__";
        tip.textContent = "猫爪：点击页面上要作为标题的元素（Esc 取消）";
        tip.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#f97316;color:#fff;padding:8px 16px;border-radius:20px;font:13px/1.4 -apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:none;";
        document.documentElement.appendChild(tip);

        function cleanup(cancelled) {
            if (responded) { return; }
            responded = true;
            if (hovered) { hovered.style.outline = ""; hovered.style.outlineOffset = ""; hovered = null; }
            tip.remove();
            document.removeEventListener("mousemove", onMove, true);
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("keydown", onKey, true);
            document.body.style.cursor = "";
            if (cancelled) { sendResponse(null); }
        }
        // 暴露给 pickElementCancel 消息调用
        window.__catcatchPickCleanup = cleanup;
        function onMove(e) {
            const el = e.target;
            if (el === tip || el.id === "__catcatch_pick_tip__") { return; }
            if (hovered && hovered !== el) { hovered.style.outline = ""; hovered.style.outlineOffset = ""; }
            hovered = el;
            el.style.outline = "2px solid #f97316";
            el.style.outlineOffset = "1px";
        }
        function onClick(e) {
            e.preventDefault();
            e.stopPropagation();
            const el = e.target;
            if (el === tip || el.id === "__catcatch_pick_tip__") { return; }
            done = true;
            // 优先取文本，再取 alt/title/content 属性
            let title = (el.textContent || "").trim();
            let attr = "";
            if (!title) {
                title = el.getAttribute("alt") || el.getAttribute("title") || el.getAttribute("content") || "";
                if (title) {
                    attr = el.getAttribute("alt") ? "alt" : (el.getAttribute("title") ? "title" : "content");
                }
            }
            title = title.replace(/\s+/g, " ").trim();
            const result = { title: title || null, requestId: msg.requestId, savedRule: false };
            if (msg.saveRule) {
                // 设置名称规则模式：只保存域名规则，不回传标题给当前资源
                saveTitleRule(el, attr);
                result.title = null;
                result.savedRule = true;
            }
            cleanup(false);
            window.__catcatchPickCleanup = null;
            sendResponse(result);
            // 选标题模式：广播给 background 更新数据源（popup 已关闭时，下次打开仍是新标题）
            if (!msg.saveRule && result.title) {
                try { chrome.runtime.sendMessage({ Message: "titlePicked", requestId: msg.requestId, title: result.title }); } catch (e) {}
            }
        }
        function onKey(e) {
            if (e.key === "Escape") {
                done = true;
                cleanup(true);
                window.__catcatchPickCleanup = null;
            }
        }
        document.body.style.cursor = "crosshair";
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("click", onClick, true);
        document.addEventListener("keydown", onKey, true);
        // 30 秒无操作自动取消
        setTimeout(function () { if (!done) { cleanup(); sendResponse(null); } }, 30000);
    }

    // Heart Beat
    var Port;
    function connect() {
        Port = chrome.runtime.connect(chrome.runtime.id, { name: "HeartBeat" });
        Port.postMessage("HeartBeat");
        Port.onMessage.addListener(function (message, Port) { return true; });
        Port.onDisconnect.addListener(connect);
    }
    connect();

    function secToTime(sec) {
        let time = "";
        let hour = Math.floor(sec / 3600);
        let min = Math.floor((sec % 3600) / 60);
        sec = Math.floor(sec % 60);
        if (hour > 0) { time = hour + "'"; }
        if (min < 10) { time += "0"; }
        time += min + "'";
        if (sec < 10) { time += "0"; }
        time += sec;
        return time;
    }
    window.addEventListener("message", (event) => {
        if (!event.data || !event.data.action) { return; }
        if (event.data.action == "catCatchAddMedia") {
            if (!event.data.url) { return; }
            chrome.runtime.sendMessage({
                Message: "addMedia",
                url: event.data.url,
                href: event.data.href ?? event.source.location.href,
                extraExt: event.data.ext,
                mime: event.data.mime,
                requestHeaders: { referer: event.data.referer },
                requestId: event.data.requestId
            });
        }
        if (event.data.action == "catCatchAddKey") {
            let key = event.data.key;
            if (key instanceof ArrayBuffer || key instanceof Array) {
                key = ArrayToBase64(key);
            }
            if (_key.has(key)) { return; }
            _key.add(key);
            chrome.runtime.sendMessage({
                Message: "send2local",
                action: "addKey",
                data: key,
            });
            chrome.runtime.sendMessage({
                Message: "sidepanelAddKey",
                data: key,
                url: event.data.url,
            });
        }
        if (event.data.action == "catCatchFFmpeg") {
            if (!event.data.use ||
                !event.data.files ||
                !event.data.files instanceof Array ||
                event.data.files.length == 0
            ) { return; }
            event.data.title = event.data.title ?? document.title ?? new Date().getTime().toString();
            event.data.title = event.data.title.replaceAll('"', "").replaceAll("'", "").replaceAll(" ", "");
            let data = {
                Message: event.data.action,
                action: event.data.use,
                files: event.data.files,
                url: event.data.href ?? event.source.location.href,
            };
            data = { ...event.data, ...data };
            chrome.runtime.sendMessage(data);
        }
        if (event.data.action == "catCatchFFmpegResult") {
            if (!event.data.state || !event.data.tabId) { return; }
            chrome.runtime.sendMessage({ Message: "catCatchFFmpegResult", ...event.data });
        }
        if (event.data.action == "catCatchToBackground") {
            delete event.data.action;
            chrome.runtime.sendMessage(event.data);
        }
        // if (event.data.action == "catCatchDashDRMMedia") {
        //     // TODO DRM Media
        //     console.log("DRM Media", event);
        // }
    }, false);

    function ArrayToBase64(data) {
        try {
            let bytes = new Uint8Array(data);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            if (typeof _btoa == "function") {
                return _btoa(binary);
            }
            return btoa(binary);
        } catch (e) {
            return false;
        }
    }

    /* ==================== 自定义标题提取 ==================== */
    // 仅顶层页面提取标题（iframe 的 document.title 无意义）
    if (window.top === window.self) {
        // 通配符域名匹配（与 init.js 中同名函数保持一致，content-script 独立注入需自带）
        function matchDomain(hostname, pattern) {
            if (!hostname || !pattern) { return false; }
            if (pattern === "*") { return true; }
            const regexStr = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*?') + "$";
            try { return new RegExp(regexStr, 'i').test(hostname); } catch (e) { return false; }
        }
        // 从 storage 读取标题规则；支持通配符域名匹配
        function loadTitleRules(cb) {
            try {
                chrome.storage.sync.get({ titleRules: [] }, function (items) {
                    cb(items.titleRules || []);
                });
            } catch (e) { cb([]); }
        }

        // 按规则从页面 DOM 中提取标题；未命中规则时返回 null（回退到 document.title）
        function extractTitle(rules) {
            if (!rules || rules.length === 0) { return null; }
            const hostname = location.hostname;
            // 优先精确域名匹配（手动选取保存的规则），再回退到通配符匹配
            let rule = rules.find(r => r && r.state && r.domain === hostname);
            if (!rule) {
                rule = rules.find(r => r && r.state && r.domain && matchDomain(hostname, r.domain));
            }
            if (!rule) { return null; }
            let title = "";
            try {
                if (rule.selector) {
                    const el = document.querySelector(rule.selector);
                    if (el) {
                        title = rule.attr ? (el.getAttribute(rule.attr) || "") : (el.textContent || "");
                    }
                }
            } catch (e) { title = ""; }
            // 对提取结果再做一次正则抽取（捕获组1优先，否则整体匹配）
            if (title && rule.regex) {
                try {
                    const m = title.match(new RegExp(rule.regex));
                    if (m) { title = m[1] || m[0]; }
                } catch (e) { /* 正则非法则忽略 */ }
            }
            title = (title || "").trim();
            return title || null;
        }

        // 把提取到的标题发送给 background 缓存；为空则不发送（保持原 document.title）
        // force=true（用户刚保存名称规则）时跳过去重与锁定限制，强制刷新当前页面资源的标题
        var _lastSentTitle = null;
        function sendTitle(force) {
            loadTitleRules(function (rules) {
                const title = extractTitle(rules);
                console.log("[猫爪] 标题提取", { hostname: location.hostname, rules: rules.length, 提取结果: title, 上次: _lastSentTitle, force: !!force });
                if (title && (force || title !== _lastSentTitle)) {
                    _lastSentTitle = title;
                    chrome.runtime.sendMessage({
                        Message: "setPageTitle",
                        title: title,
                        force: !!force,
                        url: location.href
                    });
                }
            });
        }

        // DOM 就绪后立即提取，并在 DOM 变化时防抖重提（SPA 切换标题场景）
        var _titleTimer = null;
        function scheduleExtract(force) {
            clearTimeout(_titleTimer);
            _titleTimer = setTimeout(function () { sendTitle(force); }, 600);
        }

        /**
         * SPA 路由切换处理：通知 background 冻结上一页资源标题（hash 路由不触发
         * webNavigation.onHistoryStateUpdated，必须由页面主动补报），并重置去重
         * 标记、按新页面重新提取标题
         */
        function onSpaNavigation() {
            try { chrome.runtime.sendMessage({ Message: "pageNavReset" }); } catch (e) {}
            _lastSentTitle = null;
            scheduleExtract();
        }
        // hook pushState/replaceState（站点切换视频页最常用的方式）
        ["pushState", "replaceState"].forEach(function (fnName) {
            const orig = history[fnName];
            if (typeof orig !== "function") { return; }
            history[fnName] = function () {
                const ret = orig.apply(this, arguments);
                try { window.dispatchEvent(new Event("catcatch:spaNav")); } catch (e) {}
                return ret;
            };
        });
        window.addEventListener("catcatch:spaNav", onSpaNavigation);
        window.addEventListener("popstate", onSpaNavigation);
        window.addEventListener("hashchange", onSpaNavigation);
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { scheduleExtract(); });
        } else {
            scheduleExtract();
        }
        // 监听标题节点变化（很多站点用 JS 改 document.title 或 h1）
        // 注意回调必须包无参函数，避免 MutationObserver 的事件记录被当成 force 参数
        try {
            const mo = new MutationObserver(function () { scheduleExtract(); });
            mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        } catch (e) { /* 不支持则忽略 */ }
        // 用户在 popup 手动选取标题后，规则已保存，立即用新规则强制重新提取并刷新本页资源标题
        window.addEventListener("catcatch:titleRuleSaved", function () {
            _lastSentTitle = null;
            sendTitle(true);
        });
        // background 发现本 tab 缺少规则标题缓存时（如 SW 重启丢失 pageTitles）请求重报：
        // 重置去重标记后重发，使该 tab 之后嗅探的资源能拿到规则标题
        chrome.runtime.onMessage.addListener(function (msg) {
            if (msg && msg.Message == "requestPageTitle") {
                _lastSentTitle = null;
                sendTitle();
            }
        });
    }
})();