---
title: Fully connected networks
---

The `nn` fence draws a multilayer perceptron from nothing but its layer sizes. Every neuron in one
column connects to every neuron in the next; labels, column names, weights and dropout are optional.

## A small classifier

Three features in, two classes out, two hidden layers of four. The input and output labels sit beside
their neurons and each column is named underneath.

```nn
{
  "title": "3-4-4-2 classifier",
  "note": "Four numbers describe the whole network; 3*4 + 4*4 + 4*2 = 36 weights",
  "layers": [3, 4, 4, 2],
  "inputs": ["x1", "x2", "x3"],
  "outputs": ["y1", "y2"],
  "names": ["input", "hidden 1", "hidden 2", "output"]
}
```

## Autoencoder

An autoencoder squeezes its input through a narrow code and reconstructs it. Blank names leave a
column unlabelled, and per-layer tones separate the encoder, the code and the decoder.

```nn
{
  "title": "Autoencoder with a 2-unit code",
  "note": "The bottleneck forces a compressed representation of the 8 inputs",
  "layers": [8, 5, 2, 5, 8],
  "names": ["input", "encoder", "code", "decoder", "reconstruction"],
  "tones": ["", "c1", "span", "c3", ""]
}
```

## MNIST

A 28 by 28 image flattens to 784 inputs. Layers wider than twelve neurons draw their first five and
last five around an ellipsis, and every column prints its true size on top.

```nn
{
  "title": "MNIST MLP 784-128-64-10",
  "note": "784*128 + 128*64 + 64*10 = 109,184 weights; the ellipsis hides all but 10 units per wide layer",
  "layers": [784, 128, 64, 10],
  "outputs": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  "names": ["pixels", "hidden 1", "hidden 2", "digit"]
}
```

## Weights and dropout

With `weights: true` each edge gets an illustrative weight: blue is positive, orange negative, and
opacity and width follow its magnitude. The weights are seeded from the layer sizes, so the picture is
the same on every render. `dropout` lists `[layer, neuron]` pairs that are switched off for this
training step: they draw hollow and lose every edge.

```nn
{
  "title": "One training step with dropout p = 0.25",
  "note": "Dropped units [1,1], [2,0] and [2,3] carry no signal in either direction this step",
  "layers": [4, 5, 5, 3],
  "inputs": ["age", "income", "tenure", "visits"],
  "outputs": ["stay", "churn", "upgrade"],
  "names": ["features", "hidden 1", "hidden 2", "softmax"],
  "weights": true,
  "dropout": [[1, 1], [2, 0], [2, 3]]
}
```

## Side by side

`compact` drops the minimum width so two small networks share a row.

```nn
{
  "title": "Perceptron",
  "layers": [3, 1],
  "inputs": ["x1", "x2", "x3"],
  "outputs": ["y"],
  "compact": true
}
```

```nn
{
  "title": "XOR network",
  "layers": [2, 2, 1],
  "inputs": ["a", "b"],
  "outputs": ["a xor b"],
  "weights": true,
  "compact": true
}
```
