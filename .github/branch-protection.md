## Branch protection for `main`

GitHub branch protection is configured in repository settings, not in code.

Apply these settings to require branch-based changes before updating `main`, while keeping approvals optional:

1. Go to **Settings -> Branches -> Add branch protection rule**.
2. Set **Branch name pattern** to `main`.
3. Enable **Require a pull request before merging**.
4. Set **Required approvals** to `0` (or leave approvals disabled).
5. Enable **Require status checks to pass before merging** and select `Build Validation`.
6. Enable **Do not allow bypassing the above settings** (recommended).
7. Save the rule.

After this, direct publishing to `main` is blocked and only branch/PR-based merges can update `main`.

## Vercel preview prerequisites

Add these repository secrets so PR preview deployments can run:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
