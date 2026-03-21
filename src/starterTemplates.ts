import type { TemplateRow } from "./store"

export const STARTER_TEMPLATES: TemplateRow[] = [
  {
    id: "starter:meeting-notes",
    name: "Meeting Notes",
    content:
      "## Meeting Notes\n\n**Date:** \n**Attendees:** \n\n### Agenda\n\n- \n\n### Discussion\n\n\n\n### Action Items\n\n- [ ] \n",
    createdAt: 0,
  },
  {
    id: "starter:daily-journal",
    name: "Daily Journal",
    content:
      "## Daily Journal\n\n**Date:** {{auto:date}} \n\n### What I accomplished today\n\n- {{Solved gravity}} \n### What I'm grateful for\n\n- {{Tacos and Beer}} \n### Goals for tomorrow\n\n- {{Relax}} \n",
    createdAt: 0,
  },
  {
    id: "starter:project-spec",
    name: "Project Spec",
    content:
      "## Project Spec\n\n### Overview\n\n\n\n### Goals\n\n- \n\n### Non-goals\n\n- \n\n### Implementation Plan\n\n\n\n### Open Questions\n\n- \n",
    createdAt: 0,
  },
  {
    id: "starter:weekly-review",
    name: "Weekly Review",
    content:
      "## Weekly Review\n\n**Week of:** \n\n### Wins\n\n- \n\n### Challenges\n\n- \n\n### Learnings\n\n\n\n### Focus for next week\n\n- \n",
    createdAt: 0,
  },
]
