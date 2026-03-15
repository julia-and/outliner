import React from "react"
import { ChevronRight } from "lucide-react"
import styles from "./Breadcrumbs.module.css"

interface BreadcrumbsProps {
  ancestors: { id: string; title: string }[]
  onNavigate: (id: string) => void
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  ancestors,
  onNavigate,
}) => {
  if (ancestors.length === 0) return null

  return (
    <div className={styles.bar}>
      {ancestors.map((crumb) => (
        <React.Fragment key={crumb.id}>
          <button
            className={styles.crumb}
            onClick={() => onNavigate(crumb.id)}
            title={crumb.title}
          >
            {crumb.title || "Untitled"}
          </button>
          <ChevronRight size={12} className={styles.sep} />
        </React.Fragment>
      ))}
    </div>
  )
}
