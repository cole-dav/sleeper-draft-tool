# Fantasy Football Draft Analyzer - Design Guidelines

## Design Approach
**System**: Hybrid approach drawing from Linear's modern data presentation, Notion's organizational clarity, and ESPN Fantasy's sports-specific UX patterns. Prioritizing information density, scanability, and interactive precision for analytical workflows.

## Typography System
- **Primary Font**: Inter (Google Fonts) - exceptional readability at all sizes
- **Monospace Font**: JetBrains Mono - for draft pick numbers, round indicators, statistics
- **Hierarchy**:
  - Team Headers: text-lg font-semibold tracking-tight
  - Player Names: text-base font-medium
  - Draft Metadata (Round/Pick): text-sm font-mono
  - Player Stats: text-xs font-mono tabular-nums
  - Position Tags: text-xs font-bold uppercase tracking-wider

## Layout System
**Spacing Primitives**: Use Tailwind units of 1, 2, 3, 4, 6, 8 exclusively for consistent rhythm
- Grid gaps: gap-4 between team columns, gap-2 between draft picks
- Card padding: p-3 for pick cards, p-4 for team headers
- Section margins: mt-6 for major sections, mb-8 for page sections

**Grid Structure**:
- Main container: max-w-screen-2xl mx-auto px-6
- Team columns: Dynamic grid (grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6)
- Each team column: min-w-[280px] max-w-[320px] to maintain readability
- Vertical scrolling within fixed viewport height (h-screen overflow-y-auto)

## Core Components

**Team Header Card** (Draggable):
- Fixed height header with team name, draft summary stats (total picks, positions breakdown)
- Drag handle icon (6 horizontal dots) positioned left
- Quick stats row: Total picks badge, Top position badge
- Subtle elevated appearance indicating draggable nature

**Draft Pick Card**:
- Compact card layout: Pick number badge (top-left), Player name (prominent), Position tag (top-right)
- Two-row layout: Player info row + stats row (projected points, ADP, positional rank)
- Border treatment for hover/focus states
- Condensed spacing (p-2 to p-3) to maximize visible picks

**Position Tags**:
- Pill-shaped badges with position abbreviations (QB, RB, WR, TE, K, DEF)
- Small but readable (text-xs px-2 py-1 rounded-full)

**Interactive States**:
- **Hover**: Subtle lift effect (transform translate-y-[-2px]) + enhanced border visibility
- **Dragging**: Elevated shadow (shadow-2xl), slight opacity reduction on source
- **Drop Zones**: Dashed border treatment when dragging active
- **Focus**: Thick border indicator for keyboard navigation

**Control Panel** (Top Bar):
- Fixed position toolbar: Filters (Position, Round), Sort options, View density toggle
- Horizontal layout with icon buttons and dropdown selectors
- Height: h-14 with items-center alignment

## Data Visualization Elements

**Pick Number Indicators**:
- Monospace rounded badges showing pick number within round
- Small footprint (w-8 h-8) with centered text
- Round number displayed as superscript or subtitle

**Stats Display**:
- Tabular layout using CSS Grid for aligned columns
- Label-value pairs with muted labels
- Percentage/rank indicators with compact formatting

**Empty States**:
- Dashed border containers for teams with no picks in visible rounds
- Centered "No picks" message with subtle styling

## Icons
**Library**: Heroicons (outline for general UI, solid for filled states)
- Drag handle: Bars3Icon (horizontal)
- Positions: Use text badges instead of icons for clarity
- Filters: FunnelIcon, AdjustmentsHorizontalIcon
- Sort: ArrowsUpDownIcon

## Images
**No hero image required** - This is a functional dashboard application, not a marketing page. The interface should load directly into the draft grid view.

**Optional Branding**:
- Small logo/wordmark in top-left (max h-8)
- Team logos as 32x32px avatars in team headers if available

## Animations
**Minimal, functional only**:
- Drag-and-drop: Smooth 150ms transitions for reordering
- Card hover: Quick 100ms transform transition
- No scroll animations, page transitions, or decorative motion

## Accessibility
- Keyboard navigation: Full arrow key support for grid traversal
- Focus indicators: Visible focus rings on all interactive elements
- ARIA labels: Descriptive labels for drag handles, drop zones
- Screen reader announcements: Live regions for draft updates
- High contrast mode support: Ensure border/text visibility