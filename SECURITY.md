# Security

## Reporting a problem
Please report security issues privately using GitHub's **Report a vulnerability** button on the repository's Security tab, rather than opening a public issue.

## How the app protects boards
- **Private by default.** Every device signs in anonymously and gets a hidden id. A board can only be read or changed by its members; this is enforced on the server by [`firestore.rules`](firestore.rules), not by the app.
- **Invite links expire.** Joining needs an invite token that lasts 7 days and can be cancelled. Everyone who joins appears in the board's people list, and the owner can remove people.
- **Validated data.** The rules check every field's type and size (text, names, photos, dates), allow only JPEG photos made by the app, and refuse unknown fields.
- **No third-party code at runtime.** The Firebase SDK is a pinned copy in [`vendor/firebase`](vendor/firebase) served from this site. A Content Security Policy allows only this site's scripts and Firebase's endpoints.
- **No HTML injection.** All text is inserted as text nodes; the code never uses `innerHTML`. Linting (`eslint-plugin-no-unsanitized`, `eslint-plugin-security`) and Semgrep enforce this.
- **Dependencies are watched.** CI runs `npm audit`, Semgrep and CodeQL; Dependabot proposes updates weekly.

## Checking it yourself
```
npm ci
npm run lint          # ESLint with security plugins
npm audit             # known vulnerabilities in dev tools
npm run test:rules    # 60+ security-rule tests in the Firestore emulator
```
