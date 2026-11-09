"use client";

import { useEffect, useRef } from "react";

/**
 * Large tagline whose words brighten one by one, in reading order, as each crosses a trigger
 * line 40% above the bottom of the viewport. Each word is observed once, then left lit.
 */
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const words = Array.from(root.querySelectorAll<HTMLElement>("[data-word]"));
    let litCount = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // A fast scroll can jump a word straight past the trigger line; treat it as crossed.
          const crossed = entry.isIntersecting || entry.boundingClientRect.top < 0;
          if (!crossed) continue;
          // Light everything up to this word so reading order holds whatever the scroll speed.
          const end = words.indexOf(entry.target as HTMLElement) + 1;
          const start = litCount;
          for (; litCount < end; litCount++) {
            // Words of one line cross together; stagger them so they still light one at a time.
            words[litCount]!.style.transitionDelay = `${Math.min((litCount - start) * 60, 400)}ms`;
            words[litCount]!.setAttribute("data-lit", "");
            io.unobserve(words[litCount]!);
          }
        }
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    words.forEach((word) => io.observe(word));
    return () => io.disconnect();
  }, []);

  return (
    <p
      ref={ref}
      className="max-w-[680px] text-4xl font-semibold tracking-tight text-primary sm:text-5xl"
    >
      {lines.map((line, lineIndex) => (
        <span key={line} className="block">
          {line.split(" ").map((word, wordIndex) => (
            <span
              key={`${lineIndex}-${wordIndex}`}
              data-word=""
              className="tagline-word transition-opacity duration-500"
            >
              {word}{" "}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}
