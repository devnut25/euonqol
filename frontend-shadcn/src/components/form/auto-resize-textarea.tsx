import { cn } from '@/lib/tailwind/utils';
import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

/**
 * Textarea whose height follows its content, so long texts stay fully readable while
 * editing (no inner scroll). `rows` acts as the minimum height.
 */
export function AutoResizeTextarea({ ref, className, value, ...props }: ComponentProps<'textarea'>) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Forward the element both to the caller (e.g. RHF field.ref) and to the resize logic
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  useLayoutEffect(resize, [value, resize]);

  // Width changes (rotation, drawer resize) change line wrapping, hence the needed height
  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastWidth = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === lastWidth) return;
      lastWidth = el.offsetWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <textarea
      ref={setRef}
      value={value}
      className={cn('resize-none overflow-hidden', className)}
      {...props}
    />
  );
}
