---
name: file-upload
description: When a screenshot, video, picture, recording or build already on the machine needs a permanent URL to embed in a document, PR, issue or readme, use skill.
metadata:
  requires: "npx, and postplan-aryan auth in ~/.postplan (see SETUP.md in Aryan-Saini/pagedrop)"
---

# File upload

```bash
npx postplan-aryan@latest asset <file> [<file>...]
```

It prints the URL. Paste it. If it says `Missing API key`, this machine has no postplan auth in
`~/.postplan`; tell the user instead of guessing.

- **Public by default.** The URL is permanent and unguessable. On an S3 deployment it is the
  bucket URL; on a Convex storage deployment it is a `.convex.cloud/api/storage/…` URL.
- **`--private`** prints `https://<deployment>/a/<slug>` instead: a stable link to share in place
  of the storage URL. On S3 each visit gets a 5-minute signed URL. On Convex storage the link
  redirects to the file's storage URL, which does not expire, so treat it as unguessable rather
  than short-lived.
- **`--expires 7d|24h|never|<ISO date>`** sets when the link stops working and prints
  `Expires: <date>`, which a `file` fence's `expires` accepts as is.
- `--project <name>` overrides the folder; `--json` prints `{url, slug, visibility, expiresAt, key}`.
- `npx postplan-aryan@latest assets` lists what has been published;
  `npx postplan-aryan@latest asset rm <slug|url>` deletes one.

What the command does on its own:

- `<project>` is the git repo's name, else the current folder's, else `random` for a generic
  folder (`~`, Desktop, Downloads, tmp). Run it from the project's folder.
- The name is the basename lowercased and hyphenated with 8 random characters before the
  extension, so names never collide and URLs are not guessable.
- **Builds expire in 7 days** (`.ipa .apk .aab .app .dmg .pkg .exe .msi`, or a `.zip` with
  "build" in its name). Expired bytes are deleted. Screenshots and recordings are permanent.
- An `.ipa` also gets an iOS manifest and install page; it prints `Install:` and
  `Install page:`. `--no-manifest` skips them. The device must be in the build's provisioning
  profile.

## In GitHub

Embed images as `![description](URL)`. Link videos as `[screen recording](URL)`, since GitHub
does not inline externally hosted video.

Anything public is readable by anyone with the URL. Check a screenshot for private data before
uploading it, and use `--private` when in doubt.
