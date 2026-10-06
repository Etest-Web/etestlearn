"use client";

import TextLoop from "@/components/TextLoop";

export function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center overflow-hidden blur"
    >
      {/* w-full rather than min-w-screen: 100vw counts the scrollbar and
          would hand the parent ~15px of over-wide canvas to clip. */}
      <div className="flex min-h-screen w-full flex-col justify-between">
        <TextLoop
          text="Glypha"
          shape="wave"
          speed={55}
          path=""
          direction="forward"
          separator="✦"
          curviness={48}
          fontSize={46}
          fontWeight={800}
          letterSpacing={8}
          uppercase
          color="#ffffff"
          ribbon
          ribbonColor="#3f3f3f"
          ribbonWidth={86}
          className="hidden sm:block"
          pauseOnHover={false}
        />
        <TextLoop
          text="Glypha"
          shape="wave"
          speed={55}
          path=""
          direction="forward"
          separator="✦"
          curviness={48}
          fontSize={46}
          fontWeight={800}
          letterSpacing={8}
          uppercase
          color="#ffffff"
          ribbon
          ribbonColor="#3f3f3f"
          ribbonWidth={86}
          className="hidden sm:block"
          pauseOnHover={false}
        />
      </div>
    </div>
  );
}
