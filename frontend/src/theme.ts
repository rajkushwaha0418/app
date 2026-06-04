// Swiss / Brutalist palette for the ID Card Scanner.
// Sharp corners, monochrome dominance, Klein-blue primary accent.

export const colors = {
  bg: "#FFFFFF",
  bgAlt: "#F3F4F6",
  surface: "#FAFAFA",
  border: "#E5E7EB",
  borderStrong: "#0A0A0A",
  text: "#0A0A0A",
  textMuted: "#4B5563",
  textDim: "#9CA3AF",
  primary: "#002FA7", // Klein Blue
  primaryText: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  cameraOverlay: "rgba(0,0,0,0.85)",
} as const;

export const radius = { none: 0, sm: 2, md: 4 } as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontFamily = {
  body: undefined, // IBM Plex / system fallback — we use weight & tracking for SWS feel
  mono: "Menlo",
} as const;

export const labelStyle = {
  fontSize: 11,
  letterSpacing: 2,
  fontWeight: "600" as const,
  color: colors.textMuted,
  textTransform: "uppercase" as const,
};
