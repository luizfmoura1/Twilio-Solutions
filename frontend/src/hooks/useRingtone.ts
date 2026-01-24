import { useRef, useCallback } from 'react';

const RINGTONE_URL = 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3';

export function useRingtone() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(RINGTONE_URL);
      audioRef.current.loop = true;
    }
    audioRef.current.play().catch((err) => {
      console.warn('Failed to play ringtone:', err);
    });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return { play, stop };
}
