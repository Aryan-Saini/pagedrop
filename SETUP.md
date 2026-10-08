# Set up postplan (for agents)

You are an agent setting up postplan for your user. When you finish, the user has their own
postplan server on their Convex account, the CLI is authenticated on this machine, and four
skills are installed:

- **html-communication**: write a plan, spec or report as Markdown and publish it as a link.
- **file-upload**: publish a screenshot, video or build and get a permanent URL.
- **send-file-link**: send files to a page the user can open on a phone.
- **request-upload-link**: a page for sending files in from a phone or another person.

Follow the steps in order. Run every command yourself. Stop and ask the user only where a step
says to. Never print the API key back into the chat after step 5.

## 0. Ask one question

Ask the user:

> Where should postplan store files? **Convex storage** (recommended: nothing else to set
> up, uses your Convex account's file storage) or **S3** (your own AWS bucket; needs the AWS
> CLI logged in and permission to create a bucket and an IAM user).

Remember the answer as `STORAGE=convex` or `STORAGE=s3`. Both run the same server and CLI;
the server picks S3 when `S3_BUCKET` is set and Convex storage otherwise.

## 1. Check the machine

```bash
node --version   # must be 20 or newer
git --version
```

If Node is missing or older than 20, tell the user and stop. For `STORAGE=s3` also run
`aws sts get-caller-identity`; if it fails, ask the user to log in to the AWS CLI (or switch to
Convex storage) and wait.

## 2. Get the server code

```bash
git clone https://github.com/Aryan-Saini/postdraft.git ~/postplan-server
cd ~/postplan-server
npm install
```

If `~/postplan-server` already exists and is this repo, `git pull` instead. Run every later
`npx convex` command from this folder.

## 3. Log in to Convex

```bash
npx convex login status
```

If that says the machine is not logged in, start the login in the background and give the user
the link it prints:

```bash
npx convex login --no-open --login-flow poll --device-name postplan
```

Tell the user: "Open this link and approve the login. Make a free Convex account there if you
do not have one." Wait for the command to finish, then run `npx convex login status` again. It
lists the teams; if there is more than one, ask the user which to use.

## 4. Create the project and deploy

```bash
npx convex dev --once --configure new --team <team-slug> --project postplan --dev-deployment cloud
npx convex deploy -y
```

The first command creates the project; the second pushes the server to its production
deployment. The deploy output contains `https://<name>.convex.cloud`. The server's public URL
is the same name on `.convex.site`: `https://<name>.convex.site`. Call it `SITE_URL`.

If the project name is taken, use `postplan-<something>`.

## 5. Lock the server with an API key

```bash
KEY=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
npx convex env set --prod POSTPLAN_API_KEY "$KEY"
npx convex env set --prod POSTPLAN_PUBLIC_BASE_URL "$SITE_URL"
npx postplan-aryan@latest auth set "$KEY" --api-url "$SITE_URL"
```

Without the key anyone who finds the URL could publish to the user's server. The key is saved
in `~/.postplan/credentials.json` on this machine; that is the only copy the user needs.

## 6. Storage

**Convex storage:** nothing to do. Skip to step 7.

**S3:** create a bucket, a policy that lets anonymous readers get only `public/`, a lifecycle
rule for expiring builds, and an IAM user limited to the bucket. Use one bucket for everything.
Pick a globally unique name and the user's usual region.

```bash
BUCKET=postplan-<random-suffix>
REGION=us-east-1
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  $( [ "$REGION" = us-east-1 ] || echo --create-bucket-configuration LocationConstraint="$REGION" )
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{\"Effect\": \"Allow\", \"Principal\": \"*\", \"Action\": \"s3:GetObject\",
                   \"Resource\": \"arn:aws:s3:::$BUCKET/public/*\"}]}"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{"ID": "expire-app-builds-7d", "Status": "Enabled",
             "Filter": {"Tag": {"Key": "autodelete", "Value": "7d"}},
             "Expiration": {"Days": 7}}]}'
aws iam create-user --user-name postplan-server
aws iam put-user-policy --user-name postplan-server --policy-name postplan-bucket --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{\"Effect\": \"Allow\",
    \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:PutObjectTagging\", \"s3:DeleteObject\"],
    \"Resource\": \"arn:aws:s3:::$BUCKET/*\"}]}"
aws iam create-access-key --user-name postplan-server
```

Take `AccessKeyId` and `SecretAccessKey` from the last command's output and set them on the
server. Do not echo them into the chat.

```bash
npx convex env set --prod S3_BUCKET "$BUCKET"
npx convex env set --prod S3_REGION "$REGION"
npx convex env set --prod S3_PREFIX drafts
npx convex env set --prod S3_ACCESS_KEY_ID <AccessKeyId>
npx convex env set --prod S3_SECRET_ACCESS_KEY <SecretAccessKey>
npx convex env set --prod ASSETS_BUCKET "$BUCKET"
npx convex env set --prod ASSETS_REGION "$REGION"
```

Drafts live under `drafts/`, which is not public; they are served only through the server.

## 7. Install the skills

```bash
npx postplan-aryan@latest skills install
```

This writes to `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex and others),
whichever exist. If your harness reads skills from somewhere else, add `--dir <that folder>`.
It never replaces a same-named skill it did not install; it says `Skipped` for those. Tell the
user about any skip.

The skills keep themselves current: every skill runs `npx postplan-aryan@latest`, and when a
release changes the skills, the CLI reinstalls them and prints `Re-read the SKILL.md`. When you
see that line, reread the skill before you continue.

## 8. Prove it works

```bash
cd "$(mktemp -d)"
cat > hello.md <<'MD'
---
title: postplan is set up
status: Working
---

This page was published from your machine by your agent.

## What you can ask for

- A plan, spec or report as a link
- A permanent URL for a screenshot or video
- A link to send files to your phone
- A link to upload files from your phone
MD
npx postplan-aryan@latest upload hello.md
printf 'ok' > check.txt && npx postplan-aryan@latest asset check.txt --private --expires 24h
```

Open neither in a browser. Check both URLs with `curl -sL -o /dev/null -w '%{http_code}\n'`;
both must print `200`. Then delete the test asset with
`npx postplan-aryan@latest asset rm <the /a/ URL>`.

If anything fails, read the error, fix the step it points to and rerun from there. Common
causes: `Unauthorized` means the key in step 5 does not match; `S3 env vars missing` or a 503
on assets means step 6 is incomplete.

## 9. Report back

Tell the user, briefly:

- the link to the test page from step 8
- which storage they are on
- the four things they can now ask for, in their own words: "make this a doc", "give me a link
  to this screenshot", "send this file to my phone", "give me a link to upload a file"

Your agent may need a restart before it sees newly installed skills.

## Later

- **Update the server** after a new release: `cd ~/postplan-server && git pull && npm install && npx convex deploy -y`.
  The CLI and skills update themselves; the server does not.
- **Another machine:** install Node, then run step 5's `auth set` line with the same key and
  `SITE_URL`, then step 7.
- **Switching storage** later applies to new uploads only. Existing files stay where they were
  written and keep working as long as that storage is configured.
