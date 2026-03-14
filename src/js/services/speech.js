/**
 * Voice controller keeps all speech-recognition mutable state local to the service
 * and talks to the rest of the app through callbacks.
 */
export function createSpeechController({ micButtons, setStatus, onTranscript }) {
  let recognition = null;
  let speechSupported = false;
  let armedFieldId = null;
  let activeSessionFieldId = null;
  let finalTranscript = "";
  let shouldRestart = false;
  let restartTimeout = null;
  let manuallyStopping = false;

  function updateMicButtonStates() {
    micButtons.forEach(btn => {
      const isArmed = btn.dataset.target === armedFieldId;
      btn.classList.toggle("armed", isArmed);
      btn.setAttribute("aria-pressed", isArmed ? "true" : "false");
      btn.innerHTML = isArmed
        ? `<span aria-hidden="true">■</span> <span class="mic-btn-text">Stop</span>`
        : `<span aria-hidden="true">🎤</span> <span class="mic-btn-text">Voice</span>`;
      btn.title = isArmed ? "Stop voice input" : "Start voice input";
    });
  }

  function clearRestartTimeout() {
    if (restartTimeout) clearTimeout(restartTimeout);
    restartTimeout = null;
  }

  function appendAndClearFinalTranscript() {
    if (activeSessionFieldId && finalTranscript.trim()) {
      onTranscript(activeSessionFieldId, finalTranscript);
      finalTranscript = "";
    }
  }

  function disarmSpeech(updateStatus = true) {
    shouldRestart = false;
    manuallyStopping = true;
    clearRestartTimeout();
    appendAndClearFinalTranscript();
    armedFieldId = null;
    activeSessionFieldId = null;
    updateMicButtonStates();

    if (recognition) {
      try { recognition.stop(); } catch { /* no-op */ }
    }

    if (updateStatus && speechSupported) setStatus("Voice input is ready.");
    setTimeout(() => { manuallyStopping = false; }, 100);
  }

  function startRecognitionSession() {
    if (!recognition || !armedFieldId) return;
    activeSessionFieldId = armedFieldId;
    finalTranscript = "";

    try {
      recognition.start();
    } catch {
      setStatus("Could not start voice input. Trying again…");
      clearRestartTimeout();
      if (shouldRestart && armedFieldId) restartTimeout = setTimeout(startRecognitionSession, 800);
    }
  }

  function setup() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      speechSupported = false;
      micButtons.forEach(btn => {
        btn.disabled = true;
        btn.title = "Speech recognition is not available in this browser.";
      });
      setStatus("Voice input is not available in this browser. The form still works normally.");
      return;
    }

    speechSupported = true;
    recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onstart = () => setStatus(`Listening for "${armedFieldId}". Tap Stop when you are done.`, "active");
    recognition.onresult = event => {
      let interimTranscript = "";
      let confirmedTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) confirmedTranscript += transcript;
        else interimTranscript += transcript;
      }
      if (confirmedTranscript) {
        finalTranscript += ` ${confirmedTranscript}`;
        appendAndClearFinalTranscript();
      }
      const preview = interimTranscript.trim();
      if (preview.length === 0) setStatus(`Listening for "${armedFieldId}". Tap Stop when you are done.`, "active", { announce: false });
    };

    recognition.onerror = event => {
      if (event.error === "not-allowed") {
        shouldRestart = false;
        armedFieldId = null;
        activeSessionFieldId = null;
        updateMicButtonStates();
        setStatus("Microphone access was blocked. You may need to allow microphone permission.");
        return;
      }
      if (event.error === "audio-capture") {
        shouldRestart = false;
        armedFieldId = null;
        activeSessionFieldId = null;
        updateMicButtonStates();
        setStatus("No microphone was available.");
        return;
      }
      if (event.error === "aborted" && manuallyStopping) return;
      if (event.error === "no-speech") {
        setStatus("No speech detected. Still armed and will try again.", "active");
        return;
      }
      setStatus(`Voice input hit an issue (${event.error}). Will retry if still armed.`, "active");
    };

    recognition.onend = () => {
      appendAndClearFinalTranscript();
      const stillArmed = shouldRestart && !!armedFieldId;
      if (stillArmed) {
        setStatus("Listening paused. Restarting.", "active", { announce: false });
        clearRestartTimeout();
        restartTimeout = setTimeout(startRecognitionSession, 350);
      } else {
        activeSessionFieldId = null;
        finalTranscript = "";
        if (!manuallyStopping) setStatus("Voice input stopped.");
      }
    };

    micButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        if (!targetId || !recognition) return;

        if (armedFieldId === targetId) return disarmSpeech(true);

        disarmSpeech(false);
        armedFieldId = targetId;
        shouldRestart = true;
        manuallyStopping = false;
        updateMicButtonStates();
        setStatus(`Armed for "${targetId}". Starting voice input.`, "active");
        clearRestartTimeout();
        restartTimeout = setTimeout(startRecognitionSession, 150);
      });
    });

    updateMicButtonStates();
  }

  return { setup, disarmSpeech };
}
