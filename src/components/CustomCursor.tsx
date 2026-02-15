import { useEffect, useRef } from "react";

const CustomCursor = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const hovering = useRef(false);

  useEffect(() => {
    // Skip on touch devices
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const mq = window.matchMedia("(min-width: 1024px)");
    if (!mq.matches) return;

    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, [data-hover]")) hovering.current = true;
    };
    const onOut = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("a, button, [data-hover]")) hovering.current = false;
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

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none hidden lg:block"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#D4AF55",
          zIndex: 9999,
        }}
      />
      <div
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none hidden lg:block"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid #D4AF55",
          opacity: 0.35,
          zIndex: 9998,
          transition: "opacity 0.2s, transform 0.15s",
          willChange: "transform, opacity",
        }}
      />
    </>
  );
};

export default CustomCursor;
