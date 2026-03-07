import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  theme = "dark",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
  theme?: "dark" | "light";
}) {
  return (
    <div
      className={cn(
        "max-w-2xl space-y-4",
        align === "center" && "mx-auto text-center",
      )}
    >
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
        {eyebrow}
      </p>
      <h2
        className={cn(
          "text-3xl font-semibold tracking-tight sm:text-4xl",
          theme === "light" ? "text-slate-950" : "text-white",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "text-base leading-7 sm:text-lg",
          theme === "light" ? "text-slate-600" : "text-slate-300",
        )}
      >
        {description}
      </p>
    </div>
  );
}
