---
title: Interconnect topologies
---

The `topology` fence draws a network from its kind and size. Diameter, bisection width and degree
are what separate these: a ring is cheap and slow, a complete graph is fast and costs n(n-1)/2 links.

## Rings, lines and stars

```topology
{ "title": "Ring of 8", "note": "Diameter 4, bisection 2", "kind": "ring", "size": 8, "compact": true }
```

```topology
{ "title": "Line of 6", "note": "Diameter 5, bisection 1", "kind": "line", "size": 6, "compact": true }
```

```topology
{ "title": "Star of 6", "note": "Hub 0; diameter 2, but every message crosses the hub", "kind": "star", "size": 6, "compact": true }
```

```topology
{ "title": "Complete graph on 5", "note": "10 links, diameter 1", "kind": "complete", "size": 5, "compact": true }
```

## Meshes and tori

A 2D mesh labels nodes by row and column. The torus adds a wraparound link to every row and column,
halving the diameter; the dashed loops around the outside are those links.

```topology
{ "title": "4 x 4 mesh", "note": "Diameter 6, bisection 4", "kind": "mesh", "size": 4, "compact": true }
```

```topology
{
  "title": "4 x 4 torus",
  "note": "Diameter 4, bisection 8. Route 0,0 to 0,3 uses one wraparound hop",
  "kind": "torus",
  "size": 4,
  "path": [0, 3, 7],
  "compact": true
}
```

## Hypercubes

Node addresses are binary and two nodes link when they differ in exactly one bit. Edge colour is the
bit that differs. E-cube routing fixes bits from lowest to highest: 000, 001, 011, 111.

```topology
{
  "title": "3-cube with an e-cube route",
  "note": "000 -> 001 -> 011 -> 111: one hop per differing bit",
  "kind": "hypercube",
  "size": 3,
  "path": [0, 1, 3, 7]
}
```

```topology
{ "title": "4-cube", "note": "Two 3-cubes joined on bit 3; 16 nodes, 32 links, diameter 4", "kind": "hypercube", "size": 4 }
```

## Trees

```topology
{ "title": "Binary tree of depth 3", "note": "15 nodes; bisection width 1, so the root is the bottleneck", "kind": "tree", "size": 3 }
```
