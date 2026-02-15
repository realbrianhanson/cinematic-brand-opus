import { useRef, useCallback } from "react";

interface MagneticButtonProps {
  children: React.ReactNode;
  href: string;
  className?: string;
  style?: React.CSSProperties;
  target?: string;
}

const MagneticButton = ({ children, href, className, style, target }: MagneticButtonProps) => {
  const ref = useRef<HTMLAnchorElement>(null);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current || window.innerWidth < 1024) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) * 0.25;
    const dy = (e.clientY - cy) * 0.25;
    ref.current.style.transform = `translate(${dx}px, ${dy}px)`;
  }, []);

  const onLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.transition = "transform 0.5s cubic-bezier(0.22,1,0.36,1)";
    ref.current.style.transform = "translate(0,0)";
    setTimeout(() => {
      if (ref.current) ref.current.style.transition = "";
    }, 500);
  }, []);

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      className={className}
      style={{ ...style, willChange: "transform", display: "inline-flex" }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      data-hover
    >
      {children}
    </a>
  );
};

export default MagneticButton;
