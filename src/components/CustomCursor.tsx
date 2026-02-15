import { useEffect, useRef } from "react";

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

const CustomCursor = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const hovering = useRef(false);
  const trail = useRef<TrailPoint[]>([]);

  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    const resize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };
    const onOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a, button, [data-hover]")) hovering.current = true;
    };
    const onOut = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a, button, [data-hover]")) hovering.current = false;
    };

    window.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);

    let raf: number;
    const loop = () => {
      const lerpF = 0.12;
      ringPos.current.x += (mouse.current.x - ringPos.current.x) * lerpF;
      ringPos.current.y += (mouse.current.y - ringPos.current.y) * lerpF;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mouse.current.x - 4}px, ${mouse.current.y - 4}px)`;
      }
      if (ringRef.current) {
        const scale = hovering.current ? 2.2 : 1;
        const opacity = hovering.current ? 0.6 : 0.35;
        ringRef.current.style.transform = `translate(${ringPos.current.x - 20}px, ${ringPos.current.y - 20}px) scale(${scale})`;
        ringRef.current.style.opacity = String(opacity);
      }

      // Trail
      trail.current.push({ x: mouse.current.x, y: mouse.current.y, alpha: 0.4 });
      if (trail.current.length > 25) trail.current.shift();

      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const len = trail.current.length;
        for (let i = trail.current.length - 1; i >= 0; i--) {
          const p = trail.current[i];
          p.alpha *= 0.9;
          if (p.alpha < 0.01) {
            trail.current.splice(i, 1);
            continue;
          }
          const r = ((i + 1) / len) * 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212,175,85,${p.alpha * 0.5})`;
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none hidden lg:block"
        style={{ zIndex: 9997 }}
      />
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none hidden lg:block"
        style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4AF55", zIndex: 9999 }}
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none hidden lg:block"
        style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #D4AF55", opacity: 0.35, zIndex: 9998, transition: "opacity 0.2s, transform 0.15s", willChange: "transform, opacity" }}
      />
    </>
  );
};

export default CustomCursor;
