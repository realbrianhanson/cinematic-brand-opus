import { useEffect, useRef, useState } from "react";

const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";

interface TextScrambleProps {
  text: string;
  trigger: boolean;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

const TextScramble = ({ text, trigger, delay = 0, className, style }: TextScrambleProps) => {
  const [display, setDisplay] = useState("");
  const frameRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!trigger) return;

    timeoutRef.current = setTimeout(() => {
      frameRef.current = 0;
      const totalFrames = Math.ceil(text.length * 1.5);

      intervalRef.current = setInterval(() => {
        frameRef.current++;
        const progress = Math.min(frameRef.current / totalFrames, 1);
        const revealCount = Math.floor(progress * text.length);

        let result = "";
        for (let i = 0; i < text.length; i++) {
          if (text[i] === " ") {
            result += " ";
          } else if (i < revealCount) {
            result += text[i];
          } else if (i < revealCount + 4) {
            result += glyphs[Math.floor(Math.random() * glyphs.length)];
          } else {
            result += " ";
          }
        }
        setDisplay(result);

        if (revealCount >= text.length) {
          clearInterval(intervalRef.current);
        }
      }, 30);
    }, delay);

    return () => {
      clearTimeout(timeoutRef.current);
      clearInterval(intervalRef.current);
    };
  }, [trigger, text, delay]);

  return (
    <span className={className} style={style}>
      {trigger ? (display || text.replace(/./g, " ")) : ""}
    </span>
  );
};

export default TextScramble;
