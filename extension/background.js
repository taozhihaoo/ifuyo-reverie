/**
 * Reverie Capture — MV3 service worker (M1 protocol v1).
 * Sends a CaptureRequest to the Reverie Capture Host via Native Messaging;
 * the Host only enqueues (fast), so the badge means "queued", and the final
 * result is visible inside the Reverie app.
 *
 * Uses a long-lived port instead of one-shot sendNativeMessage: on Windows
 * the host emits one harmless {"reverie_padding":true} alignment message
 * before the real response (Electron launcher writes "\r\n" to stdout at
 * boot — see src/capture/native-host.js), and one-shot mode would mistake
 * it for the answer.
 */
const HOST_NAME = 'com.reverie.capture_host';
const RESPONSE_TIMEOUT_MS = 15000;

function urlOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparsable)';
  }
}

function requestViaPort(request) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch { /* already gone */ }
      resolve(response ?? null, error);
    };
    const timer = setTimeout(() => finish(null, new Error('host response timeout')), RESPONSE_TIMEOUT_MS);
    const port = chrome.runtime.connectNative(HOST_NAME);
    port.onMessage.addListener((msg) => {
      if (msg && typeof msg === 'object' && !msg.status) return; // alignment padding
      finish(msg);
    });
    port.onDisconnect.addListener(() => {
      finish(null, new Error(chrome.runtime.lastError?.message ?? 'host disconnected'));
    });
    port.postMessage(request);
  });
}

async function captureTab(tab) {
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    await chrome.action.setBadgeText({ text: 'ERR' });
    await chrome.action.setTitle({ title: 'Reverie: only http(s) pages can be saved' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
    return;
  }
  const request = {
    protocol_version: 1,
    request_id: crypto.randomUUID(),
    url: tab.url,
    title: (tab.title ?? '').slice(0, 512),
    source: 'browser',
    capture_mode: 'article',
    selected_text: '',
    created_at: new Date().toISOString(),
  };
  try {
    const response = await requestViaPort(request);
    if (response?.status === 'accepted') {
      await chrome.action.setBadgeText({ text: 'SAVED' });
      console.info(`queued ${request.request_id} from ${urlOrigin(request.url)}`);
    } else {
      await chrome.action.setBadgeText({ text: 'FAILED' });
      console.warn(`rejected: ${response?.error_code} ${response?.message}`);
    }
  } catch (err) {
    await chrome.action.setBadgeText({ text: 'FAILED' });
    console.error('native messaging failed:', err?.message ?? err);
  }
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
}

chrome.action.onClicked.addListener((tab) => captureTab(tab));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'reverie-save-page',
    title: 'Save page to Reverie',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'reverie-save-page' && tab) captureTab(tab);
});
