import { SessionStatus } from '@sagewright/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders the status label', () => {
    render(<StatusChip status={SessionStatus.DONE} />);
    expect(screen.getByText('done')).toBeTruthy();
  });
});
