export function isCmd(
  e: KeyboardEvent | React.KeyboardEvent<Element>,
): boolean {
  return navigator.platform.toUpperCase().includes("MAC")
    ? e.metaKey
    : e.ctrlKey
}
