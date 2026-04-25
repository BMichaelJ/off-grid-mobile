# Project Instructions

## Pre-Commit Quality Gates

All quality gates run automatically via Husky on every `git commit`, scoped to the file types you staged:

| Staged file type | Checks that run automatically |
|---|---|
| `.ts` / `.tsx` / `.js` / `.jsx` | eslint (staged only), `tsc --noEmit`, `npm test` |
| `.swift` | swiftlint (staged only), `npm run test:ios` |
| `.kt` / `.kts` | `compileDebugKotlin` (type check), `lintDebug`, `npm run test:android` |

**Requirements:**
- SwiftLint: `brew install swiftlint` (skipped with a warning if not installed)
- Android checks require the Gradle wrapper in `android/`

Before writing new code, ensure tests exist for your changes. If the hook fails, fix the issue and recommit — never skip with `--no-verify`.

## Push = Create PR + Address Review

When asked to push code, follow this full workflow:

0. ensure that you are on a branch that is specific to this change i.e feat/new-feature or fix/bug-fix or docs/update-readme or chore/update-dependencies, or test/new-test, etc
1. Push the branch to the remote (`git push -u origin <branch>`)
2. Create a PR using `gh pr create`. Ensure that you are adhering to the PR template. **Do NOT include "Generated with Claude Code" or any AI attribution in PR descriptions.**
3. Wait for GitHub Actions CI to start. Poll with `gh pr checks <pr>` until all four jobs (`typecheck`, `test`, `lint`, `android-build`) report a status. If any fail, fix and re-push before reading reviewer comments.
4. Once CI is green, wait for Gemini to post (`gh api repos/{owner}/{repo}/pulls/{number}/comments` + `.../reviews`).
5. Address every Gemini review comment — fix the code, or reply on the thread explaining why it's fine. Resolve the conversation either way.
6. Push the fixes; pre-commit gates re-run. Comment `/gemini review` to re-trigger Gemini.
7. Loop until CI is green and Gemini has nothing blocking.
8. Report what was changed in response to the review.

## CI Review Loop

After pushing, loop until everything below is green or addressed.

### GitHub Actions CI (merge-blocking)

The `CI` workflow runs four jobs on every push and PR targeting `main` or `wildlife-reid`:

| Job | What it checks |
|---|---|
| `typecheck` | `tsc --noEmit` |
| `test` | Jest unit + integration tests with coverage |
| `lint` | ESLint + `gradlew :app:lintDebug` + SwiftLint |
| `android-build` | Full debug Gradle build |

If any job fails, fix locally (re-run `npx tsc --noEmit && npm test && npm run lint` to mirror CI), push, and wait for the next run.

### Gemini Code Assist (advisory)

Auto-reviews every PR on open and on `/gemini review`. Posts a summary comment plus line-level review comments tagged by severity.

**Workflow:**
1. Push → wait for the Gemini summary + comments to land (~1-2 min after PR open or `/gemini review`).
2. Pull down comments: `gh api repos/{owner}/{repo}/pulls/{number}/comments` and `.../reviews`.
3. Address every comment — fix the code, or reply on the comment thread explaining why it's a non-issue. Resolve the conversation.
4. Re-run pre-commit gates locally, push fixes.
5. Comment `/gemini review` on the PR to trigger a fresh pass.
6. Repeat until Gemini's findings are addressed.

Gemini findings are advisory — they don't block merge themselves, but unaddressed legitimate findings should block merge in human review.

### Codex 5.5 (on-demand second opinion)

Use for scoped deep reviews when warranted (foundational PRs, risky refactors, pre-merge sanity passes). Not part of the routine PR loop.

```bash
codex exec -s read-only --skip-git-repo-check "<scoped review prompt>"
```

File substantive findings to `kb/wildlife-reid-mobile/outputs/reports/`.

### Human review (final gate)

Final approval required before merging into `wildlife-reid` or `main`.

### Not currently installed

Codecov and SonarCloud are referenced in some upstream docs but are **not** wired up on this fork. If reinstated later, document them here. CodeQL (free, one-click at `Settings → Code security`) is a reasonable alternative if SAST is desired.
