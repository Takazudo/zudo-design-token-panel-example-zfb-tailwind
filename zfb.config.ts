import { defineConfig } from "@takazudo/zfb/config";
export default defineConfig({
  base: "/",
  collections: [{ name: "prose", path: "content/prose" }],
  markdown: { gfm: { strikethrough: true, table: true } },
  plugins: [{ name: "./plugins/dev-apply-proxy.mjs" }],
  wind: {
    spec: 1,
    reset: "owned-v1",
    defaultTransitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)", // Tailwind 4 default
    tokens: {
      spacingUnit: "0.25rem",                // w-16 / h-16 swatches
      colors: { primary: "var(--zfbtw-color-primary)", accent: "var(--zfbtw-color-accent)",
        surface: "var(--zfbtw-color-surface)", muted: "var(--zfbtw-color-muted)",
        success: "var(--zfbtw-color-success)", warning: "var(--zfbtw-color-warning)",
        danger: "var(--zfbtw-color-danger)", bg: "var(--zfbtw-bg)", fg: "var(--zfbtw-fg)" },
      spacing: { "vsp-2xs": "var(--zfbtw-vsp-2xs)", "vsp-xs": "var(--zfbtw-vsp-xs)", "vsp-sm": "var(--zfbtw-vsp-sm)",
        "vsp-md": "var(--zfbtw-vsp-md)", "vsp-lg": "var(--zfbtw-vsp-lg)", "vsp-xl": "var(--zfbtw-vsp-xl)", "vsp-2xl": "var(--zfbtw-vsp-2xl)",
        "hsp-xs": "var(--zfbtw-hsp-xs)", "hsp-sm": "var(--zfbtw-hsp-sm)", "hsp-md": "var(--zfbtw-hsp-md)",
        "hsp-lg": "var(--zfbtw-hsp-lg)", "hsp-xl": "var(--zfbtw-hsp-xl)" },
      sizes: { "size-sidenav-w": "var(--zfbtw-size-sidenav-w)", "size-header-h": "var(--zfbtw-size-header-h)",
        "size-avatar-sm": "var(--zfbtw-size-avatar-sm)", "size-avatar-md": "var(--zfbtw-size-avatar-md)",
        "size-icon-sm": "var(--zfbtw-size-icon-sm)", "size-icon-md": "var(--zfbtw-size-icon-md)" },
      fontSizes: { "page-title": { size: "var(--zfbtw-text-page-title)" }, "section-title": { size: "var(--zfbtw-text-section-title)" },
        "subsection-title": { size: "var(--zfbtw-text-subsection-title)" }, body: { size: "var(--zfbtw-text-body)" },
        helper: { size: "var(--zfbtw-text-helper)" }, annotation: { size: "var(--zfbtw-text-annotation)" },
        "scale-xs": { size: "var(--zfbtw-scale-xs)" }, "scale-sm": { size: "var(--zfbtw-scale-sm)" }, "scale-base": { size: "var(--zfbtw-scale-base)" },
        "scale-md": { size: "var(--zfbtw-scale-md)" }, "scale-lg": { size: "var(--zfbtw-scale-lg)" }, "scale-xl": { size: "var(--zfbtw-scale-xl)" }, "scale-2xl": { size: "var(--zfbtw-scale-2xl)" } },
      fontFamilies: { mono: "var(--zfbtw-font-mono)" },
      fontWeights: { semibold: "600", bold: "700" },
      lineHeights: { tight: "var(--zfbtw-leading-tight)", snug: "var(--zfbtw-leading-snug)", relaxed: "var(--zfbtw-leading-relaxed)" },
      radii: { md: "var(--zfbtw-radius)" },
    },
  },
});
