import { useEffect } from "react";

interface LoaderProps {
  onComplete: () => void;
}

// Preloader removed per design: fire onComplete immediately so the hero is the first paint.
const Loader = ({ onComplete }: LoaderProps) => {
  useEffect(() => {
    onComplete();
  }, [onComplete]);
  return null;
};

export default Loader;
