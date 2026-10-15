"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { RATING_MAX, ratingLabel, starFill } from "@/lib/reviews";

/**
 * A rating, as marks rather than as a number.
 *
 * Partial stars are drawn by clipping a filled copy of the row against an
 * unlit one, per star, instead of by reaching for a half-star glyph or an SVG
 * gradient: 4.6 should fill four marks and 60% of the fifth, and a glyph-based
 * approach can only ever show a half. The row carries the accessible label, so
 * a screen reader hears "4.6 out of 5 stars" once rather than a row of icons.
 */

const SIZE_CLASS = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
} as const;

export type StarSize = keyof typeof SIZE_CLASS;

const MARKS = Array.from({ length: RATING_MAX }, (_, index) => index);

export function StarRating({
  value,
  size = "sm",
  className,
  label,
}: {
  value: number;
  size?: StarSize;
  className?: string;
  /** Replaces the generated label, for a caller with a better sentence. */
  label?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label ?? ratingLabel(value)}
      className={cn("inline-flex items-center gap-[3px]", className)}
    >
      {MARKS.map((index) => (
        <span key={index} className="relative inline-flex">
          <Star
            aria-hidden
            strokeWidth={1.75}
            className={cn(SIZE_CLASS[size], "text-muted-foreground/40")}
          />
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${starFill(value, index) * 100}%` }}
          >
            <Star
              strokeWidth={1.75}
              className={cn(SIZE_CLASS[size], "fill-rating text-rating")}
            />
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * The write-side control: five clickable marks over a real radio group.
 *
 * Radios, not buttons, because the keyboard behaviour a radiogroup is supposed
 * to have (arrow keys move and select, Tab moves past the whole group as one
 * stop) comes free with them and has to be hand-written otherwise. Each radio
 * is visually hidden and its `<label>` is the star, so the click target, the
 * focus ring and the accessible name all live in the same place.
 */
export function RatingInput({
  value,
  onChange,
  disabled = false,
  name = "course-rating",
  className,
}: {
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
  name?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Your rating"
      className={cn("inline-flex items-center gap-1", className)}
    >
      {MARKS.map((index) => {
        const rating = index + 1;
        return (
          <label
            key={rating}
            className={cn(
              "group/star cursor-pointer rounded-sm p-0.5",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              disabled={disabled}
              onChange={() => onChange(rating)}
              className="peer sr-only"
            />
            <Star
              aria-hidden
              strokeWidth={1.75}
              className={cn(
                "h-7 w-7 transition-colors",
                "text-muted-foreground/40",
                // Hovering a mark lights that mark, as a preview of the click.
                // Gated on the prop rather than on `:disabled`, because the
                // input is the disabled element and the star is not.
                !disabled &&
                  "group-hover/star:fill-rating/45 group-hover/star:text-rating",
                "peer-checked:fill-rating peer-checked:text-rating",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
              )}
            />
            <span className="sr-only">{ratingLabel(rating)}</span>
          </label>
        );
      })}
    </div>
  );
}
