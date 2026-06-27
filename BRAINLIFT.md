# SlopeWise

## Owners

- Nathan Zhao

## Purpose

A research-grounded philosophy for teaching single-variable calculus through software. The core belief:
a digital calculus course should behave like a **patient one-to-one tutor**, diagnosing each learner's
misconceptions, choosing the next problem for *that* learner, and teaching through manipulation and
retrieval, not like a textbook with a quiz bolted on.

### In Scope

- **Feedback pedagogy:** what the app says after an answer, especially a *wrong* one, tailored to the
  mistake and the learner's history.
- **Adaptive practice:** how the next problem is chosen for an individual's mastery and weak spots, not
  served as a fixed set.
- **Active learning:** teaching through manipulable visuals and embedded questions, not passive reading.
- **The learner model:** the signals captured (mastery, recent mistakes, accuracy) and how they drive
  personalization.
- **The role of AI:** an additive layer over a complete, AI-free course.
- **Domain:** single-variable calculus for self-directed learners (high-school AP / early
  undergraduate).

### Out of Scope

- **Curriculum authoring** (which theorems or problems to include); this is about *how* to teach, not
  *what*.
- **Multivariable calculus, proof-based analysis, or non-calculus subjects.**
- **Monetization, growth, and go-to-market.**
- **Classroom/LMS administration, grading, or teacher dashboards;** the focus is the learner.

---

## DOK 4: Spiky Points of View (SPOVs)

### SPOV 1: Wrong answers are the curriculum, not a failure state.

- Most apps treat a wrong answer as a dead end (flash red, show the answer, move on), discarding the
  richest signal in learning: a mistake is both the best diagnostic and the best teacher. Generic
  "wrong" feedback can even backfire; what teaches is naming the *specific* misconception and letting
  the learner struggle productively first. So SlopeWise gives each answer choice feedback that names the
  exact mistake behind it, draws on the learner's recent errors, and hints without revealing the answer.

### SPOV 2: Every learner deserves a different next problem.

- A textbook ships everyone the same exercises because paper can't do otherwise; software has no such
  excuse, yet most apps still serve one fixed set, wasting strong learners and burying weak ones.
  Learning is fastest when each problem targets what a learner actually struggles with, pitched just
  past their current ability. So SlopeWise chooses the next problem for *you*: a challenge round targets
  exactly what you missed and keeps surfacing your weakest topics. The next problem is a decision, not a
  default.

### SPOV 3: The interaction is the lesson; the prose is the caption.

- Calculus isn't a body of facts to read; it's a set of *dynamic* ideas (a tangent's slope changing as
  you slide along a curve, an area filling in under one) you can't absorb from a static paragraph.
  Active learning consistently beats reading and lecture even though it *feels* harder, so an app that
  optimizes for "feels good" optimizes for the wrong thing. So SlopeWise builds lessons around
  interactive visuals the learner manipulates, with the prose there to caption the interaction, not
  replace it.

### SPOV 4: The question is the lesson, not the test.

- Re-reading and highlighting are the most *popular* study strategies and among the *least* effective:
  testing yourself beats reviewing for durable memory, and re-reading inflates confidence even as recall
  fades. So SlopeWise treats the question as a teaching tool, not an afterthought: weaving low-stakes
  questions *inside* every lesson, mixing practice across everything you've finished, and using a daily
  streak to space it out. We test not to grade, but to teach.

---

## Experts

### Valerie Shute
- **Who:** Professor of Education, Florida State University; pioneer of *stealth assessment* and
  formative feedback.
- **Focus:** What makes feedback actually improve learning, and how to adapt it to the learner and task.
- **Why follow:** Her work on formative feedback is the clearest account of why response-specific,
  error-addressing feedback beats a bare "right/wrong," and how to name the misconception behind a
  wrong answer.
- **Where:** https://myweb.fsu.edu/vshute/ · https://scholar.google.com/scholar?q=Valerie+Shute+formative+feedback

### Kurt VanLehn
- **Who:** Professor of Computer Science, Arizona State University; intelligent-tutoring-systems
  researcher (Andes, Cordillera).
- **Focus:** How effective computer tutors are versus human tutors, and why interaction granularity
  matters.
- **Why follow:** His meta-analysis shows that well-designed software tutors can rival human ones, but
  only when they interact at a fine, step-by-step grain rather than just checking final answers.
- **Where:** https://scholar.google.com/scholar?q=Kurt+VanLehn+tutoring

### Robert C. Wilson
- **Who:** Cognitive scientist, University of Arizona, studying the computational principles of learning
  and decision-making.
- **Focus:** The mathematics of optimal training difficulty.
- **Why follow:** His work pins down the level of challenge that maximizes learning: an intermediate
  success rate, neither too easy nor too hard, rather than maximal or random difficulty.
- **Where:** https://www.nature.com/articles/s41467-019-12552-4

### Scott Freeman
- **Who:** Teaching professor emeritus of Biology, University of Washington; a leading voice in
  evidence-based STEM instruction.
- **Focus:** Active learning versus traditional lecture, measured across many controlled studies.
- **Why follow:** His PNAS meta-analysis is the strongest demonstration that *doing* beats *listening
  and reading* across college-level STEM, including math.
- **Where:** https://www.pnas.org/doi/10.1073/pnas.1319030111

### Louis Deslauriers
- **Who:** Director of Science Teaching and Learning, Harvard University.
- **Focus:** Measuring *actual* learning against students' *feeling* of learning.
- **Why follow:** His work shows that learners systematically misjudge effortful, active methods as
  worse even when they learn more, a warning against trusting how learning *feels*.
- **Where:** https://serl.fas.harvard.edu/

### Carl Wieman
- **Who:** Nobel laureate in Physics; professor of Physics & Education, Stanford; founder of **PhET
  Interactive Simulations**.
- **Focus:** Research-based interactive simulations for STEM and how they produce conceptual change.
- **Why follow:** PhET is the proof-of-concept at scale that well-designed interactive simulations
  teach abstract STEM ideas better than text, and often better than physical apparatus.
- **Where:** https://phet.colorado.edu/en/research

### Michelene T. H. Chi
- **Who:** Regents Professor, Arizona State University; learning scientist.
- **Focus:** Cognitive engagement and expertise; creator of the **ICAP** framework.
- **Why follow:** ICAP (Interactive > Constructive > Active > Passive) explains why passive reading is
  the weakest mode of engagement and ranks the climb toward more active, generative, and interactive
  learning.
- **Where:** https://chi.lab.asu.edu/

### Manu Kapur
- **Who:** Professor of Learning Sciences and Higher Education, ETH Zurich.
- **Focus:** **Productive failure**: designing for struggle before instruction.
- **Why follow:** His work reframes error and difficulty as the *mechanism* of deep learning: letting
  learners struggle and fail before instruction builds stronger conceptual understanding and transfer
  than being taught the method first.
- **Where:** https://kapur-lab.ethz.ch/

### Henry L. Roediger III & Jeffrey D. Karpicke
- **Who:** Roediger, Washington University in St. Louis; Karpicke, Purdue University.
- **Focus:** The **testing effect** / retrieval practice and the metacognitive illusions of studying.
- **Why follow:** Their experiments are the empirical core of retrieval practice: actively recalling
  material beats re-reading for durable memory, even though re-reading feels more effective at the time.
- **Where:** http://psychnet.wustl.edu/memory/ · https://www.purdue.edu/learninglab/

---

## DOK 3: Insights

### From the science of feedback
- **Insight 1:** Feedback isn't safe by default: a *third* of interventions backfire, so *what kind* of
  explanation you give decides whether it helps or hurts. The bar is not "show feedback" but "show
  feedback that points at the task and the specific error."
- **Insight 2:** The unit of useful feedback is the **distractor**, not the question: each wrong choice
  encodes a different misconception, so the right design writes one tailored message *per choice*.
- **Insight 3:** History turns feedback from *correction* into *coaching*: naming a recurring pattern is
  only possible if the system remembers the learner's past mistakes.

### From mastery, difficulty & personalization
- **Insight 1:** The biggest lever in education (Bloom's 2-sigma) is *individualization plus mastery*,
  so the highest-value thing software can copy from a tutor is not its tone but its **per-learner
  problem selection**.
- **Insight 2:** "Hard" has a measurable optimum (~85% success), turning "make it adaptive" from a vibe
  into a target the system can actually aim for.
- **Insight 3 (contrarian):** Scalability is no longer the constraint: since step-grained tutoring
  software rivals human tutors, the binding constraint is the **quality of the interaction model**, not
  access to a human.

### From active & interactive learning
- **Insight 1:** Engagement is a *ladder*, not a switch (ICAP): the design goal is always to move up a
  rung, from reading, to manipulating, to generating, to dialoguing.
- **Insight 2:** "Feels like learning" is a broken metric: optimizing for satisfaction or perceived
  clarity pulls toward passive, fluent reading, so design for *measured* mastery and accept that good
  friction feels worse.
- **Insight 3:** For *abstract* ideas, a simulation can beat the real thing: you can't hand a student a
  tangent line, but you can let them drag one, which makes calculus unusually well-suited to interactive
  widgets.

### From failure & retrieval
- **Insight 1:** Struggle is generative, not wasteful: letting a learner attempt and miss before
  revealing the method builds transferable understanding, so hints should *delay* the answer rather than
  give it.
- **Insight 2:** Being tested *is* an act of learning, so questions belong *inside* the lesson,
  distributed and interleaved, not quarantined into a final quiz.
- **Insight 3:** Two literatures (testing-effect confidence inflation; feeling-of-learning) converge on
  one warning: **subjective confidence is an unreliable signal of mastery**, so objective accuracy
  should drive decisions and be shown back to the learner.

---

## DOK 2: Knowledge Tree

### 1. The Science of Feedback

**Source: Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance.
*Psychological Bulletin*, 119(2), 254–284.**
- **DOK 1 Facts:**
  - Meta-analysis of **607 effect sizes** across **23,663 observations**.
  - Feedback helped on average (**d = 0.41**), but **over a third of interventions *reduced*
    performance.**
  - **Feedback Intervention Theory:** effectiveness drops as feedback shifts attention toward the *self*
    (praise/blame) and away from the *task*.
- **DOK 2 Summary:** Feedback isn't inherently good; keep it task- and error-focused, not self-focused.
- **Link:** https://doi.org/10.1037/0033-2909.119.2.254

**Source: Shute, V. J. (2008). Focus on Formative Feedback. *Review of Educational Research*, 78(1),
153–189.**
- **DOK 1 Facts:**
  - Distinguishes **verification** (right/wrong) from **elaboration** (explanatory information).
  - **Response-specific** elaboration that addresses the particular error beats verification or
    "answer-until-correct."
  - Effective feedback is **specific, timely, supportive**, and delivered in **manageable units**.
- **DOK 2 Summary:** A design spec for good feedback: short, specific, error-addressing messages that
  explain the *what/how/why*.
- **Link:** https://doi.org/10.3102/0034654307313795

### 2. Mastery, Personalization & Optimal Difficulty

**Source: Bloom, B. S. (1984). The 2 Sigma Problem. *Educational Researcher*, 13(6), 4–16.**
- **DOK 1 Facts:**
  - One-to-one **mastery tutoring** moved the average student **~2 standard deviations** up, above
    **~98%** of control students.
  - **Mastery learning** alone (feedback + correction + retest) yielded **~1 sigma**.
- **DOK 2 Summary:** Individualized pacing plus mastery is the largest known instructional lever; the
  challenge is approximating 1:1 tutoring at scale.
- **Link:** https://doi.org/10.3102/0013189X013006004

**Source: Wilson, R. C., Shenhav, A., Straccia, M., & Cohen, J. D. (2019). The Eighty Five Percent Rule
for optimal learning. *Nature Communications*, 10, 4646.**
- **DOK 1 Facts:**
  - The **optimal training error rate ≈ 15.87%** (≈ **85% accuracy**), neither too easy nor too hard.
  - Training at this difficulty improves **exponentially faster** than at a fixed difficulty.
- **DOK 2 Summary:** Gives "make it adaptive" a concrete numeric target: aim for roughly 85% success.
- **Link:** https://www.nature.com/articles/s41467-019-12552-4

**Source: VanLehn, K. (2011). The Relative Effectiveness of Human Tutoring, Intelligent Tutoring
Systems, and Other Tutoring Systems. *Educational Psychologist*, 46(4), 197–221.**
- **DOK 1 Facts:**
  - Human tutoring **d = 0.79**; intelligent tutoring systems **d = 0.76**, nearly equal.
  - Answer-based CAI is much weaker (**d ≈ 0.3**); effectiveness rises with **interaction
    granularity**.
- **DOK 2 Summary:** Software tutoring can rival a human, but only when it interacts at a fine,
  step-level grain.
- **Link:** https://doi.org/10.1080/00461520.2011.611369

### 3. Active & Interactive Learning

**Source: Freeman, S., et al. (2014). Active learning increases student performance in science,
engineering, and mathematics. *PNAS*, 111(23), 8410–8415.**
- **DOK 1 Facts:**
  - Meta-analysis of **225 undergraduate STEM studies**.
  - Active learning raised exam scores **0.47 SD**; lecture students were **1.5× more likely to fail**
    (33.8% vs 21.8%).
- **DOK 2 Summary:** The headline evidence that *doing* beats *listening and reading* in college-level
  STEM, including math.
- **Link:** https://www.pnas.org/doi/10.1073/pnas.1319030111

**Source: Deslauriers, L., McCarty, L. S., Miller, K., Callaghan, K., & Kestin, G. (2019). Measuring
actual learning versus feeling of learning. *PNAS*, 116(39), 19251–19257.**
- **DOK 1 Facts:**
  - In randomized intro physics, **active** students **learned more** but **rated their learning
    *lower*** than lecture peers.
  - Feeling of learning can be **anti-correlated** with actual learning.
- **DOK 2 Summary:** A warning against optimizing for perceived clarity; design for *measured* mastery
  instead.
- **Link:** https://www.pnas.org/doi/10.1073/pnas.1821936116

**Source: Chi, M. T. H., & Wylie, R. (2014). The ICAP Framework. *Educational Psychologist*, 49(4),
219–243.**
- **DOK 1 Facts:**
  - Ranks engagement **Passive < Active < Constructive < Interactive**, with learning rising up the
    hierarchy.
  - Modes are defined by **overt behaviors**, making engagement designable.
- **DOK 2 Summary:** A practical rubric: reading is the weakest mode; manipulating, answering, and
  dialoguing climb the ladder.
- **Link:** https://doi.org/10.1080/00461520.2014.965823

**Source: Wieman, C. E., Adams, W. K., & Perkins, K. K. (2008). PhET: Simulations That Enhance
Learning. *Science*, 322(5902), 682–683; and Banda, H. J., & Nzabahimana, J. (2021). *Physical Review
Physics Education Research*, 17(2), 023108 (a review of 31 studies).**
- **DOK 1 Facts:**
  - A **review of 31 studies** found PhET reliably improves conceptual understanding (one study showed a
    **37% higher** normalized gain).
  - For abstract concepts, well-designed simulations can beat **physical equipment**.
- **DOK 2 Summary:** The strongest proof that interactive simulations teach abstract STEM ideas better
  than exposition.
- **Link:** https://phet.colorado.edu/en/research · https://doi.org/10.1103/PhysRevPhysEducRes.17.023108

### 4. Retrieval Practice & Productive Failure

**Source: Roediger, H. L., & Karpicke, J. D. (2006). Test-Enhanced Learning. *Psychological Science*,
17(3), 249–255.**
- **DOK 1 Facts:**
  - After a week, learners who practiced **retrieval** recalled **61%** vs **40%** for re-readers,
    despite far less exposure.
  - Repeated studying **inflated confidence** while producing worse long-term retention.
- **DOK 2 Summary:** Testing is a learning event, not just a measurement, and confidence misleads.
- **Link:** https://doi.org/10.1111/j.1467-9280.2006.01693.x

**Source: Kapur, M. (2014). Productive Failure in Learning Math. *Cognitive Science*, 38(5),
1008–1022.**
- **DOK 1 Facts:**
  - Students who struggled with problems **before** instruction far exceeded direct-instruction peers on
    **conceptual understanding (d = 2.0)** and **transfer (d = 1.5)**.
  - They generated more solution attempts and none reached the canonical solution, yet learned more.
- **DOK 2 Summary:** Struggle and error are mechanisms of deep learning, not obstacles, which justifies
  hints that withhold the answer.
- **Link:** https://doi.org/10.1111/cogs.12107
