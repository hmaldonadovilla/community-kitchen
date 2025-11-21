export type QuestionType = 'DATE' | 'TEXT' | 'PARAGRAPH' | 'NUMBER' | 'CHOICE' | 'CHECKBOX';

export interface QuestionConfig {
  id: string;
  type: QuestionType;
  qEn: string;
  qFr: string;
  qNl: string;
  required: boolean;
  options: string[];      // English options
  optionsFr: string[];    // French options
  optionsNl: string[];    // Dutch options
  status: 'Active' | 'Archived';
}

export interface FormConfig {
  title: string;
  configSheet: string;
  destinationTab: string;
  description: string;
  formId: string;
  rowIndex: number;
}

export interface FormResult {
  id: string;
  editUrl: string;
  publishedUrl: string;
}
