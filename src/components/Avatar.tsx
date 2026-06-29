import { Crown } from "@phosphor-icons/react";
import type { AccentKey, AvatarId } from "../core/index.ts";
import { AVATAR_SVGS } from "../assets/avatars/index.ts";

/*
  A person's avatar: the allocated fruit glyph centered on their accent-color
  circle, with an optional crown overlay for the payer (spec §6 / design system).
*/

// Static map so Tailwind's scanner sees each class literally.
const ACCENT_BG: Record<AccentKey, string> = {
  orange: "bg-accent-orange",
  blue: "bg-accent-blue",
  green: "bg-accent-green",
  teal: "bg-accent-teal",
  gold: "bg-accent-gold",
  purple: "bg-accent-purple",
};

interface AvatarProps {
  avatar: string;
  color: string;
  isPayer?: boolean;
  size?: number;
  className?: string;
}

export function Avatar({
  avatar,
  color,
  isPayer = false,
  size = 48,
  className = "",
}: AvatarProps) {
  const bg = ACCENT_BG[color as AccentKey] ?? "bg-surface-2";
  const src = AVATAR_SVGS[avatar as AvatarId];

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <div className={`grid h-full w-full place-items-center rounded-full ${bg}`}>
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ width: size * 0.62, height: size * 0.62 }}
          />
        ) : null}
      </div>
      {isPayer ? (
        <Crown
          weight="fill"
          size={size * 0.46}
          className="absolute -top-2 left-1/2 -translate-x-1/2 -rotate-12 text-accent-gold drop-shadow"
          aria-label="Payer"
        />
      ) : null}
    </div>
  );
}
