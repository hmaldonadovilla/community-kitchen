import { QuestionConfig } from '../types';

export class ConfigValidator {
  /**
   * Validates configuration and returns error messages if any
   * @returns Array of error messages, empty if validation passes
   */
  static validate(questions: QuestionConfig[], sheetName: string): string[] {
    const errors: string[] = [];
    
    // Check that within each question, all 3 language names are different
    errors.push(...this.validateUniqueNamesWithinQuestion(questions));
    
    // Check for duplicate question names across questions
    errors.push(...this.validateUniqueNamesAcrossQuestions(questions));
    
    // Check for matching option counts
    errors.push(...this.validateOptionCounts(questions));
    errors.push(...this.validateLineItemOptionCounts(questions));
    
    return errors;
  }
  
  private static validateUniqueNamesWithinQuestion(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];
    
    questions.forEach((q, idx) => {
      const names = [
        { lang: 'English', name: q.qEn.trim() },
        { lang: 'French', name: q.qFr.trim() },
        { lang: 'Dutch', name: q.qNl.trim() }
      ];
      
      // Check if any two names are the same
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          if (names[i].name && names[j].name && names[i].name === names[j].name) {
            let error = `━━━ DUPLICATE NAME IN QUESTION (Row ${idx + 2}) ━━━\n\n`;
            error += `❌ The name "${names[i].name}" appears in both:\n`;
            error += `   • ${names[i].lang}\n`;
            error += `   • ${names[j].lang}\n\n`;
            error += `⚠️  This will create duplicate columns in the form responses.\n\n`;
            error += `✓ Solution: Use different names for each language.\n`;
            error += `   Example: "Weather" | "Météo" | "Weer"`;
            
            errors.push(error);
            break; // Only report once per question
          }
        }
        if (errors.length > 0 && errors[errors.length - 1].includes(`Row ${idx + 2}`)) {
          break; // Already reported this question
        }
      }
    });
    
    return errors;
  }
  
  private static validateUniqueNamesAcrossQuestions(questions: QuestionConfig[]): string[] {
    const errors: string[] = [];
    
    // Check English names
    const enNames = questions.map((q, idx) => ({ name: q.qEn.trim(), index: idx + 1 }));
    const enDuplicates = this.findDuplicates(enNames);
    if (enDuplicates.size > 0) {
      errors.push(this.formatDuplicateError('English', enDuplicates));
    }
    
    // Check French names
    const frNames = questions.map((q, idx) => ({ name: q.qFr.trim(), index: idx + 1 }));
    const frDuplicates = this.findDuplicates(frNames);
    if (frDuplicates.size > 0) {
      errors.push(this.formatDuplicateError('French', frDuplicates));
    }
    
    // Check Dutch names
    const nlNames = questions.map((q, idx) => ({ name: q.qNl.trim(), index: idx + 1 }));
    const nlDuplicates = this.findDuplicates(nlNames);
    if (nlDuplicates.size > 0) {
      errors.push(this.formatDuplicateError('Dutch', nlDuplicates));
    }
    
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
  
  private static formatDuplicateError(language: string, duplicates: Map<string, number[]>): string {
    let error = `━━━ DUPLICATE NAMES ACROSS QUESTIONS (${language}) ━━━\n\n`;
    
    duplicates.forEach((indices, name) => {
      error += `❌ "${name}" appears ${indices.length} times in rows: ${indices.join(', ')}\n`;
    });
    
    error += `\n✓ Solution: Make each ${language} question name unique.\n`;
    error += `   Example: "Date" → "Date", "Start Date"`;
    
    return error;
  }
  
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
