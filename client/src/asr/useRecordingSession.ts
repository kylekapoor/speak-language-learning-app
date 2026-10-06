import { useCallback, useEffect, useReducer, useRef } from "react";
import { preloadSampleAudio } from "../audio/mockMicrophone.ts";
import { RecordingController } from "./recordingController.ts";
import { initialSessionState, sessionReducer } from "./sessionState.ts";

/** Recording state for a lesson, plus the actions the Record button needs. */
export function useRecordingSession(lessonId: string) {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const controller = useRef<RecordingController | null>(null);

  useEffect(() => {
    const instance = new RecordingController(lessonId, dispatch);
    controller.current = instance;
    preloadSampleAudio();
    return () => instance.dispose();
  }, [lessonId]);

  const start = useCallback(() => void controller.current?.start(), []);
  const stop = useCallback(() => controller.current?.stop(), []);

  return { state, start, stop };
}
