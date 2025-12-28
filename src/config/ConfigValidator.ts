import { QuestionConfig } from '../types';

export class ConfigValidator {
  /**
   * Validates configuration and returns error messages if any
   * @returns Array of error messages, empty if validation passes
   */
  static validate(questions: QuestionConfig[], sheetName: string): string[] {
    const errors: string[] = [];

    // Check for duplicate question IDs (stable keys)
    errors.push(...this.validateUniqueIdsAcrossQuestions(questions));

    // Check required nested IDs (LINE_ITEM_GROUP subGroups)
    errors.push(...this.validateLineItemSubGroupIds(questions));
    
    // Check for matching option counts
    errors.push(...this.validateOptionCounts(questions));
    errors.push(...this.validateLineItemOptionCounts(questions));
    
    return errors;
  }
  
  private static validateUniqueIdsAcrossQuestions(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];
    
    const ids = questions.map((q, idx) => ({ name: (q.id || '').toString().trim(), index: idx + 1 }));
    const duplicates = this.findDuplicates(ids);
    if (duplicates.size > 0) {
      let error = '━━━ DUPLICATE QUESTION IDs ━━━\n\n';
      duplicates.forEach((indices, id) => {
        error += `❌ "${id}" appears ${indices.length} times in rows: ${indices.join(', ')}\n`;
      });
      error += '\n✓ Solution: IDs must be unique (Column A). Rename one of the duplicated IDs.\n';
      error += '   Labels (EN/FR/NL) may be duplicated; IDs may not.\n';
      errors.push(error);
    }

    return errors;
  }

  private static validateLineItemSubGroupIds(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];
    questions.forEach((q, idx) => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const subs: any[] = Array.isArray((q as any).lineItemConfig?.subGroups) ? ((q as any).lineItemConfig.subGroups as any[]) : [];
      if (!subs.length) return;

      const missing = subs
        .map((sub, sIdx) => ({ sub, sIdx }))
        .filter(({ sub }) => !sub || !sub.id || !sub.id.toString().trim());
      if (missing.length) {
        let error = `━━━ MISSING SUBGROUP IDs (Row ${idx + 2}) ━━━\n\n`;
        error += `❌ Question: "${q.qEn || q.id}" (${q.id})\n\n`;
        missing.forEach(({ sub, sIdx }) => {
          const label = (sub?.label?.en || sub?.label?.fr || sub?.label?.nl || sub?.label || '').toString();
          const labelText = label ? ` label="${label}"` : '';
          error += `   - SubGroup #${sIdx + 1}${labelText} is missing an id\n`;
        });
        error += '\n✓ Solution: Add a stable `id` for every entry in lineItemConfig.subGroups.\n';
        error += '   (We no longer allow label-based subgroup keys.)';
        errors.push(error);
      }

      const idEntries = subs
        .map((sub, sIdx) => ({ name: (sub?.id || '').toString().trim(), index: sIdx + 1 }))
        .filter(e => !!e.name);
      const dupes = this.findDuplicates(idEntries);
      if (dupes.size) {
        let error = `━━━ DUPLICATE SUBGROUP IDs (Row ${idx + 2}) ━━━\n\n`;
        error += `❌ Question: "${q.qEn || q.id}" (${q.id})\n\n`;
        dupes.forEach((indices, id) => {
          error += `   - "${id}" appears ${indices.length} times in subGroups: ${indices.join(', ')}\n`;
        });
        error += '\n✓ Solution: SubGroup IDs must be unique within a LINE_ITEM_GROUP.\n';
        errors.push(error);
      }
    });
    return errors;
  }
  
  private static findDuplicates(names: { name: string; index: number }[]): Map<string, number[]> {
    const nameMap = new Map<string, number[]>();
    
    names.forEach(({ name, index }) => {
      if (!name) return; // Skip empty names
      
      if (!nameMap.has(name)) {
        nameMap.set(name, []);
      }
      nameMap.get(name)!.push(index);
    });
    
    // Filter to only duplicates
    const duplicates = new Map<string, number[]>();
    nameMap.forEach((indices, name) => {
      if (indices.length > 1) {
        duplicates.set(name, indices);
      }
    });
    
    return duplicates;
  }
  
  // NOTE: We intentionally do NOT validate for duplicate labels (EN/FR/NL) anymore.
  // Labels are presentation-only; stable IDs are the canonical keys (see record schema rules).
  
  private static validateOptionCounts(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];
    
    questions.forEach((q, idx) => {
      if (q.type !== 'CHOICE' && q.type !== 'CHECKBOX') return;
      
      const enCount = q.options.length;
      const frCount = q.optionsFr.length;
      const nlCount = q.optionsNl.length;
      
      if (enCount !== frCount || enCount !== nlCount || frCount !== nlCount) {
        let error = `━━━ MISMATCHED OPTION COUNTS (Row ${idx + 2}) ━━━\n\n`;
        error += `❌ Question: "${q.qEn}"\n\n`;
        error += `   English:  ${enCount} option${enCount !== 1 ? 's' : ''} (${q.options.join(', ') || 'none'})\n`;
        error += `   French:   ${frCount} option${frCount !== 1 ? 's' : ''} (${q.optionsFr.join(', ') || 'none'})\n`;
        error += `   Dutch:    ${nlCount} option${nlCount !== 1 ? 's' : ''} (${q.optionsNl.join(', ') || 'none'})\n\n`;
        error += `✓ Solution: All languages must have the same number of options.\n`;
        error += `   Example: "Clean, Dirty" | "Propre, Sale" | "Schoon, Vuil"`;
        
        errors.push(error);
      }
    });
    
    return errors;
  }

  private static validateLineItemOptionCounts(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];

    questions.forEach((q, parentIdx) => {
      if (!q.lineItemConfig || !q.lineItemConfig.fields || q.lineItemConfig.fields.length === 0) return;

      q.lineItemConfig.fields.forEach((field, fieldIdx) => {
        if (field.type !== 'CHOICE' && field.type !== 'CHECKBOX') return;

        const enCount = field.options.length;
        const frCount = field.optionsFr.length;
        const nlCount = field.optionsNl.length;

        if (enCount !== frCount || enCount !== nlCount || frCount !== nlCount) {
          let error = `━━━ MISMATCHED OPTION COUNTS (Line Item ${fieldIdx + 1} in Row ${parentIdx + 2}) ━━━\n\n`;
          error += `❌ Line Item: "${field.labelEn || field.id}" in question "${q.qEn}"\n\n`;
          error += `   English:  ${enCount} option${enCount !== 1 ? 's' : ''} (${field.options.join(', ') || 'none'})\n`;
          error += `   French:   ${frCount} option${frCount !== 1 ? 's' : ''} (${field.optionsFr.join(', ') || 'none'})\n`;
          error += `   Dutch:    ${nlCount} option${nlCount !== 1 ? 's' : ''} (${field.optionsNl.join(', ') || 'none'})\n\n`;
          error += '✓ Solution: All languages must have the same number of options for line item fields.';
          errors.push(error);
        }
      });
    });

    return errors;
  }
}
