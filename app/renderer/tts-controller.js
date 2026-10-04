/**
 * TtsController (M8 §13/§43/§44): speech queue + state machine on top of an
 * injected provider. DOM-free — exercised directly by node tests with a
 * fake provider, exactly like reader-anchor.js.
 *
 * State machine: idle → preparing → speaking ⇄ paused → stopping → idle,
 * speaking → error → idle. Every control operation bumps a generation
 * counter; stale provider callbacks are discarded (M8 §39).
 *
 * Pause is SEGMENT-LEVEL (cancel current utterance, remember the cursor,
 * resume replays the segment): engine pause APIs proved unreliable on
 * Windows (M8-EXPLORE §1) and sentence granularity is the documented
 * smallest reliable unit (M8 §9).
 *
 * Modes: 'document' follows the reading position (view may scroll, progress
 * may advance through the reader's own scroll persistence); 'selection' is a
 * one-shot queue that must not touch progress (M8 §25) — enforcement lives in
 * the wiring (no scroll callbacks in selection mode), the controller is mode-agnostic.
 */
(function (rootFactory) {
  const api = rootFactory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.Tts = api;
})(function () {
  function detectLang(text) {
    // character-range heuristic (M8 §24): a hint for voice selection only
    let cjk = 0, kana = 0, hangul = 0, latin = 0;
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) cjk++;
      else if (c >= 0x3040 && c <= 0x30ff) kana++;
      else if (c >= 0xac00 && c <= 0xd7af) hangul++;
      else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
    }
    if (kana > 0) return 'ja';
    if (hangul > 0) return 'ko';
    if (cjk > 0) return 'zh';
    if (latin > 0) return 'en';
    return null;
  }

  /**
   * @param {object} deps
   *   provider      — { getVoices(), speak(text, opts, onDone, onStart), cancel() }
   *   getSegmentText(segment) → string
   *   onSegment(segment | null) — fires when a segment starts / queue empties
   *   onState(state) — 'idle' | 'preparing' | 'speaking' | 'paused' | 'stopping'
   *   onNotice(kind) — 'no-voice-match' | 'no-voices' | 'provider-error' | 'completed'
   */
  function createTtsController({ provider, getSegmentText, onSegment = () => {}, onState = () => {}, onNotice = () => {} }) {
    let state = 'idle';
    let generation = 0;
    let segments = [];
    let cursor = 0;
    let mode = 'document';
    let rate = 1.0;
    let voiceId = null;   // user preference; null = auto by language
    let voices = [];

    const setState = (s) => { if (state !== s) { state = s; onState(s); } };

    const resolveVoice = (text) => {
      if (!voices.length) {
        onNotice('no-voices');
        return { voiceId: null, lang: null, matched: false };
      }
      const lang = detectLang(text);
      if (voiceId) {
        const chosen = voices.find((v) => v.voiceId === voiceId);
        if (chosen) {
          const matched = !lang || (chosen.lang || '').toLowerCase().startsWith(lang);
          return { voiceId: chosen.voiceId, lang: chosen.lang, matched };
        }
      }
      if (!lang) return { voiceId: null, lang: null, matched: true };
      const hit = voices.find((v) => (v.lang || '').toLowerCase().startsWith(lang))
        ?? voices.find((v) => (v.lang || '').toLowerCase().startsWith(lang.split('-')[0]));
      if (hit) return { voiceId: hit.voiceId, lang: hit.lang, matched: true };
      onNotice('no-voice-match'); // §23: never silently read CJK with a mismatched voice
      return { voiceId: null, lang: lang + '-', matched: false };
    };

    function speakCurrent(gen) {
      if (gen !== generation || state === 'stopping' || state === 'paused') return;
      while (cursor < segments.length) {
        const segment = segments[cursor];
        const raw = getSegmentText(segment);
        const text = raw ? raw.replace(/\s+/g, ' ').trim() : '';
        if (text.length > 0) {
          const { voiceId: vId, lang, matched } = resolveVoice(text);
          setState('speaking');
          onSegment(segment);
          provider.speak(
            text,
            { voiceId: vId, lang: matched ? lang : null, rate },
            (reason) => {
              if (gen !== generation) return; // stale callback (M8 §39)
              if (reason === 'ended') {
                cursor += 1;
                if (cursor < segments.length) speakCurrent(gen);
                else finishQueue();
              } else if (reason instanceof Error) {
                onNotice('provider-error');
                setState('idle');
                onSegment(null);
              }
              // 'cancelled' → pause/stop/next/replace already owns the state
            },
            () => { /* onStart: state already 'speaking' */ },
          );
          return;
        }
        cursor += 1; // empty segment: skip
      }
      finishQueue();
    }

    function finishQueue() {
      cursor = 0;
      segments = [];
      setState('idle');
      onSegment(null);
      onNotice('completed');
    }

    function stopPlayback() {
      generation += 1;
      setState('stopping');
      provider.cancel();
      setState('idle');
      onSegment(null);
    }

    return {
      refreshVoices() { voices = provider.getVoices?.() ?? []; return voices; },
      getVoices() { return voices; },
      getState() { return state; },
      getCursor() { return cursor; },
      getMode() { return mode; },
      getRate() { return rate; },
      getVoiceId() { return voiceId; },

      /** Load a document queue (replaces anything playing). */
      load(newSegments, { mode: m = 'document' } = {}) {
        stopPlayback();
        segments = Array.isArray(newSegments) ? newSegments : [];
        cursor = 0;
        mode = m;
      },

      /** Start playing at (or from) a segment index. */
      play(fromIndex = 0) {
        stopPlayback();
        if (segments.length === 0) return;
        const gen = ++generation;
        cursor = Math.max(0, Math.min(fromIndex, segments.length - 1));
        setState('preparing');
        speakCurrent(gen);
      },

      /** Segment-level pause: cancel the utterance, keep the cursor. */
      pause() {
        if (state !== 'speaking' && state !== 'preparing') return;
        generation += 1;
        provider.cancel();
        setState('paused');
      },

      /** Replay the current segment and continue. */
      resume() {
        if (state !== 'paused') return;
        this.play(cursor);
      },

      stop() {
        // stops playback but KEEPS the document queue: prev/next browsing
        // remains available after stop; load()/document switch clears it
        if (state === 'idle') return;
        stopPlayback();
      },

      next() {
        if (segments.length === 0) return;
        if (state === 'speaking' || state === 'preparing' || state === 'paused') {
          if (cursor + 1 >= segments.length) { this.stop(); onNotice('completed'); return; }
          this.play(cursor + 1);
        } else {
          // idle browsing: move the cursor, don't start speaking
          cursor = Math.min(segments.length - 1, cursor + 1);
          onSegment(segments[cursor]);
        }
      },

      previous() {
        if (segments.length === 0) return;
        if (state === 'speaking' || state === 'preparing' || state === 'paused') {
          this.play(Math.max(0, cursor - 1));
        } else {
          cursor = Math.max(0, cursor - 1);
          onSegment(segments[cursor]);
        }
      },

      /** Applies to the NEXT utterance; the current one finishes untouched. */
      setRate(r) { rate = Math.min(2, Math.max(0.75, Number(r) || 1)); },
      setVoice(id) { voiceId = id || null; },
    };
  }

  return { createTtsController, detectLang };
});
