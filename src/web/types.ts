import {
  LineItemGroupConfig,
  LocalizedString,
  OptionFilter,
  ValidationRule,
  VisibilityConfig,
  WebFormDefinition,
  WebQuestionDefinition
} from '../types';

export type LangCode = 'EN' | 'FR' | 'NL' | string;

export type FieldValue = string | number | string[] | null | undefined;

export interface LineItemRowState {
  id: string;
  values: Record<string, FieldValue>;
}

export interface FormState {
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: Record<string, LineItemRowState[]>;
  submitting: boolean;
}

export interface OptionSet {
  en?: string[];
  fr?: string[];
  nl?: string[];
  [key: string]: string[] | undefined;
}

export interface ValidationError {
  fieldId: string;
  message: string;
  scope?: 'main' | 'line';
  rowId?: string;
}

export interface VisibilityContext {
  getValue: (fieldId: string) => FieldValue;
  getLineValue?: (rowId: string, fieldId: string) => FieldValue;
}

export interface FilterContext {
  getDependencyValues: (dependsOn: string | string[]) => (string | number | null | undefined)[];
}

export type WhenConfig = ValidationRule['when'];

export type ThenConfig = ValidationRule['then'];

export interface LineItemTotalsInput {
  config: LineItemGroupConfig;
  rows: LineItemRowState[];
}

export {
  WebFormDefinition,
  WebQuestionDefinition,
  LocalizedString,
  OptionFilter,
  VisibilityConfig,
  ValidationRule
};
