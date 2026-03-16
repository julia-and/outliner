import { ICON_MAP } from "../utils/iconMap"
import styles from "./NodeIcon.module.css"

interface NodeIconProps {
  name: string
  size?: number
  /** Explicit color; omit to inherit currentColor from the parent element */
  color?: string
}

export const NodeIcon = ({ name, size = 14, color }: NodeIconProps) => {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon size={size} color={color} className={styles.icon} />
}
