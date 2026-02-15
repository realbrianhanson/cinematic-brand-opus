import { useEffect, useRef, useState } from "react";

interface DrawLineProps {
  visible: boolean;
  d: string;
  className?: string;
}

const DrawLine = ({ visible, d, className }: DrawLineProps) => {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) {
      setLength(pathRef.current.getTotalLength());
    }
  }, [d]);

  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" preserveAspectRatio="none">
      <path
        ref={pathRef}
        d={d}
        stroke="#D4AF55"
        strokeWidth={0.5}
        opacity={0.2}
        strokeDasharray={length}
        strokeDashoffset={visible ? 0 : length}
        style={{
          transition: "stroke-dashoffset 2.5s cubic-bezier(0.22,1,0.36,1)",
        }}
      />
    </svg>
  );
};

export default DrawLine;
