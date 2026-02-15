interface SpringTextProps {
  text: string;
  visible: boolean;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  charStyle?: React.CSSProperties;
}

const SpringText = ({ text, visible, delay = 0, className, style, charStyle }: SpringTextProps) => {
  return (
    <span className={className} style={{ ...style, display: "inline-block" }}>
      {text.split("").map((char, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: visible ? 1 : 0,
            transform: visible
              ? "translateY(0) rotateX(0)"
              : "translateY(80px) rotateX(-40deg)",
            transition: `all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay + i * 0.025}s`,
            transformOrigin: "bottom center",
            ...charStyle,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </span>
  );
};

export default SpringText;
