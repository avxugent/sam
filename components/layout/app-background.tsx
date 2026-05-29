"use client";

// Diagonal repeating "TESTING" watermark rendered as an inline SVG data-URL.
// Using a pattern tile of 360×200 rotated -40° so the text runs diagonally.
const TESTING_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">` +
    `<text x="180" y="120" font-size="52" font-weight="900" font-family="Arial,sans-serif" ` +
    `fill="rgba(220,0,0,0.13)" text-anchor="middle" transform="rotate(-40,180,100)">TESTING</text>` +
    `</svg>`
);

const PRESETS: Record<string, React.CSSProperties> = {
  "preset:testing": {
    backgroundImage: `url("data:image/svg+xml;utf8,${TESTING_SVG}")`,
    backgroundRepeat: "repeat",
    backgroundSize: "360px 200px",
  },
};

export function AppBackground({
  backgroundMode,
}: {
  backgroundMode: string;
}) {
  if (!backgroundMode) return null;

  const isCustom = backgroundMode === "custom";
  const presetStyle = PRESETS[backgroundMode];

  if (!isCustom && !presetStyle) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 95,
        ...(isCustom
          ? {
              backgroundImage: "url('/api/branding/background')",
              backgroundRepeat: "repeat",
              backgroundSize: "auto",
              backgroundPosition: "center",
            }
          : presetStyle),
      }}
    />
  );
}
