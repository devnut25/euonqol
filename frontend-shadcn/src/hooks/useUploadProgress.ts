import { useRef, useState } from 'react';

/**
 * Simulated upload progress bar: eases from 0 to 90% while the request is in
 * flight (real progress isn't observable for a JSON/base64 body), then jumps
 * to 100% via `succeed()` once the request actually resolves. `finish()` must
 * run in a `finally` — it only resets `isUploading` when `succeed()` was never
 * called, so a failed request doesn't leave the bar stuck mid-way.
 */
export function useUploadProgress() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const succeededRef = useRef(false);

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = () => {
    setUploadProgress(0);
    succeededRef.current = false;
    setIsUploading(true);
    intervalRef.current = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clear();
          return prev; // never decrease — just hold at current value
        }
        // Exponential ease-out: fast at start, slows near the cap
        const increment = Math.max(0.3, (90 - prev) * 0.07);
        return Math.min(prev + increment, 90);
      });
    }, 300);
  };

  const succeed = () => {
    clear();
    succeededRef.current = true;
    setUploadProgress(100);
  };

  const finish = () => {
    clear();
    if (!succeededRef.current) setIsUploading(false);
  };

  return { uploadProgress, isUploading, start, succeed, finish };
}
