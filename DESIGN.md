# Prompt Workbench Design System

## Intent

The editor is a compact instrument panel inside a node graph. Its physical
scene is a creator working for hours in a dim or bright desktop workspace,
scanning many tags quickly while keeping the graph visible. The color strategy
is restrained: neutral ComfyUI surfaces, one moss-green action color, and
semantic colors reserved for prompt syntax and errors.

## Foundation

- Platform: ComfyUI browser frontend.
- Typography: `system-ui, sans-serif`; UI labels use one family and a compact
  1.125 ratio.
- Density: controls are 26-32px high; editor viewport is capped and scrollable.
- Motion: state transitions are 150ms and disabled under reduced motion.
- Shape: 6px controls, 10px panels, full pills only for tags and status chips.

## Color tokens

The CSS uses these OKLCH fallbacks and prefers ComfyUI theme variables where
available:

```css
--paio-bg: var(--comfy-menu-bg, oklch(0.16 0 0));
--paio-surface: var(--comfy-input-bg, oklch(0.21 0 0));
--paio-ink: var(--input-text, oklch(0.94 0 0));
--paio-muted: var(--descrip-text, oklch(0.72 0 0));
--paio-primary: oklch(0.54 0.12 140);
--paio-accent: oklch(0.76 0.13 75);
--paio-danger: oklch(0.62 0.20 25);
--paio-warning: oklch(0.78 0.14 80);
--paio-info: oklch(0.65 0.13 235);
```

## Components

- Header tabs: two equal buttons with count and dirty/error status nearby.
- Toolbar: wrap-capable row for add, filter, undo and progressive menus.
- Tag list: one semantic list with draggable chips; no nested card grid.
- Tag chip: checkbox, editable text, bilingual line and explicit text actions.
- Bulk actions: appears only with a selection and remains in document flow.
- Dialogs: native `dialog` for settings, examples, blacklist and import/export.
- Status region: an `aria-live` line for translation and validation feedback.

## Interaction states

Every button and input defines default, hover, focus-visible, active and
disabled states. Translation loading disables only translation actions.
Warnings include text or a title, not color alone. Destructive deletion pushes
an undo snapshot before mutation.

## Layout behavior

The node starts around 520px wide. Toolbars wrap, tag text can expand to two
lines, and the list scrolls within 340px. Dialogs use viewport-relative bounds
and are not placed inside the scrolling tag container.
