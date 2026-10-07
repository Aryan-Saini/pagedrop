---
title: graph fence
---

The `graph` fence lays out directed graphs in layers: task DAGs, build dependencies, state machines, automata and computation graphs. Authors list nodes and edges; the renderer finds cycles, layers the nodes, routes long edges between boxes and keeps labels clear of each other.

## Work and span

A parallel sum of eight numbers forks down to four pairwise adds and joins back up. Every node costs one unit, so work is the node count and span is the longest path, drawn in the `span` tone.

```graph
{"title":"Parallel sum of a[0..8]","note":"Work T1 = 10, span T∞ = 5, parallelism T1/T∞ = 2",
 "nodes":[
  {"id":"s","label":"split 0..8","tone":"span","mono":true},
  {"id":"l","label":"split 0..4","tone":"span","mono":true},
  {"id":"r","label":"split 4..8","mono":true},
  {"id":"p0","label":"a0+a1","tone":"span","mono":true},
  {"id":"p1","label":"a2+a3","mono":true},
  {"id":"p2","label":"a4+a5","mono":true},
  {"id":"p3","label":"a6+a7","mono":true},
  {"id":"j0","label":"+","shape":"circle","tone":"span"},
  {"id":"j1","label":"+","shape":"circle"},
  {"id":"t","label":"sum","tone":"span","side":"returned to caller"}],
 "edges":[
  {"from":"s","to":"l","tone":"span"},{"from":"s","to":"r"},
  {"from":"l","to":"p0","tone":"span"},{"from":"l","to":"p1"},
  {"from":"r","to":"p2"},{"from":"r","to":"p3"},
  {"from":"p0","to":"j0","tone":"span"},{"from":"p1","to":"j0"},
  {"from":"p2","to":"j1"},{"from":"p3","to":"j1"},
  {"from":"j0","to":"t","tone":"span"},{"from":"j1","to":"t"}]}
```

## Build dependencies

Edges run from a library to whatever links against it. Long edges skip layers and bend around the boxes in between instead of crossing them.

```graph
{"title":"What rebuilds when zlib changes","note":"Amber nodes link zlib directly or through openssl",
 "nodes":[
  {"id":"libc","mono":true},
  {"id":"zlib","mono":true,"tone":"warn","side":"1.3.1 patched"},
  {"id":"nghttp2","mono":true},
  {"id":"pcre2","mono":true},
  {"id":"expat","mono":true},
  {"id":"openssl","mono":true,"tone":"warn"},
  {"id":"libssh2","mono":true,"tone":"warn"},
  {"id":"libcurl","mono":true,"tone":"warn"},
  {"id":"git","mono":true,"tone":"warn","shape":"round"},
  {"id":"curl","mono":true,"tone":"warn","shape":"round"}],
 "edges":[
  {"from":"libc","to":"zlib"},{"from":"libc","to":"nghttp2"},{"from":"libc","to":"pcre2"},
  {"from":"libc","to":"expat"},{"from":"libc","to":"openssl"},
  {"from":"zlib","to":"openssl","tone":"warn"},{"from":"zlib","to":"libssh2","tone":"warn"},
  {"from":"zlib","to":"libcurl","tone":"warn"},{"from":"zlib","to":"git","tone":"warn"},
  {"from":"openssl","to":"libssh2"},{"from":"openssl","to":"libcurl"},{"from":"openssl","to":"git"},
  {"from":"libssh2","to":"libcurl"},{"from":"nghttp2","to":"libcurl"},
  {"from":"libcurl","to":"git"},{"from":"libcurl","to":"curl"},{"from":"pcre2","to":"git"},{"from":"expat","to":"git"}]}
```

## A DFA

Strings over {a, b} that end in `ab`. The start state has an entry arrow, the accepting state a double ring, and parallel transitions merge into one arrow labelled `a, b`.

```graph
{"title":"DFA for (a|b)*ab","dir":"right","compact":true,
 "nodes":[
  {"id":"q0","shape":"circle","start":true},
  {"id":"q1","shape":"circle"},
  {"id":"q2","shape":"double","tone":"good"}],
 "edges":[
  {"from":"q0","to":"q1","label":"a"},{"from":"q0","to":"q0","label":"b"},
  {"from":"q1","to":"q1","label":"a"},{"from":"q1","to":"q2","label":"b"},
  {"from":"q2","to":"q1","label":"a"},{"from":"q2","to":"q0","label":"b"}]}
```

## An NFA by Thompson's construction

`(a|b)*abb`, the textbook eleven-state machine. The ε edge from 6 back to 1 is the star's loop; the long edge from 0 to 7 is the star's skip.

```graph
{"title":"Thompson NFA for (a|b)*abb","dir":"right",
 "nodes":[
  {"id":"0","shape":"circle","start":true},{"id":"1","shape":"circle"},{"id":"2","shape":"circle"},
  {"id":"3","shape":"circle"},{"id":"4","shape":"circle"},{"id":"5","shape":"circle"},
  {"id":"6","shape":"circle"},{"id":"7","shape":"circle"},{"id":"8","shape":"circle"},
  {"id":"9","shape":"circle"},{"id":"10","shape":"double","tone":"good"}],
 "edges":[
  {"from":"0","to":"1","label":"ε"},{"from":"0","to":"7","label":"ε"},
  {"from":"1","to":"2","label":"ε"},{"from":"1","to":"4","label":"ε"},
  {"from":"2","to":"3","label":"a"},{"from":"4","to":"5","label":"b"},
  {"from":"3","to":"6","label":"ε"},{"from":"5","to":"6","label":"ε"},
  {"from":"6","to":"1","label":"ε"},{"from":"6","to":"7","label":"ε"},
  {"from":"7","to":"8","label":"a"},{"from":"8","to":"9","label":"b"},
  {"from":"9","to":"10","label":"b"}]}
```

## An Erlang process

The scheduler view of one process. Preemption and rescheduling form a pair; a message arriving while the process waits sends it back to the run queue, which is the dashed back edge.

```graph
{"title":"Erlang process states","note":"Dashed: a back edge, found by the layout rather than marked by hand",
 "nodes":[
  {"id":"runnable","shape":"round","start":true},
  {"id":"running","shape":"round","tone":"c1"},
  {"id":"waiting","shape":"round"},
  {"id":"exiting","shape":"round","tone":"bad"},
  {"id":"free","shape":"dot","side":"heap freed"}],
 "edges":[
  {"from":"runnable","to":"running","label":"scheduled"},
  {"from":"running","to":"runnable","label":"reductions spent"},
  {"from":"running","to":"waiting","label":"receive, no match"},
  {"from":"waiting","to":"waiting","label":"other message"},
  {"from":"waiting","to":"runnable","label":"match or after"},
  {"from":"running","to":"exiting","label":"exit"},
  {"from":"exiting","to":"free","label":"links notified"}]}
```

## A computation graph

`f = (x * y) + z` at x = 3, y = -4, z = 2. Steps 1 to 3 are the forward pass; steps 4 to 6 carry gradients back along the same edges, dashed. Gradient edges carry `back: true`, since every node here has an edge in both directions and only the author knows which way is forward.

```graph
{"title":"Forward and backward pass","dir":"right","note":"∂f/∂x = y = -4, ∂f/∂y = x = 3, ∂f/∂z = 1",
 "nodes":[
  {"id":"x","shape":"circle","mono":true},{"id":"y","shape":"circle","mono":true},
  {"id":"mul","label":"*","shape":"circle"},{"id":"z","shape":"circle","mono":true},
  {"id":"add","label":"+","shape":"circle"},
  {"id":"f","shape":"circle","mono":true,"tone":"good"}],
 "edges":[
  {"from":"x","to":"mul","label":"3","step":1},{"from":"y","to":"mul","label":"-4","step":1},
  {"from":"mul","to":"add","label":"q = -12","step":2},{"from":"z","to":"add","label":"2","step":2},
  {"from":"add","to":"f","label":"-10","step":3},
  {"from":"f","to":"add","label":"1","step":4,"dashed":true,"tone":"c1","back":true},
  {"from":"add","to":"mul","label":"∂q = 1","step":5,"dashed":true,"tone":"c1","back":true},
  {"from":"add","to":"z","label":"∂z = 1","step":5,"dashed":true,"tone":"c1","back":true},
  {"from":"mul","to":"x","label":"∂x = -4","step":6,"dashed":true,"tone":"c1","back":true},
  {"from":"mul","to":"y","label":"∂y = 3","step":6,"dashed":true,"tone":"c1","back":true}]}
```
