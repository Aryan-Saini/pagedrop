---
title: Trees in postplan
byline: Postplan examples
status: Reference
---

The `tree` fence draws any rooted tree from a one-line shorthand or nested node objects. Layout is computed: no coordinates, no edge list. Values can flow along the edges in either direction, numbered by the step that sent them, so one picture shows a whole reduce or scan.

## Shorthand

`Label(Child,Child(Grand,Grand))` is enough for most trees. Labels are trimmed and may hold anything but parentheses and commas.

```tree
{"title":"The obvious tree of processes","note":"8 workers, 7 tree processes","shape":"ellipse","mono":true,
 "tree":"Tr1(Tr2(Tr4(W0,W1),Tr5(W2,W3)),Tr3(Tr6(W4,W5),Tr7(W6,W7)))"}
```

## Root at the bottom

`dir: "up"` puts the root at the bottom. Arrows point at the parent, internal nodes are bare combine points, and `levels` captions each depth from the root down.

```tree
{"title":"Parallel count of 3s","note":"Same work as the sequential count, span log P","dir":"up","arrows":"toParent","shape":"dot",
 "levels":["combine +","combine +","combine +","local counts"],
 "tree":{"children":[
   {"children":[{"children":[{"shape":"box"},{"shape":"box"}]},{"children":[{"shape":"box"},{"shape":"box"}]}]},
   {"children":[{"children":[{"shape":"box"},{"shape":"box"}]},{"children":[{"shape":"box"},{"shape":"box"}]}]}]}}
```

## Schwartz spine

`layout: "spine"` stacks a parent directly on its first child, because in a Schwartz tree a worker is its own parent. Only the blue edges are real messages.

```tree
{"title":"Schwartz tree","note":"Each worker combines with its right neighbour, then climbs","layout":"spine","shape":"circle","mono":true,
 "tree":{"label":"Op","children":[
   {"label":"Op","children":[
     {"label":"Op","children":[{"label":"Leaf","shape":"ellipse","below":"W0"},{"label":"Leaf","shape":"ellipse","below":"W1"}]},
     {"label":"Op","children":[{"label":"Leaf","shape":"ellipse","below":"W2"},{"label":"Leaf","shape":"ellipse","below":"W3"}]}]},
   {"label":"Op","children":[
     {"label":"Op","children":[{"label":"Leaf","shape":"ellipse","below":"W4"},{"label":"Leaf","shape":"ellipse","below":"W5"}]},
     {"label":"Op","children":[{"label":"Leaf","shape":"ellipse","below":"W6"},{"label":"Leaf","shape":"ellipse","below":"W7"}]}]}]}}
```

## Values in send order

A node's `up` travels to its parent in red, its `down` arrives from the parent in blue. Give a value a `step` and a numbered badge marks the end that sent it. Here a prefix scan over `2 1 3 -1 4 2 -2 5`: each leaf holds a segment, steps 1 and 2 sum upward, steps 3 and 4 hand each segment the total of everything to its left.

```tree
{"title":"Scan, numbered by send order","note":"Steps 1 and 2 are the upward pass, 3 and 4 the downward pass","shape":"circle",
 "levels":["","","scan results"],
 "tree":{"children":[
   {"up":{"v":5,"step":2},"down":{"v":0,"step":3},"children":[
     {"shape":"cells","cells":[2,1],"up":{"v":3,"step":1},"down":{"v":0,"step":4},"below":"0 2","belowTone":"good"},
     {"shape":"cells","cells":[3,-1],"up":{"v":2,"step":1},"down":{"v":3,"step":4},"below":"3 6","belowTone":"good"}]},
   {"up":{"v":9,"step":2},"down":{"v":5,"step":3},"children":[
     {"shape":"cells","cells":[4,2],"up":{"v":6,"step":1},"down":{"v":5,"step":4},"below":"5 9","belowTone":"good"},
     {"shape":"cells","cells":[-2,5],"up":{"v":3,"step":1},"down":{"v":11,"step":4},"below":"11 9","belowTone":"good"}]}]}}
```

`until` draws only the steps up to a number and leaves every node where it was, so the same tree becomes a strip of snapshots.

```tree
{"title":"After step 1","compact":true,"until":1,"shape":"circle",
 "tree":{"children":[
   {"up":{"v":5,"step":2},"down":{"v":0,"step":3},"children":[
     {"shape":"cells","cells":[2,1],"up":{"v":3,"step":1},"down":{"v":0,"step":4},"below":"0 2","belowTone":"good"},
     {"shape":"cells","cells":[3,-1],"up":{"v":2,"step":1},"down":{"v":3,"step":4},"below":"3 6","belowTone":"good"}]},
   {"up":{"v":9,"step":2},"down":{"v":5,"step":3},"children":[
     {"shape":"cells","cells":[4,2],"up":{"v":6,"step":1},"down":{"v":5,"step":4},"below":"5 9","belowTone":"good"},
     {"shape":"cells","cells":[-2,5],"up":{"v":3,"step":1},"down":{"v":11,"step":4},"below":"11 9","belowTone":"good"}]}]}}
```

```tree
{"title":"After step 2","compact":true,"until":2,"shape":"circle",
 "tree":{"children":[
   {"up":{"v":5,"step":2},"down":{"v":0,"step":3},"children":[
     {"shape":"cells","cells":[2,1],"up":{"v":3,"step":1},"down":{"v":0,"step":4},"below":"0 2","belowTone":"good"},
     {"shape":"cells","cells":[3,-1],"up":{"v":2,"step":1},"down":{"v":3,"step":4},"below":"3 6","belowTone":"good"}]},
   {"up":{"v":9,"step":2},"down":{"v":5,"step":3},"children":[
     {"shape":"cells","cells":[4,2],"up":{"v":6,"step":1},"down":{"v":5,"step":4},"below":"5 9","belowTone":"good"},
     {"shape":"cells","cells":[-2,5],"up":{"v":3,"step":1},"down":{"v":11,"step":4},"below":"11 9","belowTone":"good"}]}]}}
```

```tree
{"title":"After step 4","compact":true,"until":4,"shape":"circle",
 "tree":{"children":[
   {"up":{"v":5,"step":2},"down":{"v":0,"step":3},"children":[
     {"shape":"cells","cells":[2,1],"up":{"v":3,"step":1},"down":{"v":0,"step":4},"below":"0 2","belowTone":"good"},
     {"shape":"cells","cells":[3,-1],"up":{"v":2,"step":1},"down":{"v":3,"step":4},"below":"3 6","belowTone":"good"}]},
   {"up":{"v":9,"step":2},"down":{"v":5,"step":3},"children":[
     {"shape":"cells","cells":[4,2],"up":{"v":6,"step":1},"down":{"v":5,"step":4},"below":"5 9","belowTone":"good"},
     {"shape":"cells","cells":[-2,5],"up":{"v":3,"step":1},"down":{"v":11,"step":4},"below":"11 9","belowTone":"good"}]}]}}
```

Order is whatever the steps say. Here the master broadcasts first and the replies come back up, so the blue arrows carry the low numbers. The root's own `up` is the tree's output.

```tree
{"title":"wtree reduce: broadcast, then reduce","note":"The master sends go down the tree; workers reply with their partial sums","shape":"circle",
 "tree":{"label":"M","up":{"v":14,"step":5},"children":[
   {"down":{"v":"go","step":1},"up":{"v":7,"step":4},"children":[
     {"label":"W0","down":{"v":"go","step":2},"up":{"v":3,"step":3}},
     {"label":"W1","down":{"v":"go","step":2},"up":{"v":4,"step":3}}]},
   {"down":{"v":"go","step":1},"up":{"v":7,"step":4},"children":[
     {"label":"W2","down":{"v":"go","step":2},"up":{"v":1,"step":3}},
     {"label":"W3","down":{"v":"go","step":2},"up":{"v":6,"step":3}}]}]}}
```

## Sideways

`dir: "right"` grows the tree left to right on curved edges, which suits long labels. `arrows: "toChild"` says who spawned whom.

```tree
{"title":"create(4, Task)","note":"Each process keeps the low half of its range and spawns a process for the high half","dir":"right","arrows":"toChild",
 "tree":"P1 root 1..4(P1 keeps 1..2(P1 keeps 1,P2 gets 2),P3 gets 3..4(P3 keeps 3,P4 gets 4))"}
```

`dir: "left"` puts the root on the right, so a merge sort reads in time order: runs of one on the left, merged pairwise toward the sorted output. Sideways `levels` sit under each column.

```tree
{"title":"Merge sort, bottom up","dir":"left","arrows":"toParent","mono":true,"levels":["merge 4+4","merge 2+2","merge 1+1","runs"],
 "tree":"1 2 3 5 6 7 8 9(2 5 7 9(5 7(7,5),2 9(9,2)),1 3 6 8(3 8(3,8),1 6(6,1)))"}
```

## Decision and parse trees

`edge` labels the line from a node's parent. Tones colour the outline and `below` prints a line under the node.

```tree
{"title":"Iris decision tree","note":"Leaves show correct / total training samples","tree":{"label":"petal length","children":[
   {"label":"setosa","shape":"round","tone":"c1","edge":"< 2.45","below":"50 / 50"},
   {"label":"petal width < 1.75","edge":"≥ 2.45","children":[
     {"label":"versicolor","shape":"round","tone":"c3","edge":"yes","below":"49 / 54"},
     {"label":"virginica","shape":"round","tone":"c7","edge":"no","below":"45 / 46"}]}]}}
```

`layout: "leaves"` puts every leaf on the deepest row, so the words of a sentence line up under their constituents.

```tree
{"title":"Constituency parse","note":"The words keep sentence order on the bottom row","layout":"leaves","shape":"round",
 "tree":"S(NP(Det(the),N(cat)),VP(V(sat),PP(P(on),NP(Det(the),Adj(red),N(mat)))))"}
```

## Unbalanced recursion

The tidy layout packs lopsided trees without overlap. Each call of a naive Fibonacci prints its return value underneath; the amber calls are the repeats a memo table would skip.

```tree
{"title":"Call tree of fib(5)","note":"15 calls for one answer","mono":true,
 "tree":{"label":"fib(5)","below":"5","children":[
   {"label":"fib(4)","below":"3","children":[
     {"label":"fib(3)","below":"2","children":[
       {"label":"fib(2)","below":"1","children":[{"label":"fib(1)","below":"1"},{"label":"fib(0)","below":"0"}]},
       {"label":"fib(1)","below":"1"}]},
     {"label":"fib(2)","below":"1","tone":"warn","children":[{"label":"fib(1)","below":"1"},{"label":"fib(0)","below":"0"}]}]},
   {"label":"fib(3)","below":"2","tone":"warn","children":[
     {"label":"fib(2)","below":"1","children":[{"label":"fib(1)","below":"1"},{"label":"fib(0)","below":"0"}]},
     {"label":"fib(1)","below":"1"}]}]}}
```
