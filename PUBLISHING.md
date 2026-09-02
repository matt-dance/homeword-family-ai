# Publish to GitHub as `homeword-family-ai`

All project code is on the `main` branch. To put it on GitHub:

## Option A — Cursor (easiest)

In the agent view, click **Create repo**, name it **`homeword-family-ai`**, and confirm. Cursor publishes this branch to your account.

Then locally:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/homeword-family-ai.git
cd homeword-family-ai
./scripts/install.sh
```

## Option B — GitHub website

1. Open [github.com/new](https://github.com/new)
2. Repository name: **`homeword-family-ai`**
3. Create the repo **without** a README (this repo already has one)
4. Push from a machine that has this code:

```bash
git remote add github https://github.com/YOUR_GITHUB_USERNAME/homeword-family-ai.git
git push -u github main
```

## Run locally after clone

```bash
./scripts/install.sh          # Docker (recommended)
# or see README.md → Native Development Install
```

Open **http://localhost** and complete the setup wizard.

## Verify voice features (optional)

```bash
./scripts/test-voice.sh       # mic / Whisper STT
./scripts/test-read-aloud.sh  # Listen button / Piper TTS
```
