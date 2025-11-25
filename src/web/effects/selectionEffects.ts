import { SelectionEffect, WebFormDefinition, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';

interface EffectContext {
  addLineItemRow: (groupId: string, preset?: Record<string, string | number>) => void;
}

function applies(effect: SelectionEffect, value: string | string[] | null | undefined): boolean {
  if (!effect.triggerValues || effect.triggerValues.length === 0) return true;
  const vals = Array.isArray(value) ? value : value ? [value] : [];
  return vals.some(v => effect.triggerValues!.includes(v));
}

export function handleSelectionEffects(
  definition: WebFormDefinition,
  question: WebQuestionDefinition | undefined,
  value: string | string[] | null | undefined,
  _language: LangCode,
  ctx: EffectContext
): void {
  if (!question?.selectionEffects || !question.selectionEffects.length) return;
  question.selectionEffects.forEach(effect => {
    if (effect.type === 'addLineItems' && applies(effect, value)) {
      ctx.addLineItemRow(effect.groupId, effect.preset);
    }
  });
}
