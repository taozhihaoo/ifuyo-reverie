/**
 * Web Speech TTS provider (M8) — the ONLY renderer file allowed to touch
 * window.speechSynthesis. Local Windows voices via Chromium's SAPI bridge;
 * no network, no third-party packages (M8 §3.1/§12).
 *
 * PoC-established behaviors this provider normalizes for the controller:
 *   - cancel() fires onerror('interrupted'), NOT onend → reported as 'cancelled';
 *   - speechSynthesis.paused flag is unreliable → the controller owns state;
 *   - pause/resume of the ENGINE is not used: the controller implements
 *     segment-level pause (cancel + replay current segment), which is
 *     deterministic across Windows versions.
 */
export class WebSpeechProvider {
  constructor() {
    this.utterance = null;
    this.handlers = null;
  }

  available() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** TtsVoice[]: { voiceId, displayName, lang, isDefault } */
  getVoices() {
    if (!this.available()) return [];
    return window.speechSynthesis.getVoices().map((v) => ({
      voiceId: v.voiceURI || v.name,
      displayName: v.name,
      lang: v.lang || '',
      isDefault: Boolean(v.default),
    }));
  }

  /** Chromium loads voices asynchronously — cb fires when the list changes. */
  onVoicesChanged(cb) {
    if (!this.available()) return;
    try { window.speechSynthesis.onvoiceschanged = () => cb(); } catch { /* optional */ }
  }

  /**
   * Speak one text. onDone(reason) fires exactly once with
   * 'ended' | 'cancelled' | Error.
   */
  speak(text, { voiceId = null, lang = null, rate = 1.0, volume = 1.0 } = {}, onDone, onStart) {
    if (!this.available()) {
      onDone(new Error('speech synthesis unavailable'));
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    const voice = voiceId
      ? voices.find((v) => (v.voiceURI || v.name) === voiceId) ?? null
      : null;
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    if (!voice && lang) u.lang = lang;
    u.rate = Math.min(10, Math.max(0.1, rate));
    u.volume = volume;
    let settled = false;
    const finish = (reason) => {
      if (settled) return;
      settled = true;
      this.utterance = null;
      this.handlers = null;
      onDone(reason);
    };
    this.utterance = u;
    this.handlers = finish;
    u.onstart = () => { if (!settled) onStart?.(); };
    u.onend = () => finish('ended');
    u.onerror = (e) => {
      // 'interrupted' / 'canceled' are how this engine reports cancel()
      finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancelled' : new Error('speech error: ' + e.error));
    };
    window.speechSynthesis.speak(u);
  }

  /** Cancel current speech. The pending utterance settles as 'cancelled'. */
  cancel() {
    if (!this.available()) return;
    try { window.speechSynthesis.cancel(); } catch { /* engine already idle */ }
    // some engines never deliver the callback after cancel — belt and braces
    const handlers = this.handlers;
    if (handlers) {
      setTimeout(() => {
        if (this.handlers === handlers) {
          this.utterance = null;
          this.handlers = null;
          handlers('cancelled');
        }
      }, 250);
    }
  }

  /** Shutdown hint for app exit (best effort; window teardown also stops audio). */
  dispose() {
    this.cancel();
  }
}
