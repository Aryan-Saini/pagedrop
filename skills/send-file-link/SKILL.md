---
name: send-file-link
description: When the user wants a downloadable link to files, images, videos or PDFs so they or someone else can preview and download them on another device, like a phone, use skill.
metadata:
  requires: "npx, and postplan-aryan auth in ~/.postplan (see SETUP.md in Aryan-Saini/postplan-convex)"
---

# Send file link

Send files from this machine to a page the user can open on a phone. Images, video and audio
show inline; PDFs and text preview on tap; everything downloads.

```bash
npx postplan-aryan@latest send <file> [<file>...] --reason "what these are"
```

- Prints one line: the URL. Give it to the user directly.
- Any number of files, any type. `--reason` is the page title; write it from the conversation
  rather than asking.
- Links last 7 days; `--days N` for shorter.

Run it when the user asks for a file; "the file is at /path" is useless from a phone. Confirm
exact paths when the request is ambiguous, and never substitute a similarly named file.

The link is the credential: anyone holding it can read the files. The opposite direction is
**request-upload-link**.
