import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal surface of the (non-standard) Web Speech API — lib.dom has no types for it.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const speechRecognitionConstructor = (): SpeechRecognitionConstructor | undefined => {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export interface UseVoiceDictationResult {
  isSupported: boolean;
  isListening: boolean;
  toggleListening: () => void;
}

/**
 * Push-to-talk dictation over the Web Speech API. While listening, each final
 * transcript is handed to `onTranscript` (the caller types it into the agent
 * PTY). Recognition ends on its own after silence — `isListening` follows the
 * engine's actual state, not just the toggle.
 */
export const useVoiceDictation = (onTranscript: (text: string) => void): UseVoiceDictationResult => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Ref so the recognition callbacks always see the latest handler without
  // tearing down the engine when the caller re-renders.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const isSupported = speechRecognitionConstructor() !== undefined;

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const toggleListening = useCallback((): void => {
    const active = recognitionRef.current;
    if (active) {
      active.abort();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const Recognition = speechRecognitionConstructor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) onTranscriptRef.current(result[0].transcript);
      }
    };
    // Fires both after silence timeouts and on errors — either way we're no
    // longer capturing, so reflect that in the UI.
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  }, []);

  return { isSupported, isListening, toggleListening };
};
