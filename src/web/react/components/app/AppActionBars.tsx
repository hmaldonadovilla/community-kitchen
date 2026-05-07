import React from 'react';
import { ActionBar } from './ActionBar';

type ActionBarProps = React.ComponentProps<typeof ActionBar>;

type AppActionBarCommonProps = Omit<
  ActionBarProps,
  'position' | 'notice' | 'showBackButton' | 'backLabel' | 'backDisabled' | 'onBack'
>;

interface AppActionBarProps {
  position: ActionBarProps['position'];
  commonProps: AppActionBarCommonProps;
  notice?: React.ReactNode;
  showBackButton?: boolean;
  backLabel?: ActionBarProps['backLabel'];
  backDisabled?: boolean;
  onBack?: () => void;
}

export const AppActionBar: React.FC<AppActionBarProps> = ({
  position,
  commonProps,
  notice,
  showBackButton,
  backLabel,
  backDisabled,
  onBack
}) => (
  <ActionBar
    position={position}
    {...commonProps}
    notice={notice}
    showBackButton={showBackButton}
    backLabel={backLabel}
    backDisabled={backDisabled}
    onBack={onBack}
  />
);
