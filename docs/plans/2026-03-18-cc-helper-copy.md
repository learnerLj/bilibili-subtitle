# 378513 One-Click Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old AI-assistant subtitle extraction flow with a left-side one-click copy button that drives GreasyFork script `378513`'s dialog and copies its `TXT` output.

**Architecture:** Keep the userscript as a single file, but isolate the UI automation and dialog-copy logic into small helpers so the behavior can be tested with stubbed DOM objects. Add a minimal Node test file that imports pure helpers from the userscript-compatible module.

**Tech Stack:** Tampermonkey userscript JavaScript, Node built-in test runner, plain DOM stubs, Clipboard API.

---

### Task 1: Add test harness for dialog-driven copy

**Files:**
- Create: `tests/script.test.js`
- Create: `src/core.js`

**Step 1: Write the failing test**

Write tests for:

- `copyFromCCDialog` returns copied text after forcing `TXT`.
- `copyFromCCDialog` throws when the dialog is missing.
- `copyFromCCDialog` throws when the textarea is empty.

**Step 2: Run test to verify it fails**

Run: `node --test tests/script.test.js`
Expected: FAIL because `src/core.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `src/core.js` with small pure helpers for:

- locating the dialog elements
- switching the select to `TXT`
- extracting textarea content
- copying via injected clipboard function

**Step 4: Run test to verify it passes**

Run: `node --test tests/script.test.js`
Expected: PASS

### Task 2: Replace old extraction flow in the userscript

**Files:**
- Modify: `script.js`
- Modify: `README.md`

**Step 1: Write the failing test**

Add tests for:

- button state changes while copy is in progress
- missing 378513 integration raises the correct message

**Step 2: Run test to verify it fails**

Run: `node --test tests/script.test.js`
Expected: FAIL with missing behavior assertions.

**Step 3: Write minimal implementation**

Update `script.js` to:

- remove AI assistant scraping logic
- add left-button "复制字幕" behavior
- open the subtitle menu and click the `378513` download hotspot
- wait for the "字幕下载" dialog
- force `TXT`, copy text, close dialog, and show a toast

Mirror the reusable logic in `src/core.js` so the userscript stays testable.

**Step 4: Run test to verify it passes**

Run: `node --test tests/script.test.js`
Expected: PASS

### Task 3: Verify and document

**Files:**
- Modify: `README.md`

**Step 1: Write the failing test**

No new automated test. Verification is documentation plus existing tests.

**Step 2: Run test to verify current coverage stays green**

Run: `node --test tests/script.test.js`
Expected: PASS

**Step 3: Write minimal implementation**

Update README usage and prerequisites to explain the dependency on GreasyFork `378513`.

**Step 4: Run test to verify it passes**

Run: `node --test tests/script.test.js`
Expected: PASS
