---
title: Token diagrams for NLP
---

The `tokens` fence draws a row of tokens and hangs structure off it: dependency arcs and a root
arrow above, subword spans and tag rows below, attention weights as arcs, or a second row with
alignment links. Every position is computed from the JSON; arc heights come from span length.

## Dependency parse

Universal Dependencies parse of a short sentence. Each arc points from the head to its dependent,
and the POS row is a plain tag row aligned under the tokens.

```tokens
{
  "title": "Dependency parse with POS tags",
  "note": "Arcs nest by span: det and nsubj sit low, obl and punct climb over them",
  "tokens": ["The", "cat", "sat", "on", "the", "mat", "."],
  "root": 2,
  "arcs": [
    {"from": 2, "to": 1, "label": "nsubj"},
    {"from": 1, "to": 0, "label": "det"},
    {"from": 2, "to": 5, "label": "obl"},
    {"from": 5, "to": 3, "label": "case"},
    {"from": 5, "to": 4, "label": "det"},
    {"from": 2, "to": 6, "label": "punct"}
  ],
  "tags": {"POS": ["DET", "NOUN", "VERB", "ADP", "DET", "NOUN", "PUNCT"]}
}
```

## WordPiece segmentation

BERT's tokenizer splits rare words into a stem plus `##` continuation pieces. Spans bracket the
pieces that came from one source word; a tone marks the word the vocabulary had to split hardest.

```tokens
{
  "title": "WordPiece segmentation",
  "note": "11 pieces for 6 words; ## marks a piece that continues the previous one",
  "tokens": ["[CLS]", "un", "##believ", "##able", "##ly", ",", "it", "token", "##ized", "fine", "[SEP]"],
  "spans": [
    {"from": 1, "to": 4, "label": "unbelievably", "tone": "warn"},
    {"from": 6, "to": 6, "label": "it"},
    {"from": 7, "to": 8, "label": "tokenized"},
    {"from": 9, "to": 9, "label": "fine"}
  ]
}
```

## POS and NER tag rows

Two tag rows under one sentence. POS prints as text; NER is BIO, so each entity becomes one
coloured bar under the tokens it covers, labelled with its type once.

```tokens
{
  "title": "POS and NER tags",
  "tokens": ["Tim", "Cook", "visited", "Apple", "Park", "in", "Cupertino", "on", "Monday"],
  "tags": {
    "POS": ["PROPN", "PROPN", "VERB", "PROPN", "PROPN", "ADP", "PROPN", "ADP", "PROPN"],
    "NER": ["B-PER", "I-PER", "O", "B-ORG", "I-ORG", "O", "B-LOC", "O", "B-DATE"]
  }
}
```

## Attention from one token

With `weights: true` arcs are attention links: no arrowheads, and stroke width and opacity follow
each weight. This is one head's attention row for the query "it", the classic coreference case.

```tokens
{
  "title": "Attention from \"it\", layer 5 head 3",
  "note": "Most of the mass lands on animal, the antecedent",
  "weights": true,
  "tokens": ["The", "animal", "didn't", "cross", "the", "street", "because", "it", "was", "tired"],
  "arcs": [
    {"from": 7, "to": 1, "weight": 0.62},
    {"from": 7, "to": 5, "weight": 0.11},
    {"from": 7, "to": 9, "weight": 0.14},
    {"from": 7, "to": 3, "weight": 0.05},
    {"from": 7, "to": 6, "weight": 0.08}
  ]
}
```

## German to English alignment

Alignment mode takes two `rows` instead of `tokens`, and `links` as `[i, j, weight]` from the
source row to the target row. The verb-final German clause shows up as a crossing link.

```tokens
{
  "title": "Soft alignment, German to English",
  "note": "Line width and opacity are the attention weight",
  "rows": [
    {"name": "source", "tokens": ["Ich", "habe", "das", "Buch", "gestern", "gelesen", "."]},
    {"name": "target", "tokens": ["I", "read", "the", "book", "yesterday", "."]}
  ],
  "links": [
    [0, 0, 0.95], [1, 1, 0.35], [5, 1, 0.85], [2, 2, 0.9], [3, 3, 0.92],
    [4, 4, 0.88], [6, 5, 0.97], [3, 2, 0.12]
  ]
}
```

## A long sentence

Twenty tokens with deep nesting and one non-projective arc: "hearing" governs the prepositional
phrase "on the issue" across the verb. The crossing arc climbs a level and its label steps clear of
the legs that pass through it.

```tokens
{
  "title": "Arc stacking on a 20 token sentence",
  "note": "nmod from hearing to issue crosses the root; every other arc nests",
  "tokens": ["A", "hearing", "is", "scheduled", "on", "the", "issue", "today", ",", "and",
    "the", "committee", "expects", "a", "ruling", "that", "will", "settle", "it", "."],
  "root": 3,
  "arcs": [
    {"from": 1, "to": 0, "label": "det"},
    {"from": 3, "to": 1, "label": "nsubj:pass"},
    {"from": 3, "to": 2, "label": "aux:pass"},
    {"from": 1, "to": 6, "label": "nmod", "tone": "warn"},
    {"from": 6, "to": 4, "label": "case"},
    {"from": 6, "to": 5, "label": "det"},
    {"from": 3, "to": 7, "label": "obl:tmod"},
    {"from": 12, "to": 8, "label": "punct"},
    {"from": 12, "to": 9, "label": "cc"},
    {"from": 11, "to": 10, "label": "det"},
    {"from": 12, "to": 11, "label": "nsubj"},
    {"from": 3, "to": 12, "label": "conj"},
    {"from": 14, "to": 13, "label": "det"},
    {"from": 12, "to": 14, "label": "obj"},
    {"from": 17, "to": 15, "label": "nsubj"},
    {"from": 17, "to": 16, "label": "aux"},
    {"from": 14, "to": 17, "label": "acl:relcl"},
    {"from": 17, "to": 18, "label": "obj"},
    {"from": 3, "to": 19, "label": "punct"}
  ],
  "tags": {"POS": ["DET", "NOUN", "AUX", "VERB", "ADP", "DET", "NOUN", "NOUN", "PUNCT", "CCONJ",
    "DET", "NOUN", "VERB", "DET", "NOUN", "PRON", "AUX", "VERB", "PRON", "PUNCT"]}
}
```
