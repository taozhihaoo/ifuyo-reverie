/**
 * Reverie Capture — MV3 service worker (M1 protocol v1).
 * Sends a CaptureRequest to the Reverie Capture Host via Native Messaging;
 * the Host only enqueues (fast), so the badge means "queued", and the final
 * result is visible inside the Reverie app.
 */
const HOST_NAME = 'com.reverie.capture_host';

function urlOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparsable)';
  }
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
    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, request);
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
