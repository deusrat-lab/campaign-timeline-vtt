/**
 * Universal Content delete policy — one shared mechanism for both the
 * Greyholm (EntityLibraryPage.tsx) and Caldran/user-campaign
 * (CampaignEntityCard.tsx) entity editors, rather than two independently
 * worded/behaved delete flows. Each stack still does its own relation
 * scanning (the two data shapes are genuinely different — DmQuest.giver vs
 * CampaignQuest.npcIds, etc. — see FINAL_FUNCTIONAL_PARITY_REPORT.md) and
 * its own actual store mutation (patchXxx(id, DELETED) vs deleteEntity()),
 * but both funnel through this shared confirm/block UI so the policy —
 * BLOCK_DELETE when relations exist, explicit confirm otherwise — is
 * defined once, not per stack.
 */

export interface BlockingRelation {
  /** Human-readable relation kind, e.g. "Квест", "Локация". */
  kind: string;
  /** The referencing entity's display name. */
  label: string;
}

/** BLOCK_DELETE: entity has inbound relations, deletion is refused. */
export function warnBlockedDelete(entityLabel: string, entityName: string, relations: BlockingRelation[]): void {
  const lines = relations.map((r) => `• ${r.kind}: ${r.label}`).join('\n');
  window.alert(
    `Нельзя удалить ${entityLabel} «${entityName}» — на неё ссылаются:\n${lines}\n\nСначала уберите эти связи, затем повторите удаление.`,
  );
}

/** No blocking relations — ask for explicit confirmation before deleting. */
export function confirmDelete(entityLabel: string, entityName: string): boolean {
  return window.confirm(`Удалить ${entityLabel} «${entityName}»? Это действие нельзя отменить.`);
}

/**
 * Runs the shared policy: if `relations` is non-empty, blocks and warns;
 * otherwise asks for confirmation. Returns true only when the caller should
 * proceed with the actual deletion.
 */
export function runContentDeletePolicy(entityLabel: string, entityName: string, relations: BlockingRelation[]): boolean {
  if (relations.length > 0) {
    warnBlockedDelete(entityLabel, entityName, relations);
    return false;
  }
  return confirmDelete(entityLabel, entityName);
}
