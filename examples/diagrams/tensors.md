---
title: Tensor shapes through a CNN
---

The `tensors` fence draws the shape of the activations as they move through a network. A 3-D shape
is a box whose front face is height by width and whose depth is the channel count; a vector is a thin
bar. Sizes grow with the logarithm of each dimension, so a 224 pixel image and a 7 by 7 feature map
both fit on one row.

## ResNet-style classifier

Each stride-2 stage halves the spatial size and doubles the channels until global average pooling
collapses the map to a 512-vector and a fully connected layer produces 1000 logits.

```tensors
{
  "title": "ResNet-18 shapes, 224 x 224 input",
  "note": "Spatial size shrinks 32x while channels grow from 3 to 512",
  "stages": [
    {"dims": [224, 224, 3], "label": "image"},
    {"op": "conv 7x7 /2", "dims": [112, 112, 64]},
    {"op": "maxpool /2", "dims": [56, 56, 64]},
    {"op": "conv 3x3 /2", "dims": [28, 28, 128]},
    {"op": "conv 3x3 /2", "dims": [14, 14, 256]},
    {"op": "conv 3x3 /2", "dims": [7, 7, 512]},
    {"op": "avgpool", "dims": [512], "label": "features"},
    {"op": "fc", "dims": [1000], "label": "logits"}
  ]
}
```

## U-Net encoder

The top of the contracting half of a U-Net on a 572 by 572 grayscale slice. Unpadded 3x3 convolutions trim two
pixels per side, and each max pool halves the map. A 2-D stage is a single channel.

```tensors
{
  "title": "U-Net contracting path, first three levels",
  "note": "conv x2 is two unpadded 3x3 convolutions with ReLU; pool is a 2x2 max pool",
  "stages": [
    {"dims": [572, 572], "label": "input slice"},
    {"op": "conv x2", "dims": [568, 568, 64], "label": "level 1"},
    {"op": "pool", "dims": [284, 284, 64]},
    {"op": "conv x2", "dims": [280, 280, 128], "label": "level 2"},
    {"op": "pool", "dims": [140, 140, 128]},
    {"op": "conv x2", "dims": [136, 136, 256], "label": "level 3"}
  ]
}
```

## Patch embedding

A vision transformer cuts the image into 16 by 16 patches and projects each one to a 768-vector.

```tensors
{
  "title": "ViT-B/16 patch embedding",
  "compact": true,
  "stages": [
    {"dims": [224, 224, 3], "label": "image"},
    {"op": "patchify 16", "dims": [196, 768], "label": "196 tokens"},
    {"op": "+ [CLS]", "dims": [197, 768], "label": "sequence"}
  ]
}
```
