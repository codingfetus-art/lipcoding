"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

export function useVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);

  // Refs — survives React re-renders, shared across closures
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const accumulatedRef = useRef("");
  const shouldStopRef = useRef(false);
  const resolveRef = useRef<((v: string) => void) | null>(null);
  const rejectRef = useRef<((e: Error) => void) | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, []);

  const doOneSession = useCallback(() => {
    if (shouldStopRef.current) {
      setIsListening(false);
      resolveRef.current?.(accumulatedRef.current);
      resolveRef.current = null;
      return;
    }

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let sessionFinal = "";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          sessionFinal += e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setTranscript(accumulatedRef.current + sessionFinal + interim);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setIsListening(false);
        rejectRef.current?.(new Error(`음성 오류: ${e.error}`));
        rejectRef.current = null;
      }
    };

    recognition.onend = () => {
      accumulatedRef.current += sessionFinal;
      setTranscript(accumulatedRef.current);
      recognitionRef.current = null;

      if (shouldStopRef.current) {
        setIsListening(false);
        resolveRef.current?.(accumulatedRef.current);
        resolveRef.current = null;
      } else {
        setTimeout(doOneSession, 50);
      }
    };

    recognition.start();
  }, []);

  const startListening = useCallback((): Promise<string> => {
    // 새 세션 시작 시 상태 초기화
    accumulatedRef.current = "";
    shouldStopRef.current = false;
    setTranscript("");
    setIsListening(true);

    return new Promise((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      doOneSession();
    });
  }, [doOneSession]);

  const stopListening = useCallback(() => {
    shouldStopRef.current = true;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else {
      // 세션 전환 중 stop 호출 시 즉시 resolve
      setIsListening(false);
      resolveRef.current?.(accumulatedRef.current);
      resolveRef.current = null;
    }
  }, []);

  return { isListening, transcript, supported, startListening, stopListening, speak };
}

