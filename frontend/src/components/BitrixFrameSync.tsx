import { useEffect } from 'react';

export function BitrixFrameSync() {
  useEffect(() => {
    if (window.self === window.top || !window.BX24) return;

    document.documentElement.classList.add('bitrix-embedded');
    let observer: ResizeObserver | undefined;
    let resizeTimer: number | undefined;

    window.BX24.init(() => {
      window.BX24?.setTitle?.('FortaDocs');

      const fitFrame = () => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => window.BX24?.fitWindow(), 80);
      };

      observer = new ResizeObserver(fitFrame);
      observer.observe(document.body);
      fitFrame();
    });

    return () => {
      observer?.disconnect();
      window.clearTimeout(resizeTimer);
      document.documentElement.classList.remove('bitrix-embedded');
    };
  }, []);

  return null;
}
