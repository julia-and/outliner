import mammoth from "mammoth"
import { saveImage } from "./imageStore"

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

function dataURItoFile(dataURI: string): File | null {
  const match = dataURI.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const bytes = atob(match[2])
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const ext = mimeType.split("/")[1] ?? "bin"
  return new File([arr], `image.${ext}`, { type: mimeType })
}

async function elementToMarkdown(el: Element): Promise<string> {
  const tag = el.tagName.toLowerCase()

  if (tag === "p") {
    const text = await nodeToInlineMarkdown(el)
    return text.trim() ? text + "\n\n" : ""
  }
  if (tag === "pre") {
    return "```\n" + el.textContent + "\n```\n\n"
  }
  if (tag === "blockquote") {
    return "> " + el.textContent?.trim() + "\n\n"
  }
  if (tag === "ul") {
    const items = await Promise.all(
      Array.from(el.querySelectorAll(":scope > li")).map(async (li) => "- " + (await nodeToInlineMarkdown(li)).trim() + "\n")
    )
    return items.join("") + "\n"
  }
  if (tag === "ol") {
    const items = await Promise.all(
      Array.from(el.querySelectorAll(":scope > li")).map(async (li, i) => `${i + 1}. ` + (await nodeToInlineMarkdown(li)).trim() + "\n")
    )
    return items.join("") + "\n"
  }
  if (tag === "table") {
    const rows = Array.from(el.querySelectorAll("tr"))
    if (rows.length === 0) return ""
    const rowToMd = async (tr: Element) => {
      const cells = Array.from(tr.querySelectorAll("td, th"))
      const cellTexts = await Promise.all(
        cells.map(async (c) => (await nodeToInlineMarkdown(c)).trim().replace(/\|/g, "\\|").replace(/\\\n/g, " "))
      )
      return "| " + cellTexts.join(" | ") + " |"
    }
    const cols = rows[0].querySelectorAll("td, th").length
    const header = await rowToMd(rows[0])
    const separator = "| " + Array(cols).fill("---").join(" | ") + " |"
    const bodyRows = await Promise.all(rows.slice(1).map(rowToMd))
    const body = bodyRows.join("\n")
    return header + "\n" + separator + (body ? "\n" + body : "") + "\n\n"
  }
  return el.textContent?.trim() ? el.textContent.trim() + "\n\n" : ""
}

async function nodeToInlineMarkdown(el: Element): Promise<string> {
  let result = ""
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent ?? ""
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as Element
      const tag = c.tagName.toLowerCase()
      const inner = await nodeToInlineMarkdown(c)
      if (tag === "strong" || tag === "b") result += `**${inner}**`
      else if (tag === "em" || tag === "i") result += `_${inner}_`
      else if (tag === "code") result += `\`${inner}\``
      else if (tag === "br") result += "\\\n"
      else if (tag === "img") {
        const src = c.getAttribute("src") ?? ""
        const alt = (c.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim()
        if (src.startsWith("data:")) {
          const file = dataURItoFile(src)
          if (file) {
            const id = await saveImage(file)
            result += `![${alt}](ol-image://${id})`
          }
        } else if (src) {
          result += `![${alt}](${src})`
        }
      }
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
      const md = await elementToMarkdown(el)
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
