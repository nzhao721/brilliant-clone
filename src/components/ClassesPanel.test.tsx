import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesPanel } from './ClassesPanel';
import type { UseClassesResult } from '../classes/useClasses';
import type { ClassRecord } from '../classes/classData';

function makeRecord(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    code: 'ALPHA1',
    name: 'Alpha',
    ownerUid: 'owner',
    memberUids: ['me', 'x', 'y'],
    memberCount: 3,
    createdAtMillis: null,
    ...overrides,
  };
}

function makeManager(overrides: Partial<UseClassesResult> = {}): UseClassesResult {
  return {
    available: true,
    signedIn: true,
    status: 'ready',
    classes: [],
    error: false,
    displayName: 'Maya',
    createClass: vi.fn().mockResolvedValue({ ok: true, record: makeRecord({ code: 'CALC26', name: 'Period 3' }) }),
    joinClass: vi
      .fn()
      .mockResolvedValue({ ok: true, alreadyMember: false, record: makeRecord({ code: 'TEAMX9', name: 'Team X' }) }),
    leaveClass: vi.fn().mockResolvedValue({ ok: true, wasMember: true }),
    updateDisplayName: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ClassesPanel availability', () => {
  it('shows an unavailable note when Firebase is not configured', () => {
    render(
      <ClassesPanel
        manager={makeManager({ available: false, status: 'unavailable' })}
        activeCode="global"
        onSelectClass={vi.fn()}
      />,
    );

    expect(screen.getByText(/need a configured Firebase project/i)).toBeInTheDocument();
  });

  it('prompts the signed-out user to sign in', () => {
    render(
      <ClassesPanel
        manager={makeManager({ signedIn: false, status: 'unavailable' })}
        activeCode="global"
        onSelectClass={vi.fn()}
      />,
    );

    expect(screen.getByText(/sign in to create or join a class/i)).toBeInTheDocument();
  });
});

describe('ClassesPanel create', () => {
  it('creates a class with a custom code and selects its new tab', async () => {
    const user = userEvent.setup();
    const manager = makeManager();
    const onSelectClass = vi.fn();

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={onSelectClass} />);

    const form = screen.getByRole('form', { name: 'Create a class' });
    await user.type(within(form).getByLabelText(/Class name/i), 'Period 3');
    await user.type(within(form).getByLabelText(/Custom code/i), 'CALC26');
    await user.click(within(form).getByRole('button', { name: /create class/i }));

    expect(manager.createClass).toHaveBeenCalledWith('Period 3', 'CALC26');
    await waitFor(() => expect(onSelectClass).toHaveBeenCalledWith('CALC26'));
    expect(within(form).getByText(/share code CALC26/i)).toBeInTheDocument();
  });

  it('surfaces a duplicate-code error from the data layer', async () => {
    const user = userEvent.setup();
    const manager = makeManager({
      createClass: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'code-taken', message: 'Class code "DUPE12" is already taken. Try another.' }),
    });

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={vi.fn()} />);

    const form = screen.getByRole('form', { name: 'Create a class' });
    await user.type(within(form).getByLabelText(/Custom code/i), 'DUPE12');
    await user.click(within(form).getByRole('button', { name: /create class/i }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(/already taken/i);
  });
});

describe('ClassesPanel join', () => {
  it('joins by code and selects the class tab', async () => {
    const user = userEvent.setup();
    const manager = makeManager();
    const onSelectClass = vi.fn();

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={onSelectClass} />);

    const form = screen.getByRole('form', { name: 'Join a class' });
    await user.type(within(form).getByLabelText('Class code'), 'TEAMX9');
    await user.click(within(form).getByRole('button', { name: /join class/i }));

    expect(manager.joinClass).toHaveBeenCalledWith('TEAMX9');
    await waitFor(() => expect(onSelectClass).toHaveBeenCalledWith('TEAMX9'));
  });

  it('shows an error for an unknown code', async () => {
    const user = userEvent.setup();
    const manager = makeManager({
      joinClass: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: 'not-found', message: 'No class found with code "NOPE12".' }),
    });

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={vi.fn()} />);

    const form = screen.getByRole('form', { name: 'Join a class' });
    await user.type(within(form).getByLabelText('Class code'), 'NOPE12');
    await user.click(within(form).getByRole('button', { name: /join class/i }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(/No class found/i);
  });
});

describe('ClassesPanel joined list', () => {
  it('lists joined classes with their codes and member counts', () => {
    render(
      <ClassesPanel
        manager={makeManager({ classes: [makeRecord()] })}
        activeCode="global"
        onSelectClass={vi.fn()}
      />,
    );

    const list = screen.getByRole('list', { name: 'Your classes' });
    expect(within(list).getByText('Alpha')).toBeInTheDocument();
    expect(within(list).getByText('ALPHA1')).toBeInTheDocument();
    expect(within(list).getByText('3 members')).toBeInTheDocument();
  });

  it('selects a class when its row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectClass = vi.fn();

    render(
      <ClassesPanel
        manager={makeManager({ classes: [makeRecord()] })}
        activeCode="global"
        onSelectClass={onSelectClass}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'View Alpha leaderboard' }));
    expect(onSelectClass).toHaveBeenCalledWith('ALPHA1');
  });

  it('leaves a class via the controller', async () => {
    const user = userEvent.setup();
    const manager = makeManager({ classes: [makeRecord()] });

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Leave Alpha' }));
    expect(manager.leaveClass).toHaveBeenCalledWith('ALPHA1');
  });
});

describe('ClassesPanel display name', () => {
  it('edits the display name through the controller', async () => {
    const user = userEvent.setup();
    const manager = makeManager();

    render(<ClassesPanel manager={manager} activeCode="global" onSelectClass={vi.fn()} />);

    expect(screen.getByText('Maya')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByLabelText('Display name');
    await user.clear(input);
    await user.type(input, 'Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(manager.updateDisplayName).toHaveBeenCalledWith('Ada Lovelace');
  });
});
