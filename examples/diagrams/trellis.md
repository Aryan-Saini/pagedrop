---
title: Viterbi trellises
---

A hidden Markov model's decoding problem is a shortest path through a lattice: one column per
observation, one node per hidden state. The `trellis` fence draws that lattice, prints the Viterbi
score in each cell, and lights the best path.

## Eisner's ice cream

Jason Eisner's classic example: the hidden weather is Hot or Cold, the observation is how many ice
creams were eaten that day. The start node fans out to the first column with the initial
probabilities, and the best path is Hot, Cold, Hot.

```trellis
{
  "title": "Ice cream HMM, observations 3 1 3",
  "note": "Each cell is the probability of the best path ending there; the highlighted chain is the argmax",
  "states": ["Hot", "Cold"],
  "obs": ["3", "1", "3"],
  "start": "π",
  "scores": [[0.32, 0.0384, 0.0184], [0.02, 0.064, 0.0019]],
  "path": [0, 1, 0]
}
```

## Part-of-speech tagging

Four tags over a six-word sentence. Scores are log probabilities, so they are negative and the best
path has the largest final value. Every transition between adjacent columns is drawn faintly; the
decoded tag sequence is the strong chain.

```trellis
{
  "title": "Viterbi POS tagging",
  "note": "Log-space scores; decoded tags DET NOUN VERB DET ADJ NOUN",
  "states": ["DET", "NOUN", "VERB", "ADJ"],
  "obs": ["the", "dog", "saw", "a", "big", "cat"],
  "start": "<s>",
  "scores": [
    [-0.4, -9.21, -12.6, -10.2, -21.3, -24.8],
    [-6.9, -2.31, -9.87, -13.4, -16.2, -16.9],
    [-8.1, -7.43, -4.12, -14.1, -17.5, -21.2],
    [-7.6, -8.02, -10.3, -10.8, -13.6, -19.7]
  ],
  "path": [0, 1, 2, 0, 3, 1]
}
```

## Path only

`transitions: "path"` drops the faint mesh, which suits a long lattice where only the decoded path
matters. Without `scores` the nodes are empty.

```trellis
{
  "title": "Decoded phoneme states",
  "states": ["sil", "h", "eh", "l", "ow"],
  "obs": ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"],
  "path": [0, 1, 1, 2, 2, 3, 3, 4, 4, 0],
  "transitions": "path"
}
```
