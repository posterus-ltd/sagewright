import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { PasswordFields, isPasswordPairValid } from './PasswordFields';

// A tiny controlled harness so typing flows back through the props the way a real
// consumer wires it up.
const Harness = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  return (
    <PasswordFields
      password={password}
      confirm={confirm}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
    />
  );
};

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('PasswordFields', () => {
  it('shows every requirement as unmet before anything is typed', () => {
    render(<Harness />);
    expect(screen.getByLabelText('At least 8 characters: not met')).toBeTruthy();
    expect(screen.getByLabelText('Contains letters: not met')).toBeTruthy();
    expect(screen.getByLabelText('Contains numbers: not met')).toBeTruthy();
    expect(screen.getByLabelText('Passwords match: not met')).toBeTruthy();
  });

  it('marks each requirement met live as the fields satisfy it', () => {
    render(<Harness />);

    type('New password', 'letters1');
    expect(screen.getByLabelText('At least 8 characters: met')).toBeTruthy();
    expect(screen.getByLabelText('Contains letters: met')).toBeTruthy();
    expect(screen.getByLabelText('Contains numbers: met')).toBeTruthy();
    // Confirm is still empty, so the match rule stays unmet.
    expect(screen.getByLabelText('Passwords match: not met')).toBeTruthy();

    type('Confirm password', 'letters1');
    expect(screen.getByLabelText('Passwords match: met')).toBeTruthy();
  });
});

describe('isPasswordPairValid', () => {
  it('is true only when the password is strong and the confirmation matches', () => {
    expect(isPasswordPairValid('letters1', 'letters1')).toBe(true);
    expect(isPasswordPairValid('letters1', 'letters2')).toBe(false); // mismatch
    expect(isPasswordPairValid('short1', 'short1')).toBe(false); // too short
    expect(isPasswordPairValid('lettersonly', 'lettersonly')).toBe(false); // no number
    expect(isPasswordPairValid('12345678', '12345678')).toBe(false); // no letters
  });
});
