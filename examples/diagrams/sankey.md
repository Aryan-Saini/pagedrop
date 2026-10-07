---
title: Flows
---

The `sankey` fence draws quantities moving between stages. Band width is the flow, node height is
the total through that node, and each band takes the colour of the node it leaves.

## Request pipeline

Where one day of requests to an API goes after the load balancer.

```sankey
{
  "title": "Requests per day by path",
  "note": "Cache hit rate 62% of API reads; 4.1M requests reach the database",
  "format": "compact",
  "nodes": [
    { "id": "ingress", "label": "Ingress" },
    { "id": "auth", "label": "Auth" },
    { "id": "static", "label": "Static CDN" },
    { "id": "reject", "label": "Rejected", "tone": "bad" },
    { "id": "api", "label": "API" },
    { "id": "cache", "label": "Cache hit", "tone": "good" },
    { "id": "db", "label": "Postgres" },
    { "id": "queue", "label": "Job queue" }
  ],
  "links": [
    { "from": "ingress", "to": "auth", "value": 14200000 },
    { "from": "ingress", "to": "static", "value": 9800000 },
    { "from": "auth", "to": "reject", "value": 600000 },
    { "from": "auth", "to": "api", "value": 13600000 },
    { "from": "api", "to": "cache", "value": 8400000 },
    { "from": "api", "to": "db", "value": 4100000 },
    { "from": "api", "to": "queue", "value": 1100000 }
  ]
}
```

## Training data funnel

How a raw web crawl shrinks to the tokens a model trains on.

```sankey
{
  "title": "Pretraining data, billions of documents",
  "note": "Roughly one crawled document in eight survives to training",
  "format": "int",
  "nodes": [
    { "id": "crawl", "label": "Raw crawl" },
    { "id": "lang", "label": "English" },
    { "id": "other", "label": "Other languages", "tone": "flat" },
    { "id": "dedup", "label": "After dedup" },
    { "id": "dupes", "label": "Near duplicates", "tone": "flat" },
    { "id": "quality", "label": "Quality filtered" },
    { "id": "lowq", "label": "Low quality", "tone": "bad" },
    { "id": "train", "label": "Train", "tone": "good" },
    { "id": "eval", "label": "Held out" }
  ],
  "links": [
    { "from": "crawl", "to": "lang", "value": 48 },
    { "from": "crawl", "to": "other", "value": 52 },
    { "from": "lang", "to": "dedup", "value": 22 },
    { "from": "lang", "to": "dupes", "value": 26 },
    { "from": "dedup", "to": "quality", "value": 13 },
    { "from": "dedup", "to": "lowq", "value": 9 },
    { "from": "quality", "to": "train", "value": 12 },
    { "from": "quality", "to": "eval", "value": 1 }
  ]
}
```
