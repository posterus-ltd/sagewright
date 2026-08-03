import { type ButtonProps } from '@mui/material';
import { type Session } from '@sagewright/shared';
import { type FC, type ReactNode } from 'react';

import { useCreateSession, useRunners } from '../api/hooks';
import { SplitButton } from './SplitButton';

interface Props {
  onCreated: (task: Session) => void;
  label?: string;
  size?: 'small' | 'medium';
  variant?: ButtonProps['variant'];
  startIcon?: ReactNode;
}

export const NewSessionButton: FC<Props> = ({
  onCreated,
  label = 'New session',
  size,
  variant,
  startIcon = undefined,
}) => {
  const { data } = useRunners();
  const runners = data?.runners ?? [];
  const defaultImage = data?.defaultImage ?? null;

  const createSession = useCreateSession();

  const create = async (runnerImage: string): Promise<void> => {
    const task = await createSession.mutateAsync({ runnerImage });
    onCreated(task);
  };

  // The configured default only applies if it maps to a real, available image; otherwise the
  // first available runner leads. This avoids ever launching the operator fallback blindly when
  // its image isn't built (which would 404 at container create).
  const primary = runners.find((w) => w.image === defaultImage) ?? runners[0] ?? null;
  const rest = runners.filter((w) => w.image !== primary?.image);

  const options = (primary ? [primary, ...rest] : []).map((w) => ({
    id: w.image,
    label: w.name,
    description: w.description,
    selected: w.image === primary?.image,
    divider: w.image === primary?.image && rest.length > 0,
  }));

  return (
    <SplitButton
      label={label}
      onPrimary={() => {
        if (primary) void create(primary.image);
      }}
      options={options}
      onSelect={(id) => void create(id)}
      startIcon={startIcon}
      disabled={createSession.isPending || runners.length === 0}
      size={size}
      variant={variant}
    />
  );
};
