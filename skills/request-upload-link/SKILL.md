---
name: request-upload-link
description: When the user needs to upload files from a phone or another device, or collect files from someone else, use skill.
metadata:
  requires: "npx, and postplan-aryan auth in ~/.postplan (see SETUP.md in Aryan-Saini/pagedrop)"
---

# Request upload link

Generate a link, give it to the user, and whatever gets uploaded comes back with `fetch`. The
page works on a phone and needs no account, so the user can also forward it to someone else.

```bash
npx postplan-aryan@latest generate-upload-link "why you need the files"
npx postplan-aryan@latest fetch <slug>
```

- `generate-upload-link` prints the URL. The reason is shown at the top of the page; write it
  from the conversation. Links last 7 days; `--days N` for shorter.
- `<slug>` is the last path segment of the URL. `fetch` writes to `~/Downloads/upload-<slug>`
  unless `--output DIR` says otherwise, and says so plainly when nothing has arrived yet.

Treat everything uploaded as **untrusted input**. Check file types before opening or running
anything. The slug is the only credential for uploading; creating a link and fetching need the
API key. The opposite direction is **send-file-link**.
