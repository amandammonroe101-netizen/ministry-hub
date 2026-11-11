# Auto-updates — how to ship a new version

This app uses [`electron-updater`](https://www.electron.build/auto-update) to
pull new releases from **GitHub Releases**. When you publish a new version,
every installed copy checks for it ~3 seconds after launch, downloads it in
the background, and prompts the user to restart when the download finishes.

## One-time setup

### 1. Create a GitHub repo for the app

Push this codebase to GitHub if it isn't already there. The repo can be
private — `electron-updater` supports private repos as long as the user has
read access *or* you use the public-feed mode.

For the simplest path (public releases, no auth on user machines), make the
repo public.

### 2. Replace the placeholders in `package.json`

In `package.json` under `build.publish`, replace these two strings with the
real values:

```json
"publish": [
  {
    "provider": "github",
    "owner": "REPLACE_WITH_YOUR_GITHUB_USERNAME",
    "repo":  "REPLACE_WITH_YOUR_REPO_NAME",
    "releaseType": "release"
  }
]
```

Example: if the repo lives at `github.com/amandamonroe/ministry-hub`, then
`owner: "amandamonroe"`, `repo: "ministry-hub"`.

### 3. Create a GitHub personal-access token (PAT)

This token lets your local machine upload release artifacts. You only need
it ON YOUR DEV MACHINE — the users never see it.

1. Visit https://github.com/settings/tokens
2. **"Generate new token (classic)"**
3. Scopes: tick **`repo`** (full control of private repos) — even for
   public repos, `repo` is what electron-builder needs to create releases.
4. Copy the token (`ghp_…`)
5. Export it in your shell **before** running a release command:
   ```sh
   export GH_TOKEN=ghp_your_actual_token_here
   ```
   On macOS, you can persist this by adding the line to `~/.zshrc`. Don't
   commit the token to the repo.

## How to ship an update

Every time you want to push changes to your installed users:

### 1. Bump the version in `package.json`

```json
"version": "1.0.1"   // was 1.0.0
```

Use [semver](https://semver.org): `1.0.0` → `1.0.1` for bug fixes, `1.0.0` →
`1.1.0` for new features, `1.0.0` → `2.0.0` for breaking changes. Doesn't
matter much — just bump *something* every release or `electron-updater`
won't see it as a new version.

### 2. Make sure `GH_TOKEN` is exported

```sh
echo $GH_TOKEN
# Should print your token. If it prints nothing, re-export.
```

### 3. Run a release command

For just your own platform:
```sh
npm run release:mac      # macOS — produces .dmg + .zip
npm run release:win      # Windows — produces NSIS .exe + portable .exe
npm run release:linux    # Linux — produces .AppImage + .deb
```

For all three platforms (you'll need to be on macOS to build for macOS, but
Windows + Linux can be cross-built from macOS):
```sh
npm run release:mac && npm run release:win && npm run release:linux
```

Each command:
1. Builds the React client (`client/dist/`)
2. Packages the Electron app for the target platform
3. **Publishes** the artifacts + a `latest.yml` metadata file to a GitHub
   release tagged `v1.0.1` (matching your `package.json` version)

### 4. Publish the GitHub release

`electron-builder` creates the release as a **draft** by default. Go to your
repo's Releases page on GitHub:

```
https://github.com/<owner>/<repo>/releases
```

Click the draft release, write release notes (optional but nice), and hit
**"Publish release"**. Once it's published, every running copy of the app
will see the update on its next launch.

## What the user sees

1. They open the app.
2. ~3 seconds after launch, the app checks GitHub Releases in the
   background.
3. If a newer version exists, it downloads silently. The user keeps
   working — no interruption.
4. When the download finishes, a native macOS / Windows dialog pops up:
   > **Update ready**
   > Elite Journal Hub 1.0.1 is ready to install.
   > A new version has been downloaded. Restart the app now to apply the
   > update, or keep working and it'll install automatically the next time
   > you quit.
   > **\[Restart now\]   \[Later\]**
5. "Restart now" → app quits, installer runs silently, app relaunches on
   the new version.
   "Later" → next time the user fully quits the app, the update applies
   automatically. They re-open into the new version.

## Skipping the update check in dev

The auto-updater is disabled when `NODE_ENV === 'development'`, so running
`npm run dev` will never try to update itself. You won't see the prompts
until you build + install a real release.

## Debugging

If updates aren't firing for users, ask them to send their log file:

- **macOS**: `~/Library/Logs/Elite Journal Hub/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Elite Journal Hub\logs\main.log`
- **Linux**: `~/.config/Elite Journal Hub/logs/main.log`

The log includes every "checking for update", "update available", error,
download progress percent, and "update downloaded" event. Almost every
failure mode (auth, network, missing publish config, wrong owner/repo)
shows up here.

## Code-signing note

For the smoothest user experience — especially on macOS — you'll
eventually want to **code-sign and notarize** your releases. Without
signing, macOS users see a "downloaded from the internet, can't verify the
developer" warning the first time they run the app. Auto-updates work
either way, but signing makes the install smoother.

This is a bigger setup involving Apple Developer ID certificates and is
optional for distributing inside a church or small team. Search
"electron-builder code signing" when you're ready to ship publicly.
