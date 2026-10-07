---
title: Pipeline and schedule grids
---

A `pipeline` grid puts one row per instruction (or worker) against one column per cycle (or step). Every distinct cell text gets its own colour, so stages line up visually down the columns.

## A load-use hazard in a 5-stage pipeline

`add` needs `r1` in EX, but `lw` only has it after MEM. Forwarding from MEM/WB covers the gap with one bubble, and everything behind `add` slips one cycle with it.

```pipeline
{
  "title": "5-stage pipeline",
  "note": "lw then a dependent add: one stall cycle",
  "cycles": 9,
  "rows": [
    { "label": "lw r1,0(r2)", "cells": ["IF", "ID", "EX", "MEM", "WB"] },
    { "label": "add r3,r1,r4", "start": 1, "cells": ["IF", "ID", "stall", "EX", "MEM", "WB"] },
    { "label": "sub r5,r6,r7", "start": 2, "cells": ["IF", "stall", "ID", "EX", "MEM", "WB"] },
    { "label": "or r8,r9,r1", "start": 4, "cells": ["IF", "ID", "EX", "MEM", "WB"] }
  ]
}
```

## A tree reduction across four workers

The same grid works as a schedule. Each worker sums its own chunk, then pairs combine in log2(4) = 2 rounds. W3 starts a step late, so its first cell is `null`. Here `stall` is renamed to `wait`: a worker blocked on a partner that is not ready.

```pipeline
{
  "title": "Parallel sum on 4 workers",
  "note": "Two rounds of pairwise combining; W0 holds the total after step 7",
  "stall": "wait",
  "rows": [
    { "label": "W0", "cells": ["sum", "sum", "recv", "add", "wait", "recv", "add"] },
    { "label": "W1", "cells": ["sum", "sum", "send"] },
    { "label": "W2", "cells": ["sum", "sum", "wait", "recv", "add", "send"] },
    { "label": "W3", "cells": [null, "sum", "sum", "send"] }
  ]
}
```
