---
title: Sorting networks
---

A sorting network is a fixed schedule of compare-exchange operations. The `sortnet` fence runs the
inputs through every layer at render time, so each column shows the real values after that step and
every comparator that swapped is drawn red.

## Odd-even transposition sort

Six wires need six alternating rounds: odd pairs, then even pairs. Every round is one parallel step,
so the span is n and the work is n(n-1)/2 comparators.

```sortnet
{
  "title": "Odd-even transposition sort on 6 wires",
  "note": "Red comparators swapped in this run; values after each step sit beside it",
  "inputs": [5, 2, 6, 1, 4, 3],
  "layers": [
    [[0, 1], [2, 3], [4, 5]],
    [[1, 2], [3, 4]],
    [[0, 1], [2, 3], [4, 5]],
    [[1, 2], [3, 4]],
    [[0, 1], [2, 3], [4, 5]],
    [[1, 2], [3, 4]]
  ]
}
```

## Bitonic sort

Batcher's bitonic sort builds ascending and descending runs, then merges them. A comparator written
`[3, 2]` leaves the minimum on wire 3, so it sorts descending; the arrowhead marks where the maximum
goes. Step 4 compares across the whole network, so its four comparators are offset sideways.

```sortnet
{
  "title": "Bitonic sort on 8 wires",
  "note": "log2(8) * (log2(8) + 1) / 2 = 6 parallel steps, 24 comparators",
  "inputs": [7, 3, 6, 8, 1, 5, 2, 4],
  "layers": [
    [[0, 1], [3, 2], [4, 5], [7, 6]],
    [[0, 2], [1, 3], [6, 4], [7, 5]],
    [[0, 1], [2, 3], [5, 4], [7, 6]],
    [[0, 4], [1, 5], [2, 6], [3, 7]],
    [[0, 2], [1, 3], [4, 6], [5, 7]],
    [[0, 1], [2, 3], [4, 5], [6, 7]]
  ]
}
```

## A network that does not sort

Three rounds of transposition are not enough for four wires. With `values` off only the inputs and
outputs print, and the output shows the fault on its own.

```sortnet
{
  "title": "Three rounds on 4 wires",
  "note": "One round short: 3 and 2.5 end out of order",
  "compact": true,
  "values": false,
  "inputs": [4, 3, 2.5, 1],
  "layers": [
    [[0, 1], [2, 3]],
    [[1, 2]],
    [[0, 1], [2, 3]]
  ]
}
```
