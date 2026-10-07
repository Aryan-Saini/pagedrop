---
title: Schema for a small task tracker
---

Five tables: organisations own projects, projects hold tasks, users are assigned tasks and write comments. The `er` fence draws the tables and joins each reference at the exact field rows.

## Tables

```er
{
  "title": "Task tracker schema",
  "note": "PK primary key, FK foreign key; cardinality reads from the referencing side",
  "entities": [
    { "name": "orgs", "fields": [
      { "name": "id", "type": "uuid", "key": "pk" },
      ["name", "text"],
      ["plan", "text"],
      ["created_at", "timestamptz"]
    ] },
    { "name": "projects", "fields": [
      { "name": "id", "type": "uuid", "key": "pk" },
      { "name": "org_id", "type": "uuid", "key": "fk" },
      ["name", "text"],
      ["archived", "bool"]
    ] },
    { "name": "tasks", "fields": [
      { "name": "id", "type": "uuid", "key": "pk" },
      { "name": "project_id", "type": "uuid", "key": "fk" },
      { "name": "assignee_id", "type": "uuid", "key": "fk" },
      ["title", "text"],
      ["status", "task_status"],
      ["due", "date"]
    ] },
    { "name": "users", "fields": [
      { "name": "id", "type": "uuid", "key": "pk" },
      { "name": "org_id", "type": "uuid", "key": "fk" },
      ["email", "citext"],
      ["name", "text"]
    ] },
    { "name": "comments", "fields": [
      { "name": "id", "type": "uuid", "key": "pk" },
      { "name": "task_id", "type": "uuid", "key": "fk" },
      { "name": "author_id", "type": "uuid", "key": "fk" },
      ["body", "text"],
      ["created_at", "timestamptz"]
    ] }
  ],
  "links": [
    { "from": "projects.org_id", "to": "orgs.id" },
    { "from": "tasks.project_id", "to": "projects.id" },
    { "from": "tasks.assignee_id", "to": "users.id", "card": "N:0..1" },
    { "from": "users.org_id", "to": "orgs.id" },
    { "from": "comments.task_id", "to": "tasks.id" },
    { "from": "comments.author_id", "to": "users.id" }
  ]
}
```

`tasks.assignee_id` is nullable, so its far end reads `0..1`. `tasks` and `users` sit two columns apart, so that reference runs around the outside of the grid rather than through `projects`.

## A one-to-one split

```er
{
  "title": "Profile split out of users",
  "compact": true,
  "entities": [
    { "name": "users", "fields": [{ "name": "id", "type": "uuid", "key": "pk" }, ["email", "citext"]] },
    { "name": "profiles", "fields": [{ "name": "user_id", "type": "uuid", "key": "fk" }, ["bio", "text"], ["avatar", "url"]] }
  ],
  "links": [{ "from": "profiles.user_id", "to": "users.id", "card": "1:1" }]
}
```
