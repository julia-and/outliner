import mammoth from "mammoth"

export interface DocxSection {
  title: string
  level: number
  content: string
  children: DocxSection[]
}

export interface ParsedDocx {
  title: string
  sections: DocxSection[]
}

function elementToMarkdown(el: Element): string {
  const tag = el.tagName.toLowerCase()

  if (tag === "p") {
    const text = nodeToInlineMarkdown(el)
    return text.trim() ? text + "\n\n" : ""
  }
  if (tag === "pre") {
    return "```\n" + el.textContent + "\n```\n\n"
  }
  if (tag === "blockquote") {
    return "> " + el.textContent?.trim() + "\n\n"
  }
  if (tag === "ul") {
    return Array.from(el.querySelectorAll(":scope > li"))
      .map((li) => "- " + li.textContent?.trim() + "\n")
      .join("") + "\n"
  }
  if (tag === "ol") {
    return Array.from(el.querySelectorAll(":scope > li"))
      .map((li, i) => `${i + 1}. ` + li.textContent?.trim() + "\n")
      .join("") + "\n"
  }
  return el.textContent?.trim() ? el.textContent.trim() + "\n\n" : ""
}

function nodeToInlineMarkdown(el: Element): string {
  let result = ""
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? ""
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      const inner = nodeToInlineMarkdown(c)
      if (tag === "strong" || tag === "b") result += `**${inner}**`
      else if (tag === "em" || tag === "i") result += `_${inner}_`
      else if (tag === "code") result += `\`${inner}\``
      else result += inner
    }
  }
  return result
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

function headingLevel(tag: string): number {
  return parseInt(tag[1], 10)
}

export async function parseDocx(file: File): Promise<ParsedDocx> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const parser = new DOMParser()
  const dom = parser.parseFromString(result.value, "text/html")

  const elements = Array.from(dom.body.children)

  // Stack entries: [section, level]
  const stack: Array<{ section: DocxSection; level: number }> = []
  const roots: DocxSection[] = []
  let docTitle = file.name.replace(/\.docx$/i, "")

  // Pre-heading content accumulates in an implicit root
  let preHeadingContent = ""
  let seenHeading = false
  let firstH1: string | null = null

  for (const el of elements) {
    const tag = el.tagName.toLowerCase()

    if (HEADING_TAGS.has(tag)) {
      seenHeading = true
      const level = headingLevel(tag)
      const title = el.textContent?.trim() ?? ""

      if (level === 1 && firstH1 === null) firstH1 = title

      // Pop stack entries at same or deeper level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop()
      }

      const section: DocxSection = { title, level, content: "", children: [] }

      if (stack.length === 0) {
        roots.push(section)
      } else {
        stack[stack.length - 1].section.children.push(section)
      }

      stack.push({ section, level })
    } else {
      const md = elementToMarkdown(el)
      if (!seenHeading) {
        preHeadingContent += md
      } else if (stack.length > 0) {
        stack[stack.length - 1].section.content += md
      }
    }
  }

  if (firstH1) docTitle = firstH1

  // If there's pre-heading content, wrap in an implicit root section
  let sections = roots
  if (preHeadingContent.trim()) {
    const implicit: DocxSection = {
      title: docTitle,
      level: 0,
      content: preHeadingContent.trim(),
      children: roots,
    }
    sections = [implicit]
  }

  return { title: docTitle, sections }
}
