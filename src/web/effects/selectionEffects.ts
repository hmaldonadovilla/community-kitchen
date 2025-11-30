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

function isDebug(): boolean {
  try {
    return typeof window !== 'undefined' && Boolean((window as any).__WEB_FORM_DEBUG__);
  } catch (_) {
    return false;
  }
}

export function handleSelectionEffects(
  definition: WebFormDefinition,
  question: WebQuestionDefinition | undefined,
  value: string | string[] | null | undefined,
  _language: LangCode,
  ctx: EffectContext
): void {
  if (!question?.selectionEffects || !question.selectionEffects.length) return;
  const debug = isDebug();
  if (debug && typeof console !== 'undefined') {
    console.info('[SelectionEffects] evaluating', {
      questionId: question.id,
      value,
      effectCount: question.selectionEffects.length
    });
  }
  question.selectionEffects.forEach(effect => {
    const match = effect.type === 'addLineItems' && applies(effect, value);
    if (debug && typeof console !== 'undefined') {
      console.info('[SelectionEffects] effect check', {
        questionId: question.id,
        effectType: effect.type,
        groupId: effect.groupId,
        match,
        triggerValues: effect.triggerValues
      });
    }
    if (match) {
      ctx.addLineItemRow(effect.groupId, effect.preset);
      if (debug && typeof console !== 'undefined') {
        console.info('[SelectionEffects] addLineItems dispatched', {
          groupId: effect.groupId,
          preset: effect.preset
        });
      }
    }
  });
}
