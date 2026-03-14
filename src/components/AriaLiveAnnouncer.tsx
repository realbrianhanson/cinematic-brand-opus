import { createContext, useCallback, useContext, useRef, useState } from "react";

interface AnnouncerContextType {
  announce: (message: string, priority?: "polite" | "assertive") => void;
}

const AnnouncerContext = createContext<AnnouncerContextType>({
  announce: () => {},
});

export const useAnnounce = () => useContext(AnnouncerContext);

export const AriaLiveAnnouncer = ({ children }: { children: React.ReactNode }) => {
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback((message: string, priority: "polite" | "assertive" = "polite") => {
    // Clear then set to force re-announcement of identical messages
    if (priority === "assertive") {
      setAssertiveMessage("");
    } else {
      setPoliteMessage("");
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (priority === "assertive") {
        setAssertiveMessage(message);
      } else {
        setPoliteMessage(message);
      }
    }, 50);
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
      >
        {politeMessage}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
};
