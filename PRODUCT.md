# Product

## Register

product

## Platform

web

## Users

ComfyUI users who build Stable Diffusion workflows and need to inspect, edit,
translate and organize long positive and negative prompts without leaving the
node graph. The editor must remain useful in dense desktop workflows and must
not make headless or API execution depend on browser state.

## Product Purpose

Provide a compact, reliable tag-oriented editor over two standard ComfyUI
STRING inputs. Success means users can make precise prompt edits, preserve
workflow state, connect the outputs directly to text-encoding nodes, and retain
normal execution when the frontend extension is unavailable.

## Positioning

The prompt editor that treats ComfyUI's executable STRING values as the source
of truth while adding reversible, structured editing around them.

## Brand Personality

Practical, precise and calm. Labels should be concise, errors should explain a
recovery action, and visual emphasis should communicate tag state rather than
decorate the node.

## Anti-references

- A1111 or Gradio controls copied into a node without adapting their workflow.
- A permanently huge node, nested decorative cards or excessive toolbars.
- Hidden prompt storage that works only while the browser extension is active.
- History, favorites or empty placeholders for excluded features.
- Theme-specific hard-coded colors that become unreadable in light or dark mode.

## Design Principles

- Keep executable prompt strings authoritative and portable.
- Make common tag edits immediate and make destructive edits undoable.
- Reveal secondary tools progressively so the node stays compact.
- Degrade model lookup and translation independently from core editing.
- Treat secrets and imported state as untrusted data.

## Accessibility & Inclusion

Use semantic controls, visible focus, keyboard-operable selection and editing,
theme-aware contrast, reduced-motion behavior, text labels for icon actions and
status messages that do not rely on color alone. Japanese and English input,
search and display must work without normalization that changes meaning.
