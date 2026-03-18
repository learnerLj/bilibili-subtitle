const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findCCDialog,
  copyDialogTextAsTxt,
  dispatchDownloadHotspotClick,
  pickPreferredSubtitleTrack,
  subtitleBodyToText,
  fetchSubtitleTextDirect,
  createRequestTransport,
  resolveVideoIdentifiers,
} = require('../script.js');

function createAnchor(label) {
  return {
    textContent: label,
    clicked: false,
    click() {
      this.clicked = true;
    },
  };
}

function createDialogFixture() {
  const textarea = {
    value: 'old value',
  };

  const closeButton = createAnchor('关闭');

  const select = {
    value: 'SRT',
    dispatchEvent(event) {
      if (event.type === 'change' && this.value === 'TXT') {
        textarea.value = '第一行\n第二行';
      }
      return true;
    },
  };

  const panel = {
    querySelector(selector) {
      if (selector === 'textarea') return textarea;
      if (selector === 'select') return select;
      if (selector === 'a:last-of-type, button:last-of-type') return closeButton;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a, button') return [createAnchor('下载'), createAnchor('在新标签页中打开'), closeButton];
      return [];
    },
  };

  const heading = {
    textContent: '字幕下载',
    parentElement: panel,
  };

  const documentStub = {
    querySelectorAll(selector) {
      if (selector === 'h2') return [heading];
      return [];
    },
  };

  return {
    documentStub,
    panel,
    select,
    textarea,
    closeButton,
  };
}

test('findCCDialog locates the 378513 dialog controls', () => {
  const { documentStub, panel } = createDialogFixture();

  const dialog = findCCDialog(documentStub);

  assert.equal(dialog.panel, panel);
  assert.equal(dialog.select.value, 'SRT');
});

test('copyDialogTextAsTxt forces TXT, copies content, and closes the dialog', async () => {
  const { documentStub, select, closeButton } = createDialogFixture();
  const dialog = findCCDialog(documentStub);
  let copied = '';

  const result = await copyDialogTextAsTxt(dialog, async (value) => {
    copied = value;
  });

  assert.equal(result, '第一行\n第二行');
  assert.equal(copied, '第一行\n第二行');
  assert.equal(select.value, 'TXT');
  assert.equal(closeButton.clicked, true);
});

test('copyDialogTextAsTxt throws when the dialog is missing', async () => {
  await assert.rejects(
    () => copyDialogTextAsTxt(null, async () => {}),
    /字幕下载窗口/
  );
});

test('dispatchDownloadHotspotClick emits a click near the right edge', () => {
  const events = [];
  const item = {
    getBoundingClientRect() {
      return { left: 100, right: 200, top: 10, bottom: 30 };
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };

  dispatchDownloadHotspotClick(item);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'click');
  assert.equal(events[0].clientX, 195);
  assert.equal(events[0].clientY, 20);
});

test('pickPreferredSubtitleTrack prefers the current language, then ai-zh, then first', () => {
  const tracks = [
    { lan: 'ai-en', subtitle_url: '//example.com/en.json' },
    { lan: 'ai-zh', subtitle_url: '//example.com/zh.json' },
    { lan: 'ai-ja', subtitle_url: '//example.com/ja.json' },
  ];

  assert.equal(pickPreferredSubtitleTrack(tracks, 'ai-ja').lan, 'ai-ja');
  assert.equal(pickPreferredSubtitleTrack(tracks, 'missing').lan, 'ai-zh');
  assert.equal(pickPreferredSubtitleTrack([{ lan: 'ai-en' }], null).lan, 'ai-en');
});

test('subtitleBodyToText converts BCC body items into TXT lines', () => {
  const result = subtitleBodyToText([
    { content: '第一句' },
    { content: '第二句' },
  ]);

  assert.equal(result, '第一句\n第二句');
});

test('fetchSubtitleTextDirect follows the player config and subtitle url', async () => {
  const calls = [];
  const fetchStub = async (url) => {
    calls.push(url);

    if (url.includes('/x/player/v2')) {
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: {
              subtitle: {
                subtitles: [
                  { lan: 'ai-en', subtitle_url: '//example.com/en.json' },
                  { lan: 'ai-zh', subtitle_url: '//example.com/zh.json' },
                ],
              },
            },
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          body: [
            { content: '第一行' },
            { content: '第二行' },
          ],
        };
      },
    };
  };

  const documentStub = {
    querySelector() {
      return {
        dataset: { lan: 'ai-zh' },
      };
    },
  };

  const result = await fetchSubtitleTextDirect(
    {
      aid: 123,
      bvid: 'BV1xx411c7mD',
      cid: 456,
    },
    fetchStub,
    documentStub
  );

  assert.equal(result, '第一行\n第二行');
  assert.match(calls[0], /aid=123/);
  assert.match(calls[0], /bvid=BV1xx411c7mD/);
  assert.equal(calls[1], 'https://example.com/zh.json');
});

test('fetchSubtitleTextDirect retries when the player config temporarily returns no usable subtitle url', async () => {
  let configCalls = 0;
  const fetchStub = async (url) => {
    if (url.includes('/x/player/v2')) {
      configCalls += 1;
      return {
        ok: true,
        async json() {
          if (configCalls === 1) {
            return {
              code: 0,
              data: {
                subtitle: {
                  subtitles: [],
                },
              },
            };
          }

          return {
            code: 0,
            data: {
              subtitle: {
                subtitles: [
                  { lan: 'ai-zh', subtitle_url: '//example.com/zh.json' },
                ],
              },
            },
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          body: [
            { content: '重试成功' },
          ],
        };
      },
    };
  };

  const text = await fetchSubtitleTextDirect(
    { aid: 1, bvid: 'BV1test', cid: 2 },
    fetchStub,
    { querySelector() { return null; } }
  );

  assert.equal(text, '重试成功');
  assert.equal(configCalls, 2);
});

test('resolveVideoIdentifiers falls back to the view api when page globals are unavailable', async () => {
  const calls = [];
  const fetchStub = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return {
          code: 0,
          data: {
            aid: 1001,
            bvid: 'BV17bA8ejExY',
            cid: 3003,
            pages: [
              { page: 1, cid: 3003, part: '第一页' },
            ],
          },
        };
      },
    };
  };

  const result = await resolveVideoIdentifiers(
    {
      __INITIAL_STATE__: null,
      location: {
        href: 'https://www.bilibili.com/video/BV17bA8ejExY/',
        pathname: '/video/BV17bA8ejExY/',
        search: '',
      },
    },
    fetchStub
  );

  assert.deepEqual(result, {
    aid: 1001,
    bvid: 'BV17bA8ejExY',
    cid: 3003,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /x\/web-interface\/view\?bvid=BV17bA8ejExY/);
});

test('createRequestTransport prefers GM_xmlhttpRequest when available', async () => {
  let gmCalls = 0;
  const transport = createRequestTransport(
    {
      fetch: async () => {
        throw new Error('page fetch should not be used');
      },
    },
    (options) => {
      gmCalls += 1;
      options.onload({
        status: 200,
        responseText: JSON.stringify({ ok: true }),
        responseHeaders: 'content-type: application/json',
      });
    }
  );

  const response = await transport('https://example.com/data.json', { credentials: 'include' });
  const json = await response.json();

  assert.equal(json.ok, true);
  assert.equal(gmCalls, 1);
});
