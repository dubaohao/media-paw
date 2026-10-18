// @ts-nocheck
// 低版本chrome manifest v3协议 会有 getMessage 函数不存在的bug
if (chrome.i18n.getMessage === undefined) {
    chrome.i18n.getMessage = (key) => key;
    fetch(chrome.runtime.getURL("_locales/zh_CN/messages.json")).then(res => res.json()).then(data => {
        chrome.i18n.getMessage = (key) => data[key].messages;
    }).catch((e) => { console.error(e); });
}
/**
 * 部分修改版chrome 不存在 chrome.downloads API
 * 例如 夸克浏览器
 * 使用传统下载方式下载 但无法监听 无法另存为 无法判断下载是否失败 唉~
 */
if (!chrome.downloads) {
    chrome.downloads = {
        download: function (options, callback) {
            let a = document.createElement('a');
            a.href = options.url;
            a.download = options.filename;
            a.click();
            a = null;
            callback && callback();
        },
        onChanged: { addListener: function () { } },
        showDefaultFolder: function () { },
        show: function () { },
    }
}
// 兼容 114版本以下没有chrome.sidePanel
if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel = {
        setOptions: function (options) { },
        setPanelBehavior: function (options) { },
    }
}

// 简写翻译函数
export const i18n = new Proxy(chrome.i18n.getMessage, {
    get: function (target, key) {
        return chrome.i18n.getMessage(key as string);
    }
});
// 全局变量
export let G: any = {};
G.initSyncComplete = false;
G.initLocalComplete = false;
// 缓存数据
export let cacheData: any = { init: true };
G.blackList = new Set();    // 正则屏蔽资源列表
G.blockUrlSet = new Set();    // 屏蔽网址列表
G.requestHeaders = new Map();   // 临时储存请求头
G.urlMap = new Map();   // url查重map
G.deepSearchTemporarilyClose = null; // 深度搜索临时变量

// 避免抓取列表
G.damnUrl = [
    /^https:\/\/.*\.douyin\.com\/.*$/i,
];
G.damnUrlSet = new Set();

// 初始化当前tabId
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
    } else {
        G.tabId = -1;
    }
});

// 手机浏览器
G.isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

// 所有设置变量 默认值
G.OptionLists = {
    Ext: [
        { "ext": "flv", "size": 0, "operator": ">=", "state": true },
        { "ext": "hlv", "size": 0, "operator": ">=", "state": true },
        { "ext": "f4v", "size": 0, "operator": ">=", "state": true },
        { "ext": "mp4", "size": 0, "operator": ">=", "state": true },
        { "ext": "mp3", "size": 0, "operator": ">=", "state": true },
        { "ext": "wma", "size": 0, "operator": ">=", "state": true },
        { "ext": "wav", "size": 0, "operator": ">=", "state": true },
        { "ext": "m4a", "size": 0, "operator": ">=", "state": true },
        { "ext": "ts", "size": 0, "operator": ">=", "state": false },
        { "ext": "webm", "size": 0, "operator": ">=", "state": true },
        { "ext": "ogg", "size": 0, "operator": ">=", "state": true },
        { "ext": "ogv", "size": 0, "operator": ">=", "state": true },
        { "ext": "acc", "size": 0, "operator": ">=", "state": true },
        { "ext": "mov", "size": 0, "operator": ">=", "state": true },
        { "ext": "mkv", "size": 0, "operator": ">=", "state": true },
        { "ext": "m4s", "size": 0, "operator": ">=", "state": true },
        { "ext": "m3u8", "size": 0, "operator": ">=", "state": true },
        { "ext": "m3u", "size": 0, "operator": ">=", "state": true },
        { "ext": "mpeg", "size": 0, "operator": ">=", "state": true },
        { "ext": "avi", "size": 0, "operator": ">=", "state": true },
        { "ext": "wmv", "size": 0, "operator": ">=", "state": true },
        { "ext": "asf", "size": 0, "operator": ">=", "state": true },
        { "ext": "movie", "size": 0, "operator": ">=", "state": true },
        { "ext": "divx", "size": 0, "operator": ">=", "state": true },
        { "ext": "mpeg4", "size": 0, "operator": ">=", "state": true },
        { "ext": "vid", "size": 0, "operator": ">=", "state": true },
        { "ext": "aac", "size": 0, "operator": ">=", "state": true },
        { "ext": "mpd", "size": 0, "operator": ">=", "state": true },
        { "ext": "weba", "size": 0, "operator": ">=", "state": true },
        { "ext": "opus", "size": 0, "operator": ">=", "state": true },
        { "ext": "srt", "size": 0, "operator": ">=", "state": false },
        { "ext": "vtt", "size": 0, "operator": ">=", "state": false },
    ],
    Type: [
        { "type": "audio/*", "size": 0, "operator": ">=", "state": true },
        { "type": "video/*", "size": 0, "operator": ">=", "state": true },
        { "type": "application/ogg", "size": 0, "operator": ">=", "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "operator": ">=", "state": true },
        { "type": "application/x-mpegurl", "size": 0, "operator": ">=", "state": true },
        { "type": "application/mpegurl", "size": 0, "operator": ">=", "state": true },
        { "type": "application/octet-stream-m3u8", "size": 0, "operator": ">=", "state": true },
        { "type": "application/dash+xml", "size": 0, "operator": ">=", "state": true },
        { "type": "application/m4s", "size": 0, "operator": ">=", "state": true },
    ],
    Regex: [
        { "type": "ig", "regex": "https://cache\\.video\\.[a-z]*\\.com/dash\\?tvid=.*", "ext": "json", "state": false },
        { "type": "ig", "regex": ".*\\.bilivideo\\.(com|cn).*\\/live-bvc\\/.*m4s", "ext": "", "blackList": true, "state": false },
        { "type": "ig", "regex": "(^https://scontent[a-z0-9-]*\\.cdninstagram\\.com/.*)&bytestart=.*", "ext": "", "blackList": false, "state": false },
        { "type": "ig", "regex": "(^https://.*\\.fbcdn\\.net/.*)&bytestart=.*", "ext": "", "blackList": false, "state": false },
    ],
    TitleName: false,
    Player: "",
    ShowWebIco: !G.isMobile,
    MobileUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
    m3u8dl: 0,
    m3u8dlArg: `"\${url}" --save-dir "%USERPROFILE%\\Downloads\\m3u8dl" --save-name "\${title}_\${now}" \${referer|exists:'-H "Referer:*"'} \${cookie|exists:'-H "Cookie:*"'} --no-log`,
    m3u8dlConfirm: false,
    playbackRate: 2,
    copyM3U8: "${url}",
    copyMPD: "${url}",
    copyOther: "${url}",
    autoClearMode: 1,
    catDownload: false,
    autoDownload: false,   // 全局自动下载开关（嗅探到资源自动下载，m3u8/mpd 走解析器）
    saveAs: false,
    userAgent: "",
    downFileName: "${title}.${ext}",
    css: "",
    checkDuplicates: true,
    enable: true,
    downActive: !G.isMobile,    // 手机端默认不启用 后台下载
    downAutoClose: true,
    downStream: false,
    aria2Rpc: "http://localhost:6800/jsonrpc",
    enableAria2Rpc: false,
    enableAria2RpcReferer: true,
    aria2RpcToken: "",
    m3u8AutoDown: true,
    badgeNumber: true,
    send2local: false,
    send2localManual: false,
    send2localURL: "http://127.0.0.1:8000/",
    send2localMethod: 'POST',
    send2localBody: '{"action": "${action}", "data": ${data}, "tabId": "${tabId}"}',
    send2localType: 0,
    popup: false,
    popupMode: 0, // 0:preview.html 1:sidepanel.html 2:window preview.html 3: window sidepanel.html
    invoke: false,
    invokeText: `m3u8dlre:"\${url}" --save-dir "%USERPROFILE%\\Downloads" --del-after-done --save-name "\${title}_\${now}" --auto-select \${referer|exists:'-H "Referer: *"'}`,
    invokeConfirm: false,
    // m3u8解析器默认参数
    M3u8Thread: 6,
    M3u8Mp4: false,
    M3u8OnlyAudio: false,
    M3u8SkipDecrypt: false,
    M3u8StreamSaver: false,
    M3u8Ffmpeg: true,
    M3u8AutoClose: false,
    // 第三方服务地址
    onlineServiceAddress: 0,
    chromeLimitSize: 1.8 * 1024 * 1024 * 1024,
    blockUrl: [],
    blockUrlWhite: false,
    maxLength: G.isMobile ? 999 : 9999,
    sidePanel: true,   // 侧边栏（默认开启，点击扩展图标从侧边抽屉打开）
    deepSearch: false, // 常开深度搜索
    // MQTT 配置
    send2MQTT: false,
    mqttEnable: false,
    mqttBroker: "test.mosquitto.org",
    mqttPort: 8081,
    mqttPath: "/mqtt",
    mqttProtocol: "wss",
    mqttClientId: "cat-catch-client",
    mqttUser: "",
    mqttPassword: "",
    mqttTopic: "cat-catch/media",
    mqttQos: 0,
    mqttTitleLength: 100,
    mqttDataFormat: "",
    getHtmlDOM: false,
    damn: false,
    // 按域名提取页面标题的规则列表（用于自定义下载文件名中的 ${title}）
    // 每条规则：domain(通配符) / selector(CSS选择器) / attr(取属性，留空取textContent) / regex(对结果再正则提取，留空不处理) / state(启用)
    titleRules: [
        { domain: "*.bilibili.com", selector: "h1.video-title, .video-title, h1", attr: "", regex: "", state: true },
        { domain: "*.youtube.com", selector: "meta[property='og:title']", attr: "content", regex: "", state: true },
    ],
};

// 本地储存的配置
G.LocalVar = {
    featMobileTabId: [],
    featAutoDownTabId: [],
    mediaControl: { tabid: 0, index: -1 },
    previewShowTitle: false, // 是否显示标题
    previewDeleteDuplicateFilenames: false, // 是否删除重复文件名
};

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = navigator.userAgent.includes('Firefox') && (typeof browser !== 'undefined' && !!browser.runtime?.getBrowserInfo);
G.version = navigator.userAgent.match(/(Chrome|Firefox)\/([\d]+)/);
G.version = G.version && G.version[2] ? parseInt(G.version[2]) : 93;

// 脚本列表
G.scriptList = new Map();
G.scriptList.set("search.js", { key: "search", refresh: true, allFrames: true, world: "MAIN", name: i18n.deepSearch, off: i18n.closeSearch, i18n: false, tabId: new Set() });
G.scriptList.set("catch.js", { key: "catch", refresh: true, allFrames: true, world: "MAIN", name: i18n.cacheCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("recorder.js", { key: "recorder", refresh: false, allFrames: true, world: "MAIN", name: i18n.videoRecording, off: i18n.closeRecording, i18n: true, tabId: new Set() });
G.scriptList.set("recorder2.js", { key: "recorder2", refresh: false, allFrames: false, world: "ISOLATED", name: i18n.screenCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("webrtc.js", { key: "webrtc", refresh: true, allFrames: true, world: "MAIN", name: i18n.recordWebRTC, off: i18n.closeRecording, i18n: true, tabId: new Set() });

// ffmpeg
G.ffmpegConfig = {
    tab: 0,
    cacheData: [],
    version: 1,
    get url() {
        return G.onlineServiceAddress == 0 ? "https://ffmpeg.bmmmd.com/" : "https://ffmpeg.94cat.com/";
    }
}
// streamSaver 边下边存
G.streamSaverConfig = {
    get url() {
        return G.onlineServiceAddress == 0 ? "https://stream.bmmmd.com/mitm.html" : "https://ffmpeg.94cat.com/mitm.html";
    }
}

// 正则预编译（经典脚本时代靠全局词法环境共享，模块化后需显式导出）
export const reFilename = /filename="?([^"]+)"?/;
const reStringModify = /[<>:"\/\\|?*~]/g;
export const reFilterFileName = /[<>:"|?*~]/g;
export const reTemplates = /\${([^}|]+)(?:\|([^}]+))?}/g;
export const reJSONparse = /([{,]\s*)([\w-]+)(\s*:)/g;

/** cacheData 从 storage 恢复完成的 Promise。
 *  SW 重启后 getAllData/getData 必须等它 resolve，否则侧边栏会在恢复窗口期拿到空壳快照；
 *  恢复完成后广播 cacheDataReady，已打开的侧边栏收到后重新全量对账补缺失 */
export const cacheDataReady: Promise<void> = new Promise(function (resolve) {
    // 断开重新连接后 立刻把local里MediaData数据交给cacheData
    (chrome.storage.session ?? chrome.storage.local).get({ MediaData: {} }, function (items) {
        if (items.MediaData.init) {
            cacheData = {};
        } else {
            cacheData = items.MediaData;
            // SW 重启恢复：恢复期间进行中的下载任务已随 SW 进程死亡，
            // 残留的 downloading/merging 状态全部重置回 none（未完成），让用户可重新下载
            let stateFixed = false;
            for (const tabId in cacheData) {
                for (const item of cacheData[tabId] ?? []) {
                    if (item && (item.state === "downloading" || item.state === "merging")) {
                        item.state = "none";
                        stateFixed = true;
                    }
                }
            }
            if (stateFixed) {
                (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
            }
        }
        resolve();
        // 仅 background SW 广播（init 也会被其他扩展页面导入，避免重复广播触发多余对账）
        if (typeof window === "undefined") {
            try { chrome.runtime.sendMessage({ Message: "cacheDataReady" }); } catch (e) { /* 无接收者则忽略 */ }
        }
    });
});

// Init
InitOptions();

// 初始变量
function InitOptions() {
    // 读取sync配置数据 交给全局变量G
    chrome.storage.sync.get(G.OptionLists, function (items) {
        if (chrome.runtime.lastError) {
            items = G.OptionLists;
        }
        // 确保有默认值
        for (let key in G.OptionLists) {
            if (items[key] === undefined || items[key] === null) {
                items[key] = G.OptionLists[key];
            }
        }
        // Ext的Array转为Map类型 如果是范围 增加min max属性
        items.Ext = new Map(items.Ext.map(item => {
            if (item.operator === undefined) { item.operator = ">="; }
            if (item.operator === "~") {
                const [min, max] = item.size.split("-");
                item.min = min ? parseInt(min) : 0;
                item.max = max ? parseInt(max) : 0;
            }
            return [item.ext, item];
        }));
        // Type的Array转为Map类型 如果是范围 增加min max属性
        items.Type = new Map(items.Type.map(item => {
            if (item.operator === undefined) { item.operator = ">="; }
            if (item.operator === "~") {
                const [min, max] = item.size.split("-");
                item.min = min ? parseInt(min) : 0;
                item.max = max ? parseInt(max) : 0;
            }
            return [item.type, item];
        }));
        // 预编译正则匹配
        items.Regex = items.Regex.map(item => {
            let reg = undefined;
            try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; }
            return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
        });
        // 预编译屏蔽通配符
        items.blockUrl = items.blockUrl.map(item => {
            return { url: wildcardToRegex(item.url), state: item.state }
        });

        // 兼容旧配置
        if (items.copyM3U8.includes('$url$')) {
            items.copyM3U8 = items.copyM3U8.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyM3U8: items.copyM3U8 });
        }
        if (items.copyMPD.includes('$url$')) {
            items.copyMPD = items.copyMPD.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyMPD: items.copyMPD });
        }
        if (items.copyOther.includes('$url$')) {
            items.copyOther = items.copyOther.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
            chrome.storage.sync.set({ copyOther: items.copyOther });
        }
        if (typeof items.m3u8dl == 'boolean') {
            items.m3u8dl = items.m3u8dl ? 1 : 0;
            chrome.storage.sync.set({ m3u8dl: items.m3u8dl });
        }

        // 侧边栏
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: items.sidePanel });

        G = { ...items, ...G };

        // 初始化 G.blockUrlSet
        (typeof isLockUrl == 'function') && chrome.tabs.query({}, function (tabs) {
            for (const tab of tabs) {
                if (tab.url) {
                    isLockUrl(tab.url) && G.blockUrlSet.add(tab.id);
                    isDamnUrl(tab.url) && G.damnUrlSet.add(tab.id);
                }
            }
        });

        // dev 模式工具栏图标加 DEV 标识，与生产版区分
        chrome.action.setIcon({ path: process.env.NODE_ENV === "development"
            ? (G.enable ? "/assets/img/icon-dev.png" : "/assets/img/icon-disable-dev.png")
            : (G.enable ? "/assets/img/icon.png" : "/assets/img/icon-disable.png") });
        G.initSyncComplete = true;
    });
    // 读取local配置数据 交给全局变量G
    (chrome.storage.session ?? chrome.storage.local).get(G.LocalVar, function (items) {
        items.featMobileTabId = new Set(items.featMobileTabId);
        items.featAutoDownTabId = new Set(items.featAutoDownTabId);
        G = { ...items, ...G };
        G.initLocalComplete = true;
    });
}
// 监听变化，新值给全局变量
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (changes.MediaData) {
        if (changes.MediaData.newValue?.init) { cacheData = {}; }
        return;
    }
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        newValue ??= G.OptionLists[key];
        if (key == "Ext") {
            G.Ext = new Map(newValue.map(item => {
                if (item.operator === "~") {
                    const [min, max] = item.size.split("-");
                    item.min = min ? parseInt(min) : 0;
                    item.max = max ? parseInt(max) : 0;
                }
                return [item.ext, item];
            }));
            continue;
        }
        if (key == "Type") {
            G.Type = new Map(newValue.map(item => {
                if (item.operator === "~") {
                    const [min, max] = item.size.split("-");
                    item.min = min ? parseInt(min) : 0;
                    item.max = max ? parseInt(max) : 0;
                }
                return [item.type, item];
            }));
            continue;
        }
        if (key == "Regex") {
            G.Regex = newValue.map(item => {
                let reg = undefined;
                try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; }
                return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
            });
            continue;
        }
        if (key == "blockUrl") {
            G.blockUrl = newValue.map(item => {
                return { url: wildcardToRegex(item.url), state: item.state }
            });
            continue;
        }
        if (key == "featMobileTabId" || key == "featAutoDownTabId") {
            G[key] = new Set(newValue);
            continue;
        }
        if (key == "sidePanel" && !G.isFirefox) {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: newValue });
            continue;
        }
        G[key] = newValue;
    }
});

// 扩展升级，清空本地储存
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == "update") {
        chrome.storage.local.clear(function () {
            if (chrome.storage.session) {
                chrome.storage.session.clear(InitOptions);
            } else {
                InitOptions();
            }
        });
        chrome.alarms.create("nowClear", { when: Date.now() + 3000 });
    }
    if (details.reason == "install") {
        chrome.tabs.create({ url: "tabs/install.html" });
    }
});

/**
 * 将用户输入的URL（可能包含通配符）转换为正则表达式
 * @param {string} urlPattern - 用户输入的URL，可能包含通配符
 * @returns {RegExp} - 转换后的正则表达式
 */
function wildcardToRegex(urlPattern) {
    // 将通配符 * 转换为正则表达式的 .*
    // 将通配符 ? 转换为正则表达式的 .
    // 同时转义其他正则表达式特殊字符
    const regexPattern = urlPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义正则表达式特殊字符
        .replace(/\*/g, '.*') // 将 * 替换为 .*
        .replace(/\?/g, '.'); // 将 ? 替换为 .

    // 创建正则表达式，确保匹配整个URL
    return new RegExp(`^${regexPattern}$`, 'i'); // 忽略大小写
}

/**
 * 通配符域名匹配（用于按域名命中标题提取规则）
 * 支持 "*" 通配任意字符，例如 "*.bilibili.com"、"youtube.*"、"*"（命中全部）
 * @param {String} hostname 待匹配的主机名（如 www.bilibili.com）
 * @param {String} pattern  通配符模式（如 *.bilibili.com）
 * @returns {Boolean} 是否匹配
 */
function matchDomain(hostname, pattern) {
    if (!hostname || !pattern) { return false; }
    if (pattern === "*") { return true; }
    const regexStr = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*?') + "$";
    try {
        return new RegExp(regexStr, 'i').test(hostname);
    } catch (e) {
        return false;
    }
}