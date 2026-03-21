# ol — Outliner

A keyboard-driven, local-first outliner with a rich text editor per node.

## Features

### Outline
- Hierarchical nodes with collapse/expand
- Two modes: **navigation** (keyboard traversal) and **edit** (inline title editing)
- Indent, outdent, move up/move down
- Copy, cut, paste subtrees
- Undo/redo
- Node styling: bold, italic, strikethrough, text color, background color
- Node icons with color picker
- Callout blocks with color options
- Highlight/mark support
- Cross-links between nodes
- Virtualized rendering for large outlines

### Rich Text Editor
- Per-node Milkdown (Markdown-based) editor
- Collaborative editing via Yjs + y-prosemirror
- Image support with local blob storage
- Resizable split layout (horizontal or vertical) between outline and editor

### Import & Templates
- Import `.docx` files — headings map to outline nodes, content to node editors
- Template manager with built-in starter templates (Meeting Notes, Daily Journal, Project Spec, etc.)
- Templates support auto-filled placeholders: `{{auto:date}}`, `{{auto:time}}`, `{{auto:datetime}}`
- Tab-navigable editable placeholders in template output

### Keyboard Shortcuts
All shortcuts are remappable (except Confirm/Cancel). Defaults:

| Action | Shortcut |
|---|---|
| Move up / down | `↑` / `↓` |
| Expand / enter child | `→` |
| Collapse / go to parent | `←` |
| Focus editor | `E` |
| Indent | `⌘→` or `Tab` |
| Outdent | `⌘←` or `⇧Tab` |
| Move node up / down | `⌘↑` / `⌘↓` |
| Add sibling | `↩` |
| Add child | `⌘↩` |
| Add root node | `⌘⇧↩` |
| Edit title | `I` |
| Delete node | `⌫` |
| Copy / Cut / Paste | `⌘C` / `⌘X` / `⌘V` |
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Insert date | `⌘⇧D` |
| Insert time | `⌘⇧T` |
| Insert date+time | `⌘⇧;` |

### Storage & Sync
- Local-first: all data stored in IndexedDB via Dexie
- CRDT-based document model via Yjs (conflict-free offline edits)
- Optional cloud sync via Dexie Cloud
- Dark mode, persisted layout preferences

## Tech Stack

- **React 19** + TypeScript
- **Yjs** — CRDT document model
- **Dexie** + **y-dexie** — IndexedDB persistence with Yjs integration
- **Milkdown** — rich text / Markdown editor
- **react-resizable-panels** — resizable split layout
- **@tanstack/react-virtual** — outline virtualization
- **mammoth** — `.docx` import
- **Vite** + PWA plugin

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## License

MIT
