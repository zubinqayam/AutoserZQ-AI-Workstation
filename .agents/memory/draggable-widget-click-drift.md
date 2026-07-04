---
name: draggable widget click drift
description: Fix for floating/draggable panels that appear to move or drift on a plain click instead of only on an actual drag
---

# Draggable widget drifting on plain click

A `mousedown` → track deltas on `mousemove` → apply on `mouseup` drag
implementation with no minimum-movement threshold will misinterpret ordinary
click jitter (a few px of pointer movement between mousedown and mouseup while
clicking to open/toggle the widget) as an intentional drag, silently shifting
the widget's position on every click.

**Rule:** require a small pixel threshold (e.g. 4px) of cumulative movement
before flipping from "armed" (mousedown happened) to "dragging" (actually
apply position deltas). Track "armed" and "dragging" as separate flags/refs so
a plain click never touches position state.

**Why:** users reported a floating chat/agent overlay panel "drifting" every
time they clicked it to open/close — root cause was exactly this missing
threshold, not a state-sync or CSS issue.

**How to apply:** whenever implementing custom drag-to-move behavior on a
floating/overlay UI element (not using a library like `@dnd-kit` that already
handles this), always add the armed/dragging distinction with a threshold.
