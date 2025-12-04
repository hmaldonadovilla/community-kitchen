import { OptionSet } from '../types';
import { LineItemRowState } from '../types';

export interface LineItemState {
  [groupId: string]: LineItemRowState[];
}

export interface OptionState {
  [key: string]: OptionSet;
}

export interface FormErrors {
  [key: string]: string;
}

export type View = 'form' | 'list' | 'summary' | 'followup';

