export type DateInputNativeCommitMode = 'immediate' | 'deferWhileFocused';

export type DateInputNavigatorSnapshot = {
  userAgent?: string | null;
  platform?: string | null;
  maxTouchPoints?: number | null;
} | null | undefined;

export const shouldDeferNativeDateInputCommit = (
  mode: DateInputNativeCommitMode,
  navigatorSnapshot?: DateInputNavigatorSnapshot
): boolean => {
  if (mode !== 'deferWhileFocused') return false;
  const userAgent = (navigatorSnapshot?.userAgent || '').toLowerCase();
  if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ipod')) return true;

  // iPadOS desktop-mode Safari reports itself as MacIntel, but still behaves like iOS here.
  const platform = (navigatorSnapshot?.platform || '').toLowerCase();
  const maxTouchPoints = Number(navigatorSnapshot?.maxTouchPoints || 0);
  return platform === 'macintel' && maxTouchPoints > 1;
};

export const resolveDateInputRenderedValue = (args: {
  value: string;
  draftValue: string | null;
  deferNativeCommit: boolean;
  focused: boolean;
}): string => {
  if (args.deferNativeCommit && args.focused && args.draftValue !== null) return args.draftValue;
  return args.value;
};
