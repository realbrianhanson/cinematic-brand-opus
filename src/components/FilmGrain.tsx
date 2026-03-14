import { useEffect, useRef, useState } from "react";

const FilmGrain = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (isMobile) return; // skip on mobile for performance

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;
    let prevScrollY = window.scrollY;
    let velocity = 0;

    const resize = () => {
      w = Math.ceil(window.innerWidth / 2);
      h = Math.ceil(window.innerHeight / 2);
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener("resize", resize);

    let raf: number;
    const loop = () => {
      const currentScrollY = window.scrollY;
      velocity = Math.abs(currentScrollY - prevScrollY);
      prevScrollY = currentScrollY;

      const imageData = ctx.createImageData(w, h);
      const data = imageData.data;
      const alpha = 12 + Math.min(velocity * 0.3, 15);

      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = alpha;
      }

      ctx.putImageData(imageData, 0, 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [isMobile]);

  if (isMobile) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[1] pointer-events-none"
      style={{
        width: "100%",
        height: "100%",
        opacity: 0.6,
        imageRendering: "pixelated",
      }}
    />
  );
};

export default FilmGrain;
