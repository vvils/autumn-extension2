let recognition = null;

function stopRecognition() {
  if (recognition) {
    recognition.abort();
    recognition = null;
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'start') {
    stopRecognition();

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      chrome.runtime.sendMessage({ type: 'voice_error', error: 'Speech recognition not supported' });
      return;
    }

    recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = message.lang || navigator.language;

    recognition.onresult = event => {
      const result = event.results?.[0]?.[0];
      if (!result?.transcript) {
        chrome.runtime.sendMessage({ type: 'voice_error', error: 'No speech detected' });
        return;
      }
      chrome.runtime.sendMessage({ type: 'voice_result', transcript: result.transcript });
    };

    recognition.onerror = event => {
      if (event.error !== 'aborted') {
        chrome.runtime.sendMessage({ type: 'voice_error', error: event.error });
      }
    };

    recognition.onend = () => {
      recognition = null;
      chrome.runtime.sendMessage({ type: 'voice_end' });
    };

    try {
      recognition.start();
    } catch (err) {
      const errorType =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'not-allowed'
          : err.message || 'Failed to start recognition';
      chrome.runtime.sendMessage({ type: 'voice_error', error: errorType });
    }
  } else if (message.action === 'stop') {
    stopRecognition();
  }
});
