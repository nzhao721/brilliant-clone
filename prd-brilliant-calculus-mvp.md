# PRD: Brilliant-Style Calculus MVP

## Product Summary

Build an interactive learning app for high school students with strong algebra skills but no calculus background. The MVP introduces the core idea of derivatives through short, visual, interactive lessons that build intuition before formal notation.

The product should feel approachable, guided, and rewarding. Students should be able to learn in short sessions, get immediate feedback, understand mistakes, and return later without losing progress.

## Target User

### Persona

**Name:** Maya

**Age:** 16

**Education:** High school junior

**Math Background:** Solid algebra foundation, comfortable with functions, graphs, slope, equations, and basic word problems.

**Calculus Background:** None.

**Goal:** Understand what a derivative means before taking calculus or while preparing for class.

### Pain Points

- Calculus feels abstract and intimidating.
- Textbook explanations move too quickly.
- She does not know why derivative rules work.
- She needs visual and interactive examples, not just formulas.

## MVP Goals

The MVP should help a student:

- Understand derivatives as rates of change and slopes of tangent lines.
- Connect algebraic functions to visual graph behavior.
- Practice through interactive questions and guided feedback.
- Receive explanations for correct and incorrect answers.
- Track lesson completion and resume progress after logging back in.

## Technical Constraints

### Required Stack

- **Frontend:** React.
- **Backend / Platform:** Firebase.
- **Hosting:** Firebase Hosting free tier.
- **Authentication:** Firebase Authentication free tier.
- **Database:** Cloud Firestore free tier.
- **Storage:** Avoid Firebase Storage for the MVP unless absolutely necessary. Lesson content can live in code or Firestore.

### Free-Tier Requirement

The MVP must use only Firebase features available on free plans. It must not depend on paid Firebase extensions, Cloud Functions requiring billing, paid third-party APIs, or usage patterns that require enabling a billing account.

### Recommended Architecture

- React single-page application hosted on Firebase Hosting.
- Firebase Authentication for email/password sign up, login, logout, and session persistence.
- Cloud Firestore for user progress, lesson metadata, and answer attempt history.
- Static lesson content stored directly in the React app as JSON or TypeScript data for the MVP to reduce Firestore reads and stay within free-tier limits.
- Progress writes should be minimal and event-based, such as saving after lesson step completion instead of every interaction.

### Firebase Usage Guardrails

- Use Firestore security rules so users can only read and write their own progress.
- Keep lesson assets lightweight and bundled with the app where possible.
- Avoid server-side logic that requires Cloud Functions.
- Avoid analytics, monitoring tools, paid extensions, or third-party APIs that could introduce paid usage.
- Design Firestore reads carefully so the dashboard does not repeatedly fetch large lesson data.

## Core User Stories

### Authentication

- As a student, I want to create an account so that my learning progress is saved.
- As a student, I want to log in so that I can access my lessons and progress.
- As a student, I want to log out so that my account stays private.
- As a returning student, I want to log back in and resume where I left off.

### Lessons

- As a student, I want to see a list of available lessons so that I know what to study next.
- As a student, I want short interactive lessons so that I can learn one concept at a time.
- As a student, I want visual examples using graphs so that I can connect derivatives to slope and change.
- As a student, I want to answer questions during lessons so that I can check my understanding.

### Feedback and Explanations

- As a student, I want to know immediately whether my answer is correct or incorrect.
- As a student, I want an explanation of why my answer was correct so that I reinforce the concept.
- As a student, I want an explanation of why my answer was incorrect so that I can fix my misunderstanding.
- As a student, I want hints when I am stuck so that I can keep learning without giving up.

### Progress

- As a student, I want to see which lessons I have completed.
- As a student, I want to see my overall progress through the derivative introduction course.
- As a student, I want to see my learning streak so that I stay motivated to practice daily.
- As a student, I want to see how many minutes I study each day so that I understand my learning habits.
- As a student, I want my progress saved automatically so that I can continue later.

## MVP Lesson Set

The MVP should include 6-8 short lessons:

1. **What Changes?** Review functions and introduce changing outputs as inputs change.
2. **Slope Refresher** Connect derivative intuition to familiar algebra slope.
3. **Average Rate of Change** Show slope between two points on a curve.
4. **Zooming In on Curves** Show how a curve can look almost linear near one point.
5. **Tangent Lines** Introduce tangent lines as the best local slope estimate.
6. **Derivative as Instantaneous Slope** Define derivative as the slope at a specific point.
7. **Positive, Negative, and Zero Derivatives** Connect derivative signs to increasing, decreasing, and flat graph behavior.
8. **Derivative Intuition Challenge** Mixed review using graphs, slopes, tangent lines, and rates of change.

## Functional Requirements

### Account System

- Users can sign up with email and password.
- Users can log in with email and password.
- Users can log out.
- Authenticated users have progress tied to their account.

### Lesson Experience

- Lessons are short, ideally 5-8 minutes each.
- Each lesson includes explanation cards, visuals, and interactive questions.
- Questions can include multiple choice, graph selection, drag interactions, numeric input, or matching.
- Users receive immediate feedback after submitting an answer.
- Users can continue after answering correctly or reviewing an incorrect answer explanation.

### Explanations

Each question should support:

- Correct answer explanation.
- Incorrect answer explanation.
- Optional hint before submission.
- Concept reference back to the lesson.

### Progress Tracking

The app should track:

- Completed lessons.
- Current lesson.
- Current step within a lesson.
- Question attempts.
- Correct and incorrect answers.
- Overall course completion percentage.
- Current learning streak in consecutive days.
- Longest learning streak.
- Minutes spent learning per day.
- Last active learning date.

### Resume Behavior

When a user logs back in:

- They should return to their dashboard.
- The dashboard should show the next recommended lesson.
- If they left mid-lesson, they should be able to resume from the last saved step.

## Data Model

### `users/{userId}`

- `displayName`
- `email`
- `createdAt`
- `lastActiveAt`
- `currentStreakDays`
- `longestStreakDays`
- `lastLearningDate`

### `users/{userId}/progress/{lessonId}`

- `lessonId`
- `completed`
- `currentStep`
- `score`
- `lastUpdatedAt`

### `users/{userId}/attempts/{attemptId}`

- `lessonId`
- `questionId`
- `selectedAnswer`
- `correct`
- `createdAt`

### `users/{userId}/dailyActivity/{date}`

- `date`
- `minutesSpent`
- `lessonsStarted`
- `lessonsCompleted`
- `questionsAnswered`
- `lastUpdatedAt`

## Success Metrics

- Account creation completion rate.
- Lesson 1 completion rate.
- Percentage of users completing at least 3 lessons.
- Percentage of users completing all MVP lessons.
- Average number of attempts per question.
- Return rate after first session.
- Percentage of users resuming a lesson after logging back in.
- Average daily minutes spent learning.
- Percentage of users with a 3-day learning streak.

## MVP Acceptance Criteria

- A new user can create an account, log in, start Lesson 1, answer interactive questions, and receive feedback.
- A logged-in user's lesson progress is saved automatically.
- A user can log out, log back in, and resume progress.
- A dashboard shows completed lessons and the next recommended lesson.
- A dashboard shows the user's current learning streak and minutes spent learning today.
- At least 6 short derivative-introduction lessons are available.
- Every interactive question includes feedback for correct and incorrect answers.
- All MVP functionality works without paid infrastructure or paid Firebase features.
