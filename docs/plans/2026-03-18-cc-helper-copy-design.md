# 378513 One-Click Copy Design

**Problem**

The current userscript extracts subtitles through Bilibili's AI assistant panel. That path is brittle and already outdated. The user wants to keep the left-side floating entry point but make the copy source depend on GreasyFork script `378513` ("Bilibili CC字幕工具"), which already fetches and formats subtitles successfully.

**Goal**

Replace the current extraction flow with a one-click copy flow that reuses script `378513`'s existing subtitle preview dialog. The new button should trigger that plugin's UI, force `TXT`, copy the textarea content, close the dialog, and show a short success or failure notice.

**Scope**

- Keep the left-side floating button pattern.
- Rename the action to "复制字幕".
- Depend on the presence of script `378513` instead of scraping Bilibili AI assistant DOM.
- Copy plain `TXT` content only.
- Fail clearly when `378513` is not installed, not initialized, or no subtitles are available.

**Non-Goals**

- Reimplement `378513`'s subtitle fetching logic.
- Support multiple output formats in this script.
- Preserve the old AI assistant extraction fallback.

**Approach**

Because `378513` does not expose a public API, the integration point will be its rendered UI:

1. Detect that `378513` has patched the subtitle menu by checking for its extra download trigger nodes when the subtitle menu is opened.
2. From the left-side floating button, synthesize the minimum UI interactions needed to invoke `378513`'s preview dialog for the currently active subtitle track.
3. When the dialog appears, switch its format selector to `TXT`, wait for the textarea to refresh, then read and copy the content.
4. Close the dialog automatically and restore the button state.

**Data Flow**

1. User clicks the left floating button.
2. Script opens the player subtitle menu if needed.
3. Script finds the `378513`-managed subtitle download entry for the active subtitle track and clicks the download hotspot.
4. Script observes the appearance of the "字幕下载" dialog.
5. Script changes the dialog format selector to `TXT`.
6. Script reads the dialog textarea and writes the text to the clipboard.
7. Script clicks the dialog close action and shows a temporary toast near the left button.

**Error Handling**

- If the subtitle menu cannot be opened, show an explicit notice.
- If `378513` UI hooks are absent, tell the user to install/enable script `378513`.
- If the dialog opens but no `TXT` content is produced, show a failure notice and leave the dialog closed.
- Clipboard failures should show a browser-permission message.

**Testing Strategy**

Use a minimal Node test harness with stubbed DOM objects to cover:

- Successful dialog detection and TXT copy.
- Missing `378513` UI path.
- Empty textarea failure handling.
- Button state reset after success/failure.
