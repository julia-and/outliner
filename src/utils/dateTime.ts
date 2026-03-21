export function currentDateString() {
  return new Date().toLocaleDateString()
}

export function currentTimeString() {
  return new Date().toLocaleTimeString()
}

export function resolveAutoPlaceholders(markdown: string): string {
  const now = new Date()
  return markdown
    .replace(/\{\{auto:date\}\}/g, now.toLocaleDateString())
    .replace(/\{\{auto:time\}\}/g, now.toLocaleTimeString())
}
