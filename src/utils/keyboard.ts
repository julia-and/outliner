export function isCmd(e: KeyboardEvent): boolean {
  return navigator.platform.toUpperCase().includes("MAC")
    ? e.metaKey
    : e.ctrlKey
}
