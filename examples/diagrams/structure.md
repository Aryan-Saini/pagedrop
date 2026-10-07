---
title: structure fence
---

The `structure` fence draws pointer data structures the way a textbook does: linked list cells with their next and prev fields, arrays with indices and named pointers, and stacks. Authors give values; the renderer sizes the cells and draws the arrows.

## Singly linked list

`head` names the pointer into the first cell. A `label` under a cell is its address, and a tone marks the cell the text is about.

```structure
{"kind":"list","title":"After push_front(7)","note":"The new cell at 0x10 now holds the old head as its next",
 "head":"head",
 "cells":[{"v":7,"label":"0x10","tone":"good"},{"v":3,"label":"0x48"},{"v":9,"label":"0x2c"},{"v":4,"label":"0x90"}]}
```

## Doubly linked list

Each cell carries a prev field on the left. Next arrows run along the top, prev arrows along the bottom, and both ends hold a null mark.

```structure
{"kind":"list","doubly":true,"head":"lru","title":"LRU cache order","note":"Most recently used on the left; eviction takes the tail",
 "cells":[{"v":"k42"},{"v":"k07"},{"v":"k19"},{"v":"k03","tone":"warn","label":"evict next"}]}
```

## A list with a cycle

`cycle` points the last next field back at an earlier cell. Floyd's tortoise and hare meet somewhere inside the loop.

```structure
{"kind":"list","head":"head","title":"Cycle entering at index 2","note":"Tail 5 points back at 8, so a walk never reaches null",
 "cycle":2,
 "cells":[{"v":1},{"v":4},{"v":8,"tone":"c1","label":"entry"},{"v":2},{"v":6},{"v":5}]}
```

## Binary search

Pointers sit under the cells they index. Two pointers on the same cell stack their names under one arrow.

```structure
{"kind":"array","title":"Searching for 23, second probe","note":"a[mid] = 16 < 23, so lo moves to mid + 1 = 5",
 "cells":[2,5,8,12,16,23,38,56,72,91],
 "pointers":[{"name":"lo","at":5,"tone":"c1"},{"name":"mid","at":4,"tone":"warn"},{"name":"hi","at":9,"tone":"c3"}]}
```

`start` changes the printed index base, for pseudocode that counts from 1. Pointer `at` values use the same base.

```structure
{"kind":"array","start":1,"compact":true,"title":"CLRS partition, i and j meet",
 "cells":[{"v":2,"tone":"c1"},{"v":1,"tone":"c1"},{"v":3,"tone":"c1"},{"v":8},{"v":7},{"v":5},{"v":6},{"v":4,"tone":"warn"}],
 "pointers":[{"name":"i","at":3},{"name":"j","at":3},{"name":"pivot","at":8,"tone":"warn"}]}
```

## A call stack

The top frame is listed first. `top` labels the pointer to it.

```structure
{"kind":"stack","top":"sp","title":"Inside fib(1)","note":"Each frame waits for the call above it to return",
 "cells":[{"v":"fib(1)","tone":"c1"},"fib(2)","fib(3)","fib(4)","main()"]}
```
