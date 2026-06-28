# SlopeWise

## Owners

- Nathan Zhao

## Purpose

To build a web app, SlopeWise, that teaches single-variable calculus to high school students through
motivating students with competitive incentives, cementing mastery and ensuring optimal scaffolding
through spaced repetition and ensuring mastery before allowing progression. The app will deliver appropriate
hints to the student that point the student in the right direction without short-circuiting productive
struggle.

### In Scope

- **Hint design:** the timing of when to release a hint, and how much information to include in the
hint.
- **Motivation and rewards:** using extrinsic incentives to pull learners into effortful,
desirable-difficulty practice.
- **Social competition:** leaderboards and rivalry built around both people the learner knows and
status relative to people they don't know.
- **Struggle as the central design variable:** treating productive effort, not comfort, as the thing to
protect.
- **Domain:** single-variable calculus for self-directed learners and for classes (high-school AP).
- **Content delivery:** How the content is delivered, through interactive lessons and AI-guided
practice and feedback.



### Out of Scope

- **Curriculum authoring** (which theorems or problems to include); this is about *how* to motivate and
support learning, not *what* calculus to teach.
- **Multivariable calculus, proof-based analysis, or non-calculus subjects.**
- **Monetization, growth, and go-to-market.**
- **Classroom/LMS administration, grading, or teacher dashboards.**

---



## DOK 4: Spiky Points of View (SPOVs)



### SPOV 1: Hints must be earned after effortful thinking, not immediately given.

- An immediate hint spends the single most valuable moment in learning: the genuine attempt to retrieve
an answer. Handing help out on demand trains students to lean on it, rewards shallow effort, and
erases the struggle that builds durable memory, whereas a real attempt followed by guidance actually
strengthens learning even when the attempt fails. SlopeWise withholds hints until a learner has
truly tried, and writes them to nudge the next step in reasoning rather than to give the entire
rest of the problem away.



### SPOV 2: Students must be given extrinsic motivation to complete difficult tasks:.

- The study habits that produce the most durable learning are also the ones that feel hardest and least
desirable, so on their own students avoid them and opt into easier work. Extrinsic motivation can 
motivate students to complete the difficult tasks that they would not otherwise want to do.
SlopeWise attaches its rewards to doing the hard, desirable-difficulty practice through the coin economy
and the game reward system.



### SPOV 3: Competition is strongest between people who know each other.

- People judge their progress by comparing themselves to others, and that comparison alone converts into
real effort, even with nothing tangible at stake. But the pull is far stronger when the rivals are
people you know: we compete harder against friends, classmates, and siblings than against strangers,
because their success feels more relevant to us. So SlopeWise builds competition around a learner's
real social circle instead of an anonymous global board, turning familiar rivalry into momentum.

---



## Experts



### Robert A. Bjork

- **Who:** Distinguished Professor of Psychology, UCLA; director of the Learning and Forgetting Lab.
- **Focus:** How the conditions of practice shape long-term memory, including desirable difficulties and
retrieval.
- **Why follow:** He showed that the study conditions which feel hardest often produce the most durable
learning, and that learners routinely misjudge what is actually working.
- **Where:** [https://bjorklab.psych.ucla.edu/](https://bjorklab.psych.ucla.edu/) · [https://scholar.google.com/scholar?q=Robert+Bjork+desirable+difficulties](https://scholar.google.com/scholar?q=Robert+Bjork+desirable+difficulties)



### Kenneth Koedinger & Vincent Aleven

- **Who:** Professors at Carnegie Mellon's Human-Computer Interaction Institute; builders of Cognitive
Tutors.
- **Focus:** Intelligent tutoring systems and how much help to give a struggling learner.
- **Why follow:** They named and studied the assistance dilemma, the tradeoff between giving and
withholding help, and showed that too much assistance can quietly suppress learning.
- **Where:** [https://scholar.google.com/scholar?q=Koedinger+Aleven+assistance+dilemma](https://scholar.google.com/scholar?q=Koedinger+Aleven+assistance+dilemma)



### Nate Kornell

- **Who:** Professor of Psychology, Williams College.
- **Focus:** Retrieval practice, learning from errors, and the metacognitive illusions that mislead
studiers.
- **Why follow:** His experiments show that attempting to retrieve, and even failing, when followed by
feedback, beats simply being told, reframing a wrong attempt as part of learning rather than a waste.
- **Where:** [https://scholar.google.com/scholar?q=Nate+Kornell+retrieval](https://scholar.google.com/scholar?q=Nate+Kornell+retrieval)



### Roland G. Fryer Jr.

- **Who:** Professor of Economics, Harvard University.
- **Focus:** Field experiments on what actually moves student achievement, including financial
incentives.
- **Why follow:** His randomized trials show that paying students works when the reward targets
effortful behaviors rather than test scores, a precise guide to using incentives without backfiring.
- **Where:** [https://fryer.scholars.harvard.edu/](https://fryer.scholars.harvard.edu/) · [https://scholar.google.com/scholar?q=Roland+Fryer+financial+incentives+student+achievement](https://scholar.google.com/scholar?q=Roland+Fryer+financial+incentives+student+achievement)



### Richard Zeckhauser & Anh Tran

- **Who:** Zeckhauser is a professor of political economy at the Harvard Kennedy School; Tran is his
co-author on the rank experiments.
- **Focus:** Incentives and decision-making, including how rank itself motivates effort.
- **Why follow:** Their field experiment shows that simply learning your rank drives real performance
gains, even privately and with no prize, evidence that comparison alone is a powerful incentive.
- **Where:** [https://rzeckhauser.scholars.harvard.edu/](https://rzeckhauser.scholars.harvard.edu/) · [https://scholar.google.com/scholar?q=Tran+Zeckhauser+rank+inherent+incentive](https://scholar.google.com/scholar?q=Tran+Zeckhauser+rank+inherent+incentive)



### Stephen M. Garcia & Avishalom Tor

- **Who:** Garcia is a social psychologist (University of Michigan); Tor is a professor of law and
behavioral science (University of Notre Dame).
- **Focus:** The psychology of competition and social comparison.
- **Why follow:** They map the factors that make competition more intense, showing that rivalry with
similar and close others drives more effort than rivalry with strangers.
- **Where:** [https://www.smgarcia.org/](https://www.smgarcia.org/) · [https://scholar.google.com/scholar?q=Garcia+Tor+psychology+of+competition](https://scholar.google.com/scholar?q=Garcia+Tor+psychology+of+competition)

---



## DOK 3: Insights



### On hints and productive struggle

- **Insight 1:** The moment a student is stuck is the moment of maximum learning potential; an on-demand
hint spends that moment instead of investing it. The real design question is not "what should the hint
say" but "has the learner earned it yet."
- **Insight 2:** A wrong attempt is part of the path, not a detour from it: trying and failing, then
getting guidance, beats being told up front. So a hint should arrive after the attempt and point at
the next step, never the destination.
- **Insight 3:** Help can hurt. More assistance feels more supportive but can produce less
learning, because it removes the desirable struggle and invites students to lean on hints rather than
think.



### On motivation and desirable difficulty

- **Insight 1:** The cruel irony of studying is that the methods which feel most productive are the least
effective; learners mistake fluency for mastery and rationally avoid the hard methods that actually
work.
- **Insight 2:** Because students will not choose desirable difficulties on their own, an external pull
is justified, but it must reward the effortful behavior, not the outcome, or it motivates the wrong
thing.
- **Insight 3:** The warning that rewards kill intrinsic motivation is real but narrow;
paying for the effortful process is far safer than paying for raw scores, and can build the habit that
intrinsic motivation later sustains.



### On competition and social motivation

- **Insight 1:** Rank is an inherent incentive: people work harder just to climb, even with no prize and
even when no one else can see where they stand.
- **Insight 2:** Closeness amplifies the effect. A leaderboard of strangers is background noise, but a
leaderboard of friends is personal, so the very same feature motivates far more when the rivals are
socially real.
- **Insight 3:** Competition motivates when there is a clear path to self-repair, like another attempt
or another round; without that next chance, comparison can demoralize instead of drive.

---



## DOK 2: Knowledge Tree



### 1. Hints, Effort, and Productive Struggle

**Source: Koedinger, K. R., & Aleven, V. (2007). Exploring the Assistance Dilemma in Experiments with
Cognitive Tutors. *Educational Psychology Review*, 19(3), 239–264.**

- **DOK 1 Facts:**
  - Names the "assistance dilemma": how a learning environment should balance giving versus withholding
  help (hints, feedback, worked examples) to maximize learning.
  - Too little help leads to unproductive floundering; too much reduces effort, causes shallow
  processing and hint abuse, and weakens self-regulation.
  - Effective hints preserve the learner's agency by nudging reasoning in a productive direction rather
  than replacing it.
- **DOK 2 Summary:** A hint's value depends on its timing and form: withhold it until the learner has
engaged, and shape it to steer thinking rather than hand over the answer.
- **Link:** [https://pslcdatashop.web.cmu.edu/KDDCup/FAQ/Koedinger-Aleven-EPR-07.pdf](https://pslcdatashop.web.cmu.edu/KDDCup/FAQ/Koedinger-Aleven-EPR-07.pdf)

**Source: Kornell, N., Hays, M. J., & Bjork, R. A. (2009). Unsuccessful Retrieval Attempts Enhance
Subsequent Learning. *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 35(4),
989–998.**

- **DOK 1 Facts:**
  - Six experiments. In the "test" condition learners tried to answer before seeing the answer; in
  "read-only" the question and answer appeared together.
  - Even attempts guaranteed to fail, when followed by feedback, enhanced later learning.
  - A failed attempt plus feedback matched (trivia questions) or beat (weak word pairs) studying the
  answer for the same amount of time.
- **DOK 2 Summary:** A failed retrieval attempt is not wasted; the act of trying primes encoding so the
answer sticks better, which is why the attempt must come before any help.
- **Link:** [https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Hays.Bjork.2009.pdf](https://web.williams.edu/Psychology/Faculty/Kornell/Publications/Kornell.Hays.Bjork.2009.pdf)



### 2. Motivation, Rewards, and Desirable Difficulties

**Source: Bjork, E. L., & Bjork, R. A. (2011). Making things hard on yourself, but in a good way:
Creating desirable difficulties to enhance learning. In *Psychology and the Real World*.**

- **DOK 1 Facts:**
  - Coins "desirable difficulties": conditions that slow apparent progress but boost long-term retention
  and transfer, such as spacing, interleaving, varying conditions, and testing instead of
  re-presentation.
  - Performance during study is a poor index of durable learning; easy, fluent study creates an illusion
  of mastery.
  - A difficulty is only desirable if the learner has the background to respond successfully; otherwise
  it becomes an undesirable difficulty.
- **DOK 2 Summary:** The most effective study conditions feel harder, which is exactly why learners avoid
them, creating the need for an external nudge toward the effortful path.
- **Link:** [https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf)

**Source: Fryer, R. G. (2011). Financial Incentives and Student Achievement: Evidence from Randomized
Trials. *Quarterly Journal of Economics*, 126(4), 1755–1798.**

- **DOK 1 Facts:**
  - School-based randomized trials in over 250 urban schools across five cities.
  - Incentives tied to inputs (reading books, homework, attendance, the effortful behaviors) raised
  achievement; incentives tied to outputs (test scores, grades) did not.
  - Likely reason: students know what action to take for an input target, but not how to convert a
  reward into a higher score.
- **DOK 2 Summary:** Extrinsic rewards work in education when they pay for the effortful process rather
than the outcome, the exact lever for pulling students through desirable-difficulty work.
- **Link:** [https://www.nber.org/system/files/working_papers/w15898/w15898.pdf](https://www.nber.org/system/files/working_papers/w15898/w15898.pdf)



### 3. Competition and Social Comparison

**Source: Tran, A., & Zeckhauser, R. (2012). Rank as an inherent incentive: Evidence from a field
experiment. *Journal of Public Economics*, 96(9–10), 645–650.**

- **DOK 1 Facts:**
  - Field experiment with students in an English course; some were told their rank on practice tests,
  some were not.
  - Ranked students scored significantly higher on the official final exam: the privately-ranked group
  improved about 64% more than control, and the publicly-ranked group about 91% more.
  - The effect held even when rank was revealed privately, with no money or public status attached; rank
  could even outweigh cash as a motivator.
- **DOK 2 Summary:** Simply knowing where you stand relative to peers drives real effort and performance,
even with no prize attached, the core mechanism behind competitive ranking.
- **Link:** [https://appext.hks.harvard.edu/publications/getFile.aspx?Id=375](https://appext.hks.harvard.edu/publications/getFile.aspx?Id=375)

**Source: Garcia, S. M., Tor, A., & Schiff, T. M. (2013). The Psychology of Competition: A Social
Comparison Perspective. *Perspectives on Psychological Science*, 8(6), 634–650.**

- **DOK 1 Facts:**
  - Models competition as driven by social comparison and identifies three factors that intensify it:
  relevance of the dimension, similarity of the rival, and relationship closeness.
  - People compete more with close others (friends, siblings) on self-relevant dimensions, for example
  giving friends fewer helpful clues than strangers and feeling more threatened by a friend's success.
- **DOK 2 Summary:** Closeness amplifies competitive motivation, so competition among people who know
each other is far stronger than competition among strangers.
- **Link:** [https://doi.org/10.1177/1745691613504114](https://doi.org/10.1177/1745691613504114)

