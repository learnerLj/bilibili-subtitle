// ==UserScript==
// @name         bilibili 字幕复制器
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Copy Bilibili subtitles with a left-side button using the current page subtitle APIs
// @author       Claude
// @match        https://www.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @connect      api.bilibili.com
// @connect      aisubtitle.hdslb.com
// @license      MIT
// ==/UserScript==

const DIALOG_TITLE = '字幕下载';
const TXT_FORMAT = 'TXT';
const FLOATING_BUTTON_ID = 'subtitle-copy-container';
const FLOATING_TEXT_ID = 'subtitle-copy-text';
const TOAST_ID = 'subtitle-copy-toast';
const DOWNLOAD_TARGET_SELECTORS = [
    '.bpx-player-ctrl-subtitle-language-item',
    '.bilibili-player-video-subtitle-setting-lan-majorlist-item',
    '.squirtle-select-item'
];
const SUBTITLE_BUTTON_SELECTORS = [
    '.bpx-player-ctrl-subtitle',
    '.bpx-player-ctrl-btn[aria-label*="字幕"]',
    '.bpx-player-ctrl-btn[aria-label*="subtitle"]',
    '.bilibili-player-video-btn-subtitle',
    '.squirtle-subtitle-wrap'
];

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function readTextValue(element) {
    if (!element) {
        return '';
    }

    if (typeof element.value === 'string') {
        return element.value.trim();
    }

    return normalizeText(element.textContent);
}

function findCloseAction(panel) {
    if (!panel || typeof panel.querySelectorAll !== 'function') {
        return null;
    }

    return Array.from(panel.querySelectorAll('a, button')).find((element) => normalizeText(element.textContent) === '关闭') || null;
}

function findCCDialog(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
        return null;
    }

    const headings = Array.from(doc.querySelectorAll('h2'));
    for (const heading of headings) {
        if (normalizeText(heading.textContent) !== DIALOG_TITLE) {
            continue;
        }

        const panel = heading.parentElement || heading.parentNode;
        if (!panel || typeof panel.querySelector !== 'function') {
            continue;
        }

        const textarea = panel.querySelector('textarea');
        const select = panel.querySelector('select');
        if (!textarea || !select) {
            continue;
        }

        return {
            panel,
            heading,
            textarea,
            select,
            closeButton: findCloseAction(panel),
        };
    }

    return null;
}

function createDomEvent(type, view, eventInit) {
    const init = {
        bubbles: true,
        cancelable: true,
        ...eventInit,
    };

    if (view && typeof view.MouseEvent === 'function' && type === 'click') {
        return new view.MouseEvent(type, init);
    }

    if (view && typeof view.Event === 'function') {
        return new view.Event(type, init);
    }

    if (type === 'click' && typeof MouseEvent === 'function') {
        return new MouseEvent(type, init);
    }

    if (type === 'click') {
        return { type, ...init };
    }

    if (typeof Event === 'function') {
        return new Event(type, init);
    }

    return { type, ...init };
}

function dispatchElementEvent(element, type, view, eventInit) {
    if (!element || typeof element.dispatchEvent !== 'function') {
        return false;
    }

    const event = createDomEvent(type, view, eventInit);
    element.dispatchEvent(event);
    return event;
}

async function waitFor(getValue, {
    timeout = 2500,
    interval = 80,
    errorMessage = '等待超时',
} = {}) {
    const start = Date.now();
    while (Date.now() - start <= timeout) {
        const value = getValue();
        if (value) {
            return value;
        }
        await sleep(interval);
    }

    throw new Error(errorMessage);
}

async function copyDialogTextAsTxt(dialog, clipboardWrite, view) {
    if (!dialog) {
        throw new Error('未找到 378513 的字幕下载窗口');
    }

    if (typeof clipboardWrite !== 'function') {
        throw new Error('当前环境不支持写入剪贴板');
    }

    if (dialog.select.value !== TXT_FORMAT) {
        dialog.select.value = TXT_FORMAT;
        dispatchElementEvent(dialog.select, 'change', view);
    }

    const text = await waitFor(
        () => readTextValue(dialog.textarea),
        { timeout: 1500, interval: 50, errorMessage: '未能从 378513 读取到 TXT 字幕内容' }
    );

    await clipboardWrite(text);

    if (dialog.closeButton && typeof dialog.closeButton.click === 'function') {
        dialog.closeButton.click();
    }

    return text;
}

function isDownloadableSubtitleItem(item) {
    if (!item) {
        return false;
    }

    const lan = normalizeText(item.dataset && item.dataset.lan);
    const text = normalizeText(item.textContent);
    if (!text) {
        return false;
    }

    if (lan === 'close' || lan === 'local') {
        return false;
    }

    return !text.includes('关闭') && !text.includes('本地字幕');
}

function scoreSubtitleItem(item) {
    let score = 0;

    if (item && item.classList) {
        if (item.classList.contains('bpx-state-active')) {
            score += 5;
        }
        if (item.classList.contains('active')) {
            score += 5;
        }
        if (item.classList.contains('selected')) {
            score += 5;
        }
    }

    if (item && item.getAttribute) {
        if (item.getAttribute('aria-checked') === 'true') {
            score += 5;
        }
        if (item.getAttribute('data-state') === 'active') {
            score += 5;
        }
    }

    return score;
}

function findSubtitleDownloadTarget(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
        return null;
    }

    const candidates = DOWNLOAD_TARGET_SELECTORS.flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
    const filtered = candidates.filter(isDownloadableSubtitleItem);
    filtered.sort((left, right) => scoreSubtitleItem(right) - scoreSubtitleItem(left));
    return filtered[0] || null;
}

function findSubtitleButton(doc) {
    if (!doc || typeof doc.querySelector !== 'function') {
        return null;
    }

    for (const selector of SUBTITLE_BUTTON_SELECTORS) {
        const element = doc.querySelector(selector);
        if (element) {
            return element;
        }
    }

    return null;
}

async function ensureSubtitleDownloadTarget(doc) {
    const existingTarget = findSubtitleDownloadTarget(doc);
    if (existingTarget) {
        return existingTarget;
    }

    const button = findSubtitleButton(doc);
    if (!button || typeof button.click !== 'function') {
        throw new Error('未找到字幕菜单，请确认当前视频已开启字幕');
    }

    button.click();

    return waitFor(
        () => findSubtitleDownloadTarget(doc),
        { timeout: 2000, interval: 100, errorMessage: '未找到 378513 的字幕下载入口，请确认脚本 378513 已启用' }
    );
}

function dispatchDownloadHotspotClick(item, view) {
    if (!item) {
        throw new Error('未找到 378513 的字幕下载入口');
    }

    const rect = typeof item.getBoundingClientRect === 'function'
        ? item.getBoundingClientRect()
        : { left: 0, right: 30, top: 0, bottom: 20 };

    const clientX = Math.max(Math.round(rect.right - 5), 0);
    const clientY = Math.max(Math.round((rect.top + rect.bottom) / 2), 0);
    const event = createDomEvent('click', view, { clientX, clientY });

    if (typeof item.dispatchEvent === 'function') {
        item.dispatchEvent(event);
        return event;
    }

    if (typeof item.click === 'function') {
        item.click();
        return event;
    }

    throw new Error('字幕下载入口不可点击');
}

function findCurrentSubtitleLan(doc) {
    if (!doc || typeof doc.querySelector !== 'function') {
        return null;
    }

    const activeItem = doc.querySelector(
        '.bpx-player-ctrl-subtitle-language-item.bpx-state-active,' +
        '.bilibili-player-video-subtitle-setting-lan-majorlist-item.bilibili-player-video-subtitle-setting-lan-majorlist-item-active,' +
        '.squirtle-select-item.active'
    );

    return normalizeText(activeItem && activeItem.dataset && activeItem.dataset.lan) || null;
}

function pickPreferredSubtitleTrack(tracks, currentLan) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    const normalizedCurrentLan = normalizeText(currentLan);
    if (normalizedCurrentLan) {
        const currentTrack = tracks.find((track) => normalizeText(track && track.lan) === normalizedCurrentLan);
        if (currentTrack) {
            return currentTrack;
        }
    }

    const preferredTrack = tracks.find((track) => {
        const lan = normalizeText(track && track.lan);
        return lan === 'ai-zh' || lan === 'zh-CN' || lan === 'zh-Hans' || lan === 'zh';
    });

    return preferredTrack || tracks[0];
}

function normalizeSubtitleUrl(url) {
    if (!url) {
        return '';
    }

    return url.startsWith('//') ? `https:${url}` : url;
}

function subtitleBodyToText(body) {
    if (!Array.isArray(body) || body.length === 0) {
        return '';
    }

    return body
        .map((item) => normalizeText(item && item.content))
        .filter(Boolean)
        .join('\n');
}

function getVideoIdentifiers(win) {
    const state = (win && win.__INITIAL_STATE__) || {};
    const videoData = state.videoData || {};
    const pageData = (videoData.pages && videoData.pages[0]) || {};

    return {
        aid: state.aid || videoData.aid || null,
        bvid: state.bvid || videoData.bvid || null,
        cid: state.cid || videoData.cid || pageData.cid || null,
    };
}

function createRequestTransport(win, gmRequest) {
    const requestFn = gmRequest
        || ((win && typeof win.GM_xmlhttpRequest === 'function') ? win.GM_xmlhttpRequest : null)
        || (typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null);

    if (!requestFn) {
        if (!win || typeof win.fetch !== 'function') {
            throw new Error('当前环境不支持网络请求');
        }

        return win.fetch.bind(win);
    }

    return (url, init = {}) => new Promise((resolve, reject) => {
        requestFn({
            method: init.method || 'GET',
            url,
            headers: init.headers,
            anonymous: init.credentials !== 'include',
            onload: (response) => {
                const responseText = response.responseText || '';
                const headerMap = new Map();
                String(response.responseHeaders || '')
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .forEach((line) => {
                        const separatorIndex = line.indexOf(':');
                        if (separatorIndex === -1) {
                            return;
                        }

                        headerMap.set(
                            line.slice(0, separatorIndex).trim().toLowerCase(),
                            line.slice(separatorIndex + 1).trim()
                        );
                    });

                resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    headers: {
                        get(name) {
                            return headerMap.get(String(name || '').toLowerCase()) || null;
                        },
                    },
                    async json() {
                        return JSON.parse(responseText);
                    },
                    async text() {
                        return responseText;
                    },
                });
            },
            onerror: () => reject(new Error('GM_xmlhttpRequest failed')),
        });
    });
}

async function fetchJson(url, fetchImpl, requestInit) {
    const response = await fetchImpl(url, requestInit);
    if (!response || !response.ok) {
        throw new Error(`字幕请求失败: ${url}`);
    }

    return response.json();
}

async function fetchSubtitleTextDirect(videoInfo, fetchImpl, doc) {
    if (!videoInfo || !videoInfo.aid || !videoInfo.bvid || !videoInfo.cid) {
        throw new Error('无法读取当前视频信息');
    }

    const configUrl = `https://api.bilibili.com/x/player/v2?aid=${encodeURIComponent(videoInfo.aid)}&cid=${encodeURIComponent(videoInfo.cid)}&bvid=${encodeURIComponent(videoInfo.bvid)}`;
    let track = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const configJson = await fetchJson(configUrl, fetchImpl, { credentials: 'include' });
        const subtitleData = configJson && configJson.data && configJson.data.subtitle;
        const subtitles = subtitleData && subtitleData.subtitles;
        const tracks = Array.isArray(subtitles) && subtitles.length > 0
            ? subtitles
            : (subtitleData && subtitleData.list) || [];

        track = pickPreferredSubtitleTrack(tracks, findCurrentSubtitleLan(doc));
        if (track && track.subtitle_url) {
            break;
        }

        track = null;
        if (attempt < 2) {
            await sleep(300);
        }
    }

    if (!track || !track.subtitle_url) {
        throw new Error('当前视频没有可读取的字幕轨');
    }

    const subtitleJson = await fetchJson(normalizeSubtitleUrl(track.subtitle_url), fetchImpl);
    const text = subtitleBodyToText(subtitleJson && subtitleJson.body);
    if (!text) {
        throw new Error('字幕内容为空');
    }

    return text;
}

function createFloatingButton() {
    if (document.querySelector(`#${FLOATING_BUTTON_ID}`)) {
        return;
    }

    const container = document.createElement('div');
    container.id = FLOATING_BUTTON_ID;
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '50%';
    container.style.transform = 'translateY(-50%)';
    container.style.backgroundColor = 'rgba(251, 114, 153, 0.82)';
    container.style.color = 'white';
    container.style.padding = '5px 8px';
    container.style.borderRadius = '0 4px 4px 0';
    container.style.cursor = 'pointer';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.boxShadow = '2px 2px 10px rgba(0, 0, 0, 0.2)';
    container.style.transition = 'background-color 0.2s ease';
    container.style.fontSize = '12px';
    container.style.userSelect = 'none';

    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('width', '10');
    iconSvg.setAttribute('height', '10');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.style.marginRight = '4px';
    iconSvg.innerHTML = `
        <path fill-rule="evenodd" clip-rule="evenodd" d="M9 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V15H19V19H5V5H9V3ZM14.5858 3H21V9.41421H19V6.41421L10.7071 14.7071L9.29289 13.2929L17.5858 5H14.5858V3Z" fill="white"/>
    `;
    container.appendChild(iconSvg);

    const textLabel = document.createElement('span');
    textLabel.id = FLOATING_TEXT_ID;
    textLabel.textContent = '复制字幕';
    container.appendChild(textLabel);

    container.addEventListener('click', handleCopyClick);
    document.body.appendChild(container);
}

function showToast(message, isError) {
    const button = document.querySelector(`#${FLOATING_BUTTON_ID}`);
    if (!button) {
        return;
    }

    const existing = document.querySelector(`#${TOAST_ID}`);
    if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
    }

    const rect = button.getBoundingClientRect();
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.top = `${Math.round(rect.top)}px`;
    toast.style.left = `${Math.round(rect.right + 10)}px`;
    toast.style.padding = '5px 10px';
    toast.style.backgroundColor = isError ? '#f56c6c' : '#fb7299';
    toast.style.color = 'white';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '10000';
    toast.style.fontSize = '12px';
    toast.style.boxShadow = '2px 2px 10px rgba(0, 0, 0, 0.2)';
    toast.style.whiteSpace = 'nowrap';
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 1800);
}

function setButtonBusy(isBusy) {
    const button = document.querySelector(`#${FLOATING_BUTTON_ID}`);
    const text = document.querySelector(`#${FLOATING_TEXT_ID}`);
    if (!button || !text) {
        return;
    }

    button.dataset.busy = isBusy ? 'true' : 'false';
    button.style.backgroundColor = isBusy ? 'rgba(251, 114, 153, 0.96)' : 'rgba(251, 114, 153, 0.82)';
    text.textContent = isBusy ? '复制中...' : '复制字幕';
}

async function handleCopyClick() {
    const button = document.querySelector(`#${FLOATING_BUTTON_ID}`);
    if (!button || button.dataset.busy === 'true') {
        return;
    }

    let dialog = null;
    setButtonBusy(true);

    try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            throw new Error('浏览器不支持剪贴板写入');
        }

        const copiedText = await fetchSubtitleTextDirect(getVideoIdentifiers(window), createRequestTransport(window), document);
        await navigator.clipboard.writeText(copiedText);

        const lineCount = copiedText.split(/\r?\n/).filter(Boolean).length;
        showToast(`字幕已复制${lineCount ? `，共 ${lineCount} 行` : ''}`, false);
    } catch (error) {
        console.error('Copy subtitles failed:', error);
        showToast(error && error.message ? error.message : '复制字幕失败', true);
    } finally {
        if (dialog && dialog.closeButton && typeof dialog.closeButton.click === 'function') {
            dialog.closeButton.click();
        }
        setButtonBusy(false);
    }
}

function init() {
    window.addEventListener('load', () => {
        setTimeout(createFloatingButton, 2000);
    });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    init();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        copyDialogTextAsTxt,
        createRequestTransport,
        dispatchDownloadHotspotClick,
        fetchSubtitleTextDirect,
        findCCDialog,
        pickPreferredSubtitleTrack,
        subtitleBodyToText,
    };
}
