/**
 * Reverie Capture Spike — MV3 service worker.
 * Sends a CaptureRequest (protocol v1) to the Reverie Capture Host via
 * Native Messaging, then shows the verdict as a badge.
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
  const request = {
    protocol_version: 1,
    request_id: crypto.randomUUID(),
    url: tab.url ?? '',
    title: (tab.title ?? '').slice(0, 512),
    selected_text: '',
    timestamp: new Date().toISOString(),
  };
  try {
    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, request);
    if (response?.accepted) {
      await chrome.action.setBadgeText({ text: 'OK' });
      console.info(`queued ${request.request_id} from ${urlOrigin(request.url)}`);
    } else {
      await chrome.action.setBadgeText({ text: 'ERR' });
      console.warn(`rejected: ${response?.error_code} ${response?.message}`);
    }
  } catch (err) {
    await chrome.action.setBadgeText({ text: 'ERR' });
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
