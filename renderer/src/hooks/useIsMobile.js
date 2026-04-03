import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

export default function useIsMobile() {
  const [state, setState] = useState(() => ({
    isMobile: window.innerWidth < MOBILE_BREAKPOINT,
    isLandscape: window.innerWidth > window.innerHeight,
  }));

  useEffect(() => {
    const update = () => {
      setState({
        isMobile: window.innerWidth < MOBILE_BREAKPOINT,
        isLandscape: window.innerWidth > window.innerHeight,
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", () => setTimeout(update, 100));
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}
