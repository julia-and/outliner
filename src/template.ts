import { db, TemplateRow } from "./db"
import { STARTER_TEMPLATES } from "./starterTemplates"

export async function seedStarterTemplates(): Promise<void> {
  await db.templates.bulkPut(STARTER_TEMPLATES)
}

export async function createTemplate(
  name: string,
  content: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await db.templates.add({ id, name, content, createdAt: Date.now() })
  return id
}

export async function updateTemplate(
  id: string,
  patch: Partial<TemplateRow>,
): Promise<void> {
  await db.templates.update(id, patch)
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id)
}
