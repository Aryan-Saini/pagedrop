---
title: ML, NLP and automata with graph and tree
---

Most pictures in a machine learning or compilers write-up are layered graphs or rooted trees with the right JSON. Automata use `graph` going right with self-loops and merged parallel edges; architecture blocks use `graph` going down with tinted nodes, grouped repeats and skip connections routed round the side; an unrolled RNN pins time steps to ranks; a computation graph carries values under its nodes. Decision and parse trees are `tree`.

## Automata

A DFA over binary strings that accepts multiples of three. State qk means the bits read so far are k mod 3, so reading bit b moves from k to 2k + b mod 3.

```graph
{"title":"DFA: binary numbers divisible by 3","dir":"right","compact":true,
 "note":"Double ring accepts, the floating arrow marks the start",
 "nodes":[
  {"id":"q0","shape":"double","start":true,"tone":"good"},
  {"id":"q1","shape":"circle"},
  {"id":"q2","shape":"circle"}],
 "edges":[
  {"from":"q0","to":"q0","label":"0"},{"from":"q0","to":"q1","label":"1"},
  {"from":"q1","to":"q0","label":"1"},{"from":"q1","to":"q2","label":"0"},
  {"from":"q2","to":"q1","label":"0"},{"from":"q2","to":"q2","label":"1"}]}
```

```graph
{"title":"NFA with ε moves","dir":"right","compact":true,
 "note":"Dashed edges read no input; the ε back to 1 is a cycle, looped round the outside",
 "nodes":[
  {"id":"0","shape":"circle","start":true},{"id":"1","shape":"circle"},
  {"id":"2","shape":"circle"},{"id":"3","shape":"circle"},
  {"id":"4","shape":"double","tone":"good"}],
 "edges":[
  {"from":"0","to":"1","label":"a"},
  {"from":"1","to":"2","label":"ε","dashed":true},{"from":"1","to":"3","label":"ε","dashed":true},
  {"from":"2","to":"2","label":"b"},{"from":"3","to":"3","label":"c"},
  {"from":"2","to":"4","label":"d"},{"from":"3","to":"4","label":"d"},
  {"from":"4","to":"1","label":"ε","dashed":true}]}
```

Thompson's construction of `(a|b)*c`. The two alternatives land on their own rows, the star's loop from 6 back to 1 runs over the top, and the skip from 0 to 7 that lets the star match nothing detours underneath.

```graph
{"title":"Thompson construction of (a|b)*c","dir":"right",
 "nodes":[
  {"id":"0","shape":"circle","start":true},{"id":"1","shape":"circle"},{"id":"2","shape":"circle"},
  {"id":"3","shape":"circle"},{"id":"4","shape":"circle"},{"id":"5","shape":"circle"},
  {"id":"6","shape":"circle"},{"id":"7","shape":"circle"},{"id":"8","shape":"circle"},
  {"id":"9","shape":"double","tone":"good"}],
 "edges":[
  {"from":"0","to":"1","label":"ε","dashed":true},
  {"from":"1","to":"2","label":"ε","dashed":true},{"from":"1","to":"4","label":"ε","dashed":true},
  {"from":"2","to":"3","label":"a"},{"from":"4","to":"5","label":"b"},
  {"from":"3","to":"6","label":"ε","dashed":true},{"from":"5","to":"6","label":"ε","dashed":true},
  {"from":"6","to":"1","label":"ε","dashed":true},{"from":"6","to":"7","label":"ε","dashed":true},
  {"from":"0","to":"7","label":"ε","dashed":true},
  {"from":"7","to":"8","label":"c"},{"from":"8","to":"9","label":"ε","dashed":true}]}
```

## Architecture blocks

A transformer encoder layer is a chain with two residual edges. Each residual skips a node in the same column, so it leaves its source from the side, runs past the node it skips and comes back in from the side. `fill` tints the two sublayers that hold weights; `groups` draws the repeated block with its count.

```graph
{"title":"Transformer encoder block","compact":true,
 "nodes":[
  {"id":"in","label":"input + pos","shape":"round"},
  {"id":"mha","label":"multi-head attention","fill":"c1"},
  {"id":"add1","label":"add & norm"},
  {"id":"ffn","label":"feed forward","fill":"c3"},
  {"id":"add2","label":"add & norm"},
  {"id":"out","label":"output","shape":"round"}],
 "edges":[
  {"from":"in","to":"mha"},{"from":"mha","to":"add1"},
  {"from":"in","to":"add1","label":"residual"},
  {"from":"add1","to":"ffn"},{"from":"ffn","to":"add2"},
  {"from":"add1","to":"add2","label":"residual"},
  {"from":"add2","to":"out"}],
 "groups":[{"label":"x 6","nodes":["mha","add1","ffn","add2"]}]}
```

```graph
{"title":"ResNet basic block","compact":true,
 "nodes":[
  {"id":"x","label":"x","shape":"round"},
  {"id":"c1","label":"conv 3x3, 64","fill":"c1"},
  {"id":"bn1","label":"BN + ReLU"},
  {"id":"c2","label":"conv 3x3, 64","fill":"c1"},
  {"id":"bn2","label":"BN"},
  {"id":"add","label":"+","shape":"circle"},
  {"id":"relu","label":"ReLU"}],
 "edges":[
  {"from":"x","to":"c1"},{"from":"c1","to":"bn1"},{"from":"bn1","to":"c2"},
  {"from":"c2","to":"bn2"},{"from":"bn2","to":"add"},
  {"from":"x","to":"add","label":"identity"},{"from":"add","to":"relu"}]}
```

## Recurrence

Unrolled over three time steps, every hidden state is pinned to rank 1, so the recurrent edges run straight across the row instead of staggering each step one layer lower. The rolled form beside it is the same cell with a self-loop.

```graph
{"title":"RNN unrolled","compact":true,
 "nodes":[
  {"id":"x1","rank":0},{"id":"x2","rank":0},{"id":"x3","rank":0},
  {"id":"h1","rank":1,"shape":"round","fill":"c1"},
  {"id":"h2","rank":1,"shape":"round","fill":"c1"},
  {"id":"h3","rank":1,"shape":"round","fill":"c1"},
  {"id":"y1","rank":2},{"id":"y2","rank":2},{"id":"y3","rank":2}],
 "edges":[
  {"from":"x1","to":"h1","label":"U"},{"from":"x2","to":"h2","label":"U"},{"from":"x3","to":"h3","label":"U"},
  {"from":"h1","to":"h2","label":"W"},{"from":"h2","to":"h3","label":"W"},
  {"from":"h1","to":"y1","label":"V"},{"from":"h2","to":"y2","label":"V"},{"from":"h3","to":"y3","label":"V"}]}
```

```graph
{"title":"RNN rolled","compact":true,
 "nodes":[
  {"id":"x","label":"x_t"},
  {"id":"h","label":"h_t","shape":"round","fill":"c1"},
  {"id":"y","label":"y_t"}],
 "edges":[
  {"from":"x","to":"h","label":"U"},{"from":"h","to":"h","label":"W"},{"from":"h","to":"y","label":"V"}]}
```

## Backpropagation

`L = (x * y + z)²` at x = 2, y = 3, z = 4. Forward values ride the grey edges with steps 1 to 3; gradients come back along the red ones with steps 4 to 6. Each gradient edge is listed after its forward twin, so the pair is drawn as two bowed lanes rather than a cycle. `below` prints each operation's output under it, and `mono` sets every label in the code face.

```graph
{"title":"Computation graph with backprop","dir":"right","mono":true,
 "note":"∂L/∂x = 60, ∂L/∂y = 40, ∂L/∂z = 20",
 "nodes":[
  {"id":"x","label":"x = 2","shape":"round"},
  {"id":"y","label":"y = 3","shape":"round"},
  {"id":"z","label":"z = 4","shape":"round","rank":1},
  {"id":"mul","label":"×","shape":"circle","below":"q = 6"},
  {"id":"add","label":"+","shape":"circle","below":"s = 10"},
  {"id":"sq","label":"²","shape":"circle","below":"L = 100"}],
 "edges":[
  {"from":"x","to":"mul","label":"2","step":1},{"from":"y","to":"mul","label":"3","step":1},
  {"from":"mul","to":"add","label":"6","step":2},{"from":"z","to":"add","label":"4","step":2},
  {"from":"add","to":"sq","label":"10","step":3},
  {"from":"sq","to":"add","label":"20","tone":"bad","step":4},
  {"from":"add","to":"mul","label":"20","tone":"bad","step":5},
  {"from":"add","to":"z","label":"20","tone":"bad","step":5},
  {"from":"mul","to":"x","label":"60","tone":"bad","step":6},
  {"from":"mul","to":"y","label":"40","tone":"bad","step":6}]}
```

## Trees

A decision tree is a `tree` whose edges carry the answer that led there and whose leaves carry the class counts underneath.

```tree
{"title":"Iris decision tree","note":"Counts under each leaf: setosa / versicolor / virginica",
 "tree":{"label":"petal length < 2.45","children":[
   {"label":"setosa","tone":"good","edge":"yes","below":"50 / 0 / 0"},
   {"label":"petal width < 1.75","edge":"no","children":[
     {"label":"versicolor","tone":"c1","edge":"yes","below":"0 / 49 / 5"},
     {"label":"virginica","tone":"c2","edge":"no","below":"0 / 1 / 45"}]}]}}
```

A constituency parse uses `shape: "text"`, bare labels with no outline, and `layout: "leaves"`, which puts every word on the bottom row in sentence order. A tone on a text node colours the words.

```tree
{"title":"Constituency parse","layout":"leaves","shape":"text",
 "tree":{"label":"S","children":[
   {"label":"NP","tone":"c1","children":[
     {"label":"Det","children":[{"label":"The"}]},
     {"label":"N","children":[{"label":"cat"}]}]},
   {"label":"VP","tone":"c2","children":[
     {"label":"V","children":[{"label":"sat"}]},
     {"label":"PP","children":[
       {"label":"P","children":[{"label":"on"}]},
       {"label":"NP","tone":"c1","children":[
         {"label":"Det","children":[{"label":"the"}]},
         {"label":"N","children":[{"label":"mat"}]}]}]}]}]}}
```
