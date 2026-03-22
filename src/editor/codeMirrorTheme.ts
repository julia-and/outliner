import { EditorView } from "@codemirror/view"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { tags } from "@lezer/highlight"

/**
 * A CodeMirror theme that uses CSS variables so it adapts to light/dark mode.
 * Replaces the default one-dark theme bundled with milkdown/crepe.
 * Structural colors (backgrounds, cursor, selection) come from crepe/app tokens.
 * Syntax colors come from --syntax-* variables defined in styles.css.
 */
const appTheme = EditorView.theme({
  "&": {
    color: "var(--crepe-color-on-surface)",
    backgroundColor: "var(--crepe-color-surface)",
  },
  ".cm-content": {
    caretColor: "var(--resizer-active)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--resizer-active)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--crepe-color-selected)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--crepe-color-surface-low)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "var(--crepe-color-hover)",
  },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "var(--crepe-color-hover)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--crepe-color-surface)",
    color: "var(--crepe-color-on-surface-variant)",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--crepe-color-surface-low)",
  },
  ".cm-searchMatch": {
    backgroundColor: "rgba(74, 144, 226, 0.25)",
    outline: "1px solid rgba(74, 144, 226, 0.5)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "rgba(74, 144, 226, 0.4)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--crepe-color-on-surface-variant)",
  },
  ".cm-tooltip": {
    border: "none",
    backgroundColor: "var(--crepe-color-surface-low)",
    color: "var(--crepe-color-on-surface)",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "var(--crepe-color-surface-low)",
    borderBottomColor: "var(--crepe-color-surface-low)",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--crepe-color-selected)",
      color: "var(--crepe-color-on-surface)",
    },
  },
})

const appHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName],
    color: "var(--syntax-name)",
  },
  {
    tag: [tags.function(tags.variableName), tags.labelName],
    color: "var(--syntax-function)",
  },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: "var(--syntax-constant)",
  },
  {
    tag: [tags.definition(tags.name), tags.separator],
    color: "var(--syntax-definition)",
  },
  {
    tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace],
    color: "var(--syntax-type)",
  },
  {
    tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link, tags.special(tags.string)],
    color: "var(--syntax-operator)",
  },
  {
    tag: [tags.meta, tags.comment],
    color: "var(--syntax-comment)",
    fontStyle: "italic",
  },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--syntax-link)", textDecoration: "underline" },
  { tag: tags.heading, fontWeight: "bold", color: "var(--syntax-keyword)" },
  {
    tag: [tags.atom, tags.bool, tags.special(tags.variableName)],
    color: "var(--syntax-constant)",
  },
  {
    tag: [tags.processingInstruction, tags.string, tags.inserted],
    color: "var(--syntax-string)",
  },
  { tag: tags.invalid, color: "var(--crepe-color-error)" },
])

export const appCodeMirrorTheme = [appTheme, syntaxHighlighting(appHighlightStyle)]
