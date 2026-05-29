import Image from "next/image";
import Link from "next/link";

import { APP_LOGO_ALT, APP_LOGO_SRC } from "@/lib/brand/logo";
import { cn } from "@/lib/utils";

const SIZE_PX = {
  sm: 32,
  md: 40,
  lg: 48,
} as const;

type AppLogoSize = keyof typeof SIZE_PX;

type AppLogoProps = {
  size?: AppLogoSize;
  href?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function AppLogo({
  size = "md",
  href,
  className,
  imageClassName,
  priority = false,
}: AppLogoProps) {
  const px = SIZE_PX[size];
  const image = (
    <Image
      src={APP_LOGO_SRC}
      alt={APP_LOGO_ALT}
      width={px}
      height={px}
      priority={priority}
      className={cn("h-full w-full object-contain", imageClassName)}
    />
  );

  const box = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        size === "sm" && "h-8 w-8",
        size === "md" && "h-10 w-10",
        size === "lg" && "h-12 w-12",
        className,
      )}
    >
      {image}
    </span>
  );

  if (!href) {
    return box;
  }

  return (
    <Link href={href} className="inline-flex shrink-0">
      {box}
    </Link>
  );
}
