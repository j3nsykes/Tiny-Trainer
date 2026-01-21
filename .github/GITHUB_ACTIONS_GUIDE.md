# GitHub Actions Setup Guide for Tiny Trainer

This guide explains how to use GitHub Actions to automatically build Intel (x64) versions of Tiny Trainer.

## What is GitHub Actions?

GitHub Actions is a CI/CD (Continuous Integration/Continuous Deployment) service that automatically runs tasks when you push code to GitHub. Think of it as a cloud computer that builds your app for you.

## How It Works

1. You push code to GitHub
2. GitHub Actions detects the push
3. It spins up a macOS Intel machine
4. Installs Node.js and dependencies
5. Builds your app for Intel
6. Saves the built files (`.dmg` and `.zip`) for you to download

---

## Step-by-Step Setup

### Step 1: Commit and Push the Workflow File

The workflow file has already been created at `.github/workflows/build-intel.yml`.

```bash
# Add the workflow file to git
git add .github/workflows/build-intel.yml

# Commit it
git commit -m "Add GitHub Actions workflow for Intel builds"

# Push to GitHub
git push origin main
```

### Step 2: Verify Node.js Version

The workflow is set to use Node.js 20. Check your local version:

```bash
node --version
```

If it's different, edit `.github/workflows/build-intel.yml` and change line 24:
```yaml
node-version: '20'  # Change to your version (e.g., '18', '20', '22')
```

### Step 3: Watch the Build Run

1. Go to your GitHub repository: `https://github.com/j3nsykes/Tiny-Trainer`
2. Click the **"Actions"** tab at the top
3. You should see a workflow run starting (yellow dot = running)
4. Click on it to watch the build progress in real-time

### Step 4: Download the Built App

Once the build completes (green checkmark ✓):

1. Click on the completed workflow run
2. Scroll down to **"Artifacts"** section
3. Click `tiny-trainer-intel-[commit-hash]` to download
4. Unzip the downloaded file - it contains your `.dmg` and `.zip` files!

---

## Workflow Triggers

The workflow runs automatically on:
- ✅ **Push to main branch** - Every time you push code
- ✅ **Pull requests** - When someone creates a PR to main
- ✅ **Manual trigger** - Click "Run workflow" button in Actions tab

### How to Manually Trigger a Build

1. Go to **Actions** tab
2. Click **"Build Intel macOS"** workflow (left sidebar)
3. Click **"Run workflow"** dropdown button (top right)
4. Select branch (usually `main`)
5. Click green **"Run workflow"** button

---

## Understanding the Workflow File

Here's what each part does:

```yaml
name: Build Intel macOS
# This is the name shown in the Actions tab

on:
  push:
    branches: [ main ]
  # Runs when you push to main branch

  workflow_dispatch:
  # Allows manual triggering from GitHub UI

runs-on: macos-13
# Uses macOS 13 (Intel runner)
# Note: macos-14+ are ARM/Apple Silicon

steps:
  - name: Checkout code
    # Downloads your code from GitHub

  - name: Setup Node.js
    # Installs Node.js

  - name: Install dependencies
    # Runs 'npm ci' to install packages

  - name: Build Intel macOS app
    run: npm run build:mac:x64
    # Builds your app for Intel x64

  - name: Upload Intel build artifacts
    # Saves the .dmg and .zip files so you can download them
```

---

## Troubleshooting

### ❌ Build Fails with "Module not found"

**Fix:** Check if `package-lock.json` is committed to git:
```bash
git add package-lock.json
git commit -m "Add package-lock.json"
git push
```

### ❌ Build Fails with "Command not found: electron-builder"

**Fix:** Make sure `electron-builder` is in `devDependencies` (not just installed globally):
```bash
npm install --save-dev electron-builder
git add package.json package-lock.json
git commit -m "Add electron-builder to devDependencies"
git push
```

### ❌ Build Succeeds but No Artifacts

**Fix:** Check if `dist/` folder is in `.gitignore` - this is correct, but make sure the workflow completed fully. Look for the "Upload Intel build artifacts" step - it should be green.

### ⚠️ Warning: "Skipping notarization"

This is **normal** and **expected** in CI builds. Notarization requires Apple Developer credentials. For automated builds, we skip it. You can notarize manually later if needed for distribution.

---

## Advanced: Building for Multiple Platforms

Want to build for both Intel and Apple Silicon? Create a matrix:

```yaml
strategy:
  matrix:
    include:
      - os: macos-13
        arch: x64
        command: build:mac:x64
      - os: macos-14
        arch: arm64
        command: build:mac:arm64

runs-on: ${{ matrix.os }}

steps:
  # ... same steps as before ...
  - name: Build macOS app
    run: npm run ${{ matrix.command }}
```

---

## Viewing Build Logs

If a build fails:

1. Click the failed workflow run (red X)
2. Click the failed step (e.g., "Build Intel macOS app")
3. Expand the log to see error messages
4. Look for red error text - this tells you what went wrong

---

## Cost & Limits

**GitHub Actions is FREE for public repositories!**

Limits for free accounts:
- ✅ 2,000 minutes/month of build time
- ✅ macOS builds use 10× multiplier (1 minute = 10 minutes)
- ✅ Your Intel build takes ~5-10 minutes = 50-100 minutes used

**You get plenty of free builds per month!**

---

## Next Steps

### 1. Create a Release Workflow

Want to automatically create GitHub Releases? Edit the workflow to add:

```yaml
- name: Create GitHub Release
  if: startsWith(github.ref, 'refs/tags/v')  # Only on version tags
  uses: softprops/action-gh-release@v1
  with:
    files: |
      dist/*.dmg
      dist/*.zip
```

Then tag a version:
```bash
git tag v2.0.1
git push origin v2.0.1
```

### 2. Add Build Status Badge

Add this to your README.md to show build status:

```markdown
[![Build Intel macOS](https://github.com/j3nsykes/Tiny-Trainer/actions/workflows/build-intel.yml/badge.svg)](https://github.com/j3nsykes/Tiny-Trainer/actions/workflows/build-intel.yml)
```

---

## Quick Reference

| Task | Command/Action |
|------|----------------|
| **Manual build** | Go to Actions tab → Run workflow |
| **View builds** | Go to Actions tab → Click workflow name |
| **Download build** | Click workflow run → Scroll to Artifacts |
| **Check logs** | Click workflow run → Click failed step |
| **Cancel build** | Click running workflow → Cancel button |

---

## Need Help?

- 📚 [GitHub Actions Documentation](https://docs.github.com/en/actions)
- 📚 [Electron Builder CI Guide](https://www.electron.build/multi-platform-build.html)
- 🐛 Check the Actions tab for error logs
- 💬 Look for error messages in the build output

---

## Summary

1. ✅ Workflow file created: `.github/workflows/build-intel.yml`
2. ✅ Push to GitHub: `git push`
3. ✅ Go to Actions tab to watch build
4. ✅ Download artifacts when complete
5. ✅ Builds run automatically on every push!

You now have automated Intel builds! 🎉
