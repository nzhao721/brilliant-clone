import { useState, type FormEvent } from 'react';
import {
  CLASS_CODE_MAX_LENGTH,
  CLASS_CODE_MIN_LENGTH,
  MAX_CLASS_NAME_LENGTH,
  type ClassRecord,
} from '../classes/classData';
import type { UseClassesResult } from '../classes/useClasses';
import './ClassesPanel.css';

/*
 * Class create/join/manage surface for the Leaderboard. Presentational (local form
 * state only); data and mutations come from the `useClasses` controller via props.
 */

type Feedback = { type: 'success' | 'error'; message: string } | null;

type ClassesPanelProps = {
  manager: UseClassesResult;
  /** The currently selected leaderboard tab ('global' or a class code). */
  activeCode: string;
  /** Switch the active leaderboard tab to the given class code. */
  onSelectClass: (code: string) => void;
};

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (or denied): the code is shown as text to copy.
    }
  }

  return (
    <button
      type="button"
      className="class-chip-copy"
      onClick={handleCopy}
      aria-label={`Copy class code ${code}`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function JoinedClassList({
  classes,
  activeCode,
  onSelectClass,
  onLeave,
  leavingCode,
}: {
  classes: ClassRecord[];
  activeCode: string;
  onSelectClass: (code: string) => void;
  onLeave: (code: string) => void;
  leavingCode: string | null;
}) {
  if (classes.length === 0) {
    return (
      <p className="classes-empty">
        You haven't joined any classes yet. Create one or join with a code to compare XP with your
        group.
      </p>
    );
  }

  return (
    <ul className="classes-joined-list" aria-label="Your classes">
      {classes.map((classRecord) => (
        <li key={classRecord.code} className="class-chip">
          <button
            type="button"
            className={`class-chip-main${activeCode === classRecord.code ? ' is-active' : ''}`}
            onClick={() => onSelectClass(classRecord.code)}
            aria-pressed={activeCode === classRecord.code}
            aria-label={`View ${classRecord.name} leaderboard`}
          >
            <span className="class-chip-name">{classRecord.name}</span>
            <span className="class-chip-meta">
              <span className="class-chip-code">{classRecord.code}</span>
              <span className="class-chip-members">
                {classRecord.memberCount}{' '}
                {classRecord.memberCount === 1 ? 'member' : 'members'}
              </span>
            </span>
          </button>
          <span className="class-chip-actions">
            <CopyCodeButton code={classRecord.code} />
            <button
              type="button"
              className="class-chip-leave"
              onClick={() => onLeave(classRecord.code)}
              disabled={leavingCode === classRecord.code}
              aria-label={`Leave ${classRecord.name}`}
            >
              {leavingCode === classRecord.code ? 'Leaving…' : 'Leave'}
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ClassesPanel({ manager, activeCode, onSelectClass }: ClassesPanelProps) {
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [editingName, setEditingName] = useState(false);

  const [createFeedback, setCreateFeedback] = useState<Feedback>(null);
  const [joinFeedback, setJoinFeedback] = useState<Feedback>(null);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);

  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [leavingCode, setLeavingCode] = useState<string | null>(null);

  if (!manager.available) {
    return (
      <section className="classes-panel" aria-label="Classes">
        <p className="classes-unavailable">
          Class leaderboards need a configured Firebase project. The global leaderboard below still
          works locally.
        </p>
      </section>
    );
  }

  if (!manager.signedIn) {
    return (
      <section className="classes-panel" aria-label="Classes">
        <p className="classes-unavailable">Sign in to create or join a class.</p>
      </section>
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateFeedback(null);

    const result = await manager.createClass(createName, createCode || undefined);

    setCreating(false);

    if (result.ok) {
      setCreateName('');
      setCreateCode('');
      setCreateFeedback({
        type: 'success',
        message: `Created "${result.record.name}" — share code ${result.record.code}.`,
      });
      onSelectClass(result.record.code);
    } else {
      setCreateFeedback({ type: 'error', message: result.message });
    }
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setJoinFeedback(null);

    const result = await manager.joinClass(joinCode);

    setJoining(false);

    if (result.ok) {
      setJoinCode('');
      setJoinFeedback({
        type: 'success',
        message: result.alreadyMember
          ? `You're already in "${result.record.name}".`
          : `Joined "${result.record.name}"!`,
      });
      onSelectClass(result.record.code);
    } else {
      setJoinFeedback({ type: 'error', message: result.message });
    }
  }

  async function handleLeave(code: string) {
    setLeavingCode(code);
    const result = await manager.leaveClass(code);
    setLeavingCode(null);

    if (!result.ok) {
      setJoinFeedback({ type: 'error', message: result.message });
    } else if (activeCode === code) {
      onSelectClass('global');
    }
  }

  function startEditingName() {
    setNameDraft(manager.displayName);
    setNameFeedback(null);
    setEditingName(true);
  }

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    setNameFeedback(null);

    const result = await manager.updateDisplayName(nameDraft);

    setSavingName(false);

    if (result.ok) {
      setEditingName(false);
      setNameFeedback({ type: 'success', message: 'Display name updated.' });
    } else {
      setNameFeedback({ type: 'error', message: result.message });
    }
  }

  return (
    <section className="classes-panel" aria-label="Classes">
      <div className="classes-identity">
        {editingName ? (
          <form className="classes-name-form" onSubmit={handleSaveName}>
            <label className="classes-field-label" htmlFor="display-name-input">
              Display name
            </label>
            <div className="classes-inline-row">
              <input
                id="display-name-input"
                className="classes-input"
                type="text"
                value={nameDraft}
                maxLength={MAX_CLASS_NAME_LENGTH}
                onChange={(event) => setNameDraft(event.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="classes-btn classes-btn-primary" disabled={savingName}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="classes-btn"
                onClick={() => setEditingName(false)}
                disabled={savingName}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="classes-identity-line">
            You appear as <strong>{manager.displayName}</strong>
            <button type="button" className="classes-link-btn" onClick={startEditingName}>
              Edit
            </button>
          </p>
        )}
        {nameFeedback ? (
          <p
            className={`classes-feedback classes-feedback-${nameFeedback.type}`}
            role={nameFeedback.type === 'error' ? 'alert' : 'status'}
          >
            {nameFeedback.message}
          </p>
        ) : null}
      </div>

      <div className="classes-forms">
        <form className="classes-form" onSubmit={handleCreate} aria-label="Create a class">
          <h3 className="classes-form-title">Create a class</h3>
          <label className="classes-field-label" htmlFor="create-name-input">
            Class name <span className="classes-field-hint">(optional)</span>
          </label>
          <input
            id="create-name-input"
            className="classes-input"
            type="text"
            placeholder="e.g. Period 3 Calculus"
            value={createName}
            maxLength={MAX_CLASS_NAME_LENGTH}
            onChange={(event) => setCreateName(event.target.value)}
            autoComplete="off"
          />
          <label className="classes-field-label" htmlFor="create-code-input">
            Custom code <span className="classes-field-hint">(optional — blank for random)</span>
          </label>
          <input
            id="create-code-input"
            className="classes-input"
            type="text"
            placeholder={`${CLASS_CODE_MIN_LENGTH}–${CLASS_CODE_MAX_LENGTH} letters/numbers`}
            value={createCode}
            maxLength={CLASS_CODE_MAX_LENGTH}
            onChange={(event) => setCreateCode(event.target.value.toUpperCase())}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="classes-btn classes-btn-primary" disabled={creating}>
            {creating ? 'Creating…' : 'Create class'}
          </button>
          {createFeedback ? (
            <p
              className={`classes-feedback classes-feedback-${createFeedback.type}`}
              role={createFeedback.type === 'error' ? 'alert' : 'status'}
            >
              {createFeedback.message}
            </p>
          ) : null}
        </form>

        <form className="classes-form" onSubmit={handleJoin} aria-label="Join a class">
          <h3 className="classes-form-title">Join a class</h3>
          <label className="classes-field-label" htmlFor="join-code-input">
            Class code
          </label>
          <input
            id="join-code-input"
            className="classes-input"
            type="text"
            placeholder="Enter a code"
            value={joinCode}
            maxLength={CLASS_CODE_MAX_LENGTH}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="classes-btn classes-btn-primary" disabled={joining}>
            {joining ? 'Joining…' : 'Join class'}
          </button>
          {joinFeedback ? (
            <p
              className={`classes-feedback classes-feedback-${joinFeedback.type}`}
              role={joinFeedback.type === 'error' ? 'alert' : 'status'}
            >
              {joinFeedback.message}
            </p>
          ) : null}
        </form>
      </div>

      <div className="classes-joined">
        <h3 className="classes-form-title">Your classes</h3>
        <JoinedClassList
          classes={manager.classes}
          activeCode={activeCode}
          onSelectClass={onSelectClass}
          onLeave={handleLeave}
          leavingCode={leavingCode}
        />
      </div>
    </section>
  );
}
