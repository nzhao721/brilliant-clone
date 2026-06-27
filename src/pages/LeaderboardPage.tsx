import { useEffect, useState } from 'react';
import { ClassesPanel } from '../components/ClassesPanel';
import { LeaderboardList } from '../components/LeaderboardList';
import type { ClassRecord } from '../classes/classData';
import { useClassLeaderboard } from '../classes/useClassLeaderboard';
import { useClasses } from '../classes/useClasses';
import { useLeaderboard } from '../leaderboard/useLeaderboard';
import './LeaderboardPage.css';

const GLOBAL_TAB = 'global';

/** One joined class's leaderboard, split out so the per-class hook runs only for the active tab and remounts cleanly on change. */
function ClassLeaderboardView({ classRecord }: { classRecord: ClassRecord }) {
  const board = useClassLeaderboard(classRecord.code);

  return (
    <LeaderboardList
      {...board}
      listLabel={`${classRecord.name} members ranked by XP`}
      loadingLabel={`Loading ${classRecord.name} leaderboard`}
      errorMessage="We couldn't load this class leaderboard right now. Try again in a moment."
      emptyTitle="No one here yet"
      emptyMessage="Share this class code so your group can join and start climbing the ranks."
    />
  );
}

export function LeaderboardPage() {
  const globalBoard = useLeaderboard();
  const classManager = useClasses();
  const [activeTab, setActiveTab] = useState<string>(GLOBAL_TAB);

  const joinedClasses = classManager.classes;

  // If the active class tab disappears, fall back to the always-present Global tab.
  useEffect(() => {
    if (activeTab !== GLOBAL_TAB && !joinedClasses.some((entry) => entry.code === activeTab)) {
      setActiveTab(GLOBAL_TAB);
    }
  }, [activeTab, joinedClasses]);

  const activeClass = joinedClasses.find((entry) => entry.code === activeTab) ?? null;

  return (
    <section className="leaderboard-page">
      <div className="page-heading">
        <h1>Leaderboard</h1>
        <p>See how your XP stacks up — globally and within your classes.</p>
      </div>

      <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboards">
        <button
          type="button"
          role="tab"
          id="leaderboard-tab-global"
          aria-selected={activeTab === GLOBAL_TAB}
          aria-controls="leaderboard-panel"
          className={`leaderboard-tab${activeTab === GLOBAL_TAB ? ' is-active' : ''}`}
          onClick={() => setActiveTab(GLOBAL_TAB)}
        >
          Global
        </button>
        {joinedClasses.map((entry) => (
          <button
            key={entry.code}
            type="button"
            role="tab"
            aria-selected={activeTab === entry.code}
            aria-controls="leaderboard-panel"
            className={`leaderboard-tab${activeTab === entry.code ? ' is-active' : ''}`}
            onClick={() => setActiveTab(entry.code)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <div id="leaderboard-panel" role="tabpanel" aria-labelledby="leaderboard-tab-global">
        {activeTab === GLOBAL_TAB || !activeClass ? (
          <LeaderboardList
            {...globalBoard}
            listLabel={`Top ${globalBoard.topN} learners ranked by XP`}
          />
        ) : (
          <ClassLeaderboardView key={activeClass.code} classRecord={activeClass} />
        )}
      </div>

      {/* Class create/join/manage sits at the bottom so the leaderboards lead. */}
      <div className="leaderboard-classes">
        <div className="leaderboard-classes-heading">
          <h2>Classes</h2>
          <p>Create or join a class to compare XP with your group — and manage how you appear.</p>
        </div>
        <ClassesPanel manager={classManager} activeCode={activeTab} onSelectClass={setActiveTab} />
      </div>
    </section>
  );
}
