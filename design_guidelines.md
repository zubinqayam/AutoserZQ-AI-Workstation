# AutoserGPT AI Workstation Design Guidelines

## Design Approach: Technical Productivity System

**Selected Approach:** Design System (Utility-Focused)
- **Primary Reference:** Linear/Notion-inspired professional workspace
- **Rationale:** Research and productivity tools require clarity, focus, and minimal distraction. The existing Control Panel implementation demonstrates a sophisticated dark-mode workspace optimized for extended research sessions.

## Core Design Principles

1. **Focus-First Interface:** Minimize visual noise to support deep research work
2. **Information Density:** Maximize workspace real estate for content viewing
3. **Collaborative Clarity:** Clear visual indicators for multi-user presence
4. **Professional Aesthetics:** Sophisticated dark theme suitable for professional environments

---

## Color Palette

### Dark Mode (Primary)
- **Background Base:** `#0C1222` (deep navy-black)
- **Surface Elevated:** `#0F1730` (slightly lighter panels/headers)
- **Borders/Dividers:** `white/10` (rgba with 10% opacity)
- **Hover States:** `white/10` (subtle elevation)

### Accent Colors
- **Primary Action:** Indigo `indigo-500` → `indigo-600` (hover)
- **Success/Active:** Emerald `emerald-500`
- **Warning/Alert:** Amber `amber-500`
- **Danger/Error:** Red `red-500`

### Text Hierarchy
- **Primary Text:** `zinc-100` (high contrast)
- **Secondary Text:** `zinc-400` (medium contrast)
- **Disabled/Placeholder:** `zinc-500` or `zinc-400`

---

## Typography

**Font Stack:** System font stack for performance and consistency
```
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

### Type Scale
- **Headers:** `text-sm font-semibold tracking-wide` (subtle, refined)
- **Body Text:** `text-sm` (compact for information density)
- **Labels/Meta:** `text-xs` (supporting information)
- **Button Text:** `text-sm font-medium`

### Font Weights
- Semibold (600): Headers, active states
- Medium (500): Buttons, emphasis
- Regular (400): Body text, inputs

---

## Layout System

### Spacing Primitives
**Standardized on Tailwind units:** 2, 3, 4, 8, 12, 16
- Micro spacing: `gap-2` (8px)
- Standard spacing: `gap-4` (16px), `p-4`
- Section spacing: `p-8`, `gap-8`
- Large spacing: `p-12` (48px)

### Grid Architecture
**Three-Column Layout:**
```
lg:grid-cols-[260px_1fr_360px]
```
- Left Sidebar: 260px (navigation, room info)
- Main Content: Fluid (4-panel viewer area)
- Right Panel: 360px (comments, collaboration)

**4-Panel Viewer Grid:**
```
grid grid-cols-2 gap-2 lg:gap-3
```
- 2×2 layout for simultaneous content viewing
- Minimal gaps for maximum content area

---

## Component Library

### Buttons
**Primary Action Button:**
- Background: `bg-indigo-500 hover:bg-indigo-600`
- Padding: `px-3 py-2`
- Border radius: `rounded-xl` (12px)
- Text: `text-sm font-medium`

**Secondary/Ghost Buttons:**
- Background: `bg-white/5 border border-white/10`
- Hover: `hover:bg-white/10`
- Same padding and radius as primary

### Input Fields
- Background: `bg-white/5`
- Border: `border border-white/10`
- Focus: `outline-none` with subtle glow effect
- Padding: `px-3 py-2`
- Placeholder: `placeholder:text-zinc-400`
- Radius: `rounded-xl`

### Panels/Cards
- Background: `bg-[#0F1730]` or `bg-white/5`
- Border: `border border-white/10`
- Radius: `rounded-xl` or `rounded-2xl` for larger panels
- Shadow: Minimal or none (flat design)

### Navigation/Sidebar
- Sticky positioning: `sticky top-0`
- Background: Matches surface color
- Border separation: `border-r border-white/10`

### Status Indicators
**Presence/Online Status:**
- Active: Green dot with pulse animation
- Offline: Gray dot
- Size: `w-2 h-2 rounded-full`

**Room Status:**
- Locked: Amber/red indicator
- Open: Green indicator
- Compact badge display

---

## Interactive States

### Hover Behaviors
- Buttons: Darker shade of base color
- Cards/Panels: `hover:bg-white/10` (subtle lift)
- Icons: `hover:text-zinc-100` (brightness increase)

### Focus States
- Inputs: Subtle indigo ring or border highlight
- Keyboard navigation: Clear focus indicators

### Loading States
- Skeleton screens matching panel structure
- Subtle pulse animation
- Maintain layout to prevent shift

---

## Special Components

### Conference Room Viewer Panels
- Iframe containers with `rounded-xl`
- Header bar: `bg-[#0F1730] px-3 py-2`
- Minimize/maximize controls in header
- URL input bar with Go button
- Force embed checkbox
- Collapsible state with smooth transition

### Comment Center
- Scrollable message list
- Message bubbles: `bg-white/5 rounded-xl p-3`
- Author attribution with timestamp
- AI messages: Distinct indicator (icon or badge)
- Input area: Fixed at bottom with `bg-[#0F1730]`

### Room Management Bar
- Fixed top position: `sticky top-0 z-20`
- Horizontal layout with flex spacing
- Quick actions: Share, Lock/Unlock, Minimize All
- Safe Mode toggle with checkbox
- Room ID display with copy functionality

---

## Responsive Behavior

### Breakpoints
- Mobile: Single column, stacked panels
- Tablet (md): 2-column grid or adjusted sidebar
- Desktop (lg): Full 3-column layout

### Panel Adaptations
- Mobile: Full-screen panels with tab navigation
- Tablet: 2×2 grid maintained, sidebar collapsible
- Desktop: Full layout as designed

---

## Micro-interactions

**Minimal Animation Philosophy:**
- Transitions: `transition-colors duration-200` for color changes
- Panel collapse/expand: `transition-all duration-300`
- Avoid excessive motion to reduce distraction
- Focus on functional feedback, not decoration

---

## Images & Media

**No Hero Images** - This is a utility application, not marketing
**Embedded Content:** All visual content is user-loaded via iframe viewer
**Icons:** Use Heroicons or similar minimal icon set via CDN
**Avatars/Presence:** Simple colored circles or initials for users

---

## Accessibility Considerations

- Maintain WCAG AA contrast ratios with dark theme
- Keyboard navigation for all interactive elements
- Screen reader labels for icon-only buttons
- Focus indicators clearly visible on dark backgrounds
- Color not sole indicator of state (use icons/text too)