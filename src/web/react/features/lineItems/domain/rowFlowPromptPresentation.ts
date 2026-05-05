export type RowFlowPromptLabelParts = {
  labelText: string;
  helperText: string;
};

export type RowFlowPromptLayout = {
  labelLayout: string;
  actionsLayout: string;
  useInlineLabel: boolean;
  hideLabel: boolean;
  actionsInline: boolean;
};

export const splitRowFlowPromptLabelAction = (rawLabel: string): RowFlowPromptLabelParts => {
  const value = rawLabel || '';
  const parts = value.split(/\r?\n/);
  if (parts.length < 2) return { labelText: value, helperText: '' };
  const labelText = parts[0].trim() || value.trim();
  const helperText = parts.slice(1).join('\n').trim();
  return { labelText, helperText };
};

export const resolveRowFlowPromptLayoutAction = (
  promptConfig?: {
    input?: { labelLayout?: unknown };
    actionsLayout?: unknown;
  } | null
): RowFlowPromptLayout => {
  const labelLayout = (promptConfig?.input?.labelLayout || 'stacked').toString().trim().toLowerCase();
  const actionsLayout = (promptConfig?.actionsLayout || 'below').toString().trim().toLowerCase();

  return {
    labelLayout,
    actionsLayout,
    useInlineLabel: labelLayout === 'inline',
    hideLabel: labelLayout === 'hidden',
    actionsInline: actionsLayout === 'inline'
  };
};

export const partitionRowFlowPromptActionsAction = <T extends { position?: unknown }>(
  actions?: T[] | null
): { startActions: T[]; endActions: T[] } => {
  const list = Array.isArray(actions) ? actions : [];
  return {
    startActions: list.filter(action => (action.position || 'start') !== 'end'),
    endActions: list.filter(action => (action.position || 'start') === 'end')
  };
};
