---
title: ML evaluation charts
---

Training and evaluation plots are `chart` kinds, not new fences. `chart heatmap` gains `emphasis` and
`decimals`, `chart lines` gains per-series `points`, `refs`, axis titles and `square`, and
`chart scatter` gains coloured `series` and centroid `marks`.

## Confusion matrix

Rows are the true class, columns the prediction. `emphasis: "diagonal"` outlines the correct cells, so the
off-diagonal mass reads as the error at a glance: dogs and cats get confused with each other, birds rarely.

```chart heatmap
{
  "title": "Validation confusion matrix, 1,600 images",
  "note": "Rows are truth, columns are predictions. Diagonal cells are correct",
  "format": "int",
  "emphasis": "diagonal",
  "rows": ["cat", "dog", "bird", "fish"],
  "cols": ["cat", "dog", "bird", "fish"],
  "values": [
    [352, 38, 7, 3],
    [41, 344, 9, 6],
    [6, 5, 381, 8],
    [2, 4, 11, 383]
  ]
}
```

## Attention weights

One head of a small encoder. Each row is a query token and sums to 1. `decimals: 2` prints every cell to two
places, so 0.05 sits beside 0.60 as a column of numbers rather than rounding away.

```chart heatmap
{
  "title": "Layer 4, head 2 attention",
  "note": "Rows are queries, columns are keys. \"sat\" attends mostly to its subject \"cat\"",
  "decimals": 2,
  "rows": ["The","cat","sat","on","the","mat"],
  "cols": ["The","cat","sat","on","the","mat"],
  "values": [
    [0.62,0.14,0.08,0.05,0.06,0.05],
    [0.21,0.48,0.17,0.04,0.03,0.07],
    [0.06,0.41,0.33,0.09,0.03,0.08],
    [0.03,0.08,0.36,0.29,0.07,0.17],
    [0.04,0.05,0.06,0.12,0.38,0.35],
    [0.02,0.19,0.22,0.07,0.11,0.39]
  ]
}
```

## ROC curves

Each series carries its own `[x, y]` points, so two models evaluated at different thresholds share one
axis. The `"diagonal"` ref is a random classifier; `square` keeps the plot 1:1 so the curves are not
stretched.

```chart lines
{
  "title": "ROC, held-out test set",
  "xTitle": "false positive rate",
  "yTitle": "true positive rate",
  "square": true,
  "refs": ["diagonal"],
  "series": [
    {
      "name": "gradient boosting, AUC 0.93",
      "points": [
        [0,0], [0.007,0.06], [0.024,0.194], [0.049,0.365], [0.082,0.539], [0.123,0.694],
        [0.171,0.815], [0.226,0.9], [0.287,0.952], [0.355,0.981], [0.429,0.994], [0.509,0.998],
        [0.596,1], [0.688,1], [0.786,1], [0.89,1], [1,1]
      ]
    },
    {
      "name": "logistic regression, AUC 0.81",
      "points": [
        [0,0], [0.013,0.042], [0.046,0.141], [0.096,0.277], [0.162,0.432], [0.242,0.588],
        [0.336,0.73], [0.443,0.847], [0.564,0.93], [0.697,0.978], [0.842,0.997], [1,1]
      ]
    }
  ]
}
```

## Precision and recall

A no-skill classifier sits at the positive rate, here 0.30, drawn as a labelled y ref.

```chart lines
{
  "title": "Precision-recall, gradient boosting",
  "xTitle": "recall",
  "yTitle": "precision",
  "square": true,
  "refs": [{ "y": 0.3, "label": "no skill 0.30" }],
  "series": [
    { "name": "AP 0.86", "points": [
        [0,0.98], [0.077,0.98], [0.154,0.978], [0.231,0.974], [0.308,0.964], [0.385,0.948], [0.462,0.923],
        [0.538,0.886], [0.615,0.836], [0.692,0.77], [0.769,0.686], [0.846,0.582], [0.923,0.454], [1,0.3]
      ] }
  ]
}
```

## Loss curves

Train loss is logged every epoch and validation every fourth, so the two series have different x. On a log
y axis the gap opens after epoch 20; the x ref marks the epoch early stopping kept.

```chart lines
{
  "title": "Cross-entropy loss, log10 y",
  "note": "Validation bottoms out at epoch 24 and climbs after it",
  "xTitle": "epoch",
  "yScale": "log10",
  "refs": [{ "x": 24, "label": "early stop" }],
  "series": [
    { "name": "train", "points": [
        [1,1.9828], [2,1.7763], [3,1.5965], [4,1.4305], [5,1.2751], [6,1.1453],
        [7,1.0242], [8,0.9179], [9,0.8224], [10,0.7367], [11,0.6666], [12,0.5921],
        [13,0.5333], [14,0.4783], [15,0.4278], [16,0.3851], [17,0.3476], [18,0.3109],
        [19,0.2804], [20,0.2575], [21,0.2261], [22,0.2082], [23,0.1835], [24,0.1674],
        [25,0.1533], [26,0.1354], [27,0.1245], [28,0.1126], [29,0.0999], [30,0.0905],
        [31,0.0828], [32,0.0755], [33,0.0704], [34,0.0677], [35,0.0617], [36,0.0538],
        [37,0.0488], [38,0.0502], [39,0.043], [40,0.0427], [41,0.0387], [42,0.0364],
        [43,0.0353], [44,0.0326], [45,0.0275], [46,0.0355], [47,0.028], [48,0.0254],
        [49,0.0235], [50,0.0245], [51,0.0208], [52,0.0202], [53,0.0184], [54,0.0229],
        [55,0.0197], [56,0.0198], [57,0.0199], [58,0.0191], [59,0.0158], [60,0.0184]
      ] },
    { "name": "validation", "tone": "bad", "points": [
        [4,1.5397], [8,1.0155], [12,0.6751], [16,0.4601], [20,0.3178], [24,0.2294],
        [28,0.1688], [32,0.1478], [36,0.1296], [40,0.1312], [44,0.1476], [48,0.1876],
        [52,0.2151], [56,0.2912], [60,0.3616]
      ] }
  ]
}
```

## Learning rate schedule

Linear warmup over 500 steps, then cosine decay to zero. The y axis keeps the data's own precision.

```chart lines
{
  "title": "Learning rate, warmup then cosine",
  "xTitle": "step",
  "yTitle": "learning rate",
  "refs": [{ "x": 500, "label": "warmup end" }],
  "series": [
    { "name": "lr", "points": [
        [0,0], [100,0.00006], [200,0.00012], [300,0.00018], [400,0.00024], [500,0.0003],
        [600,0.0003], [700,0.000299], [800,0.000298], [900,0.000296], [1000,0.000294], [1100,0.000291],
        [1200,0.000288], [1300,0.000285], [1400,0.000281], [1500,0.000276], [1600,0.000271], [1700,0.000266],
        [1800,0.000261], [1900,0.000255], [2000,0.000248], [2100,0.000242], [2200,0.000235], [2300,0.000227],
        [2400,0.00022], [2500,0.000212], [2600,0.000204], [2700,0.000196], [2800,0.000188], [2900,0.00018],
        [3000,0.000171], [3100,0.000163], [3200,0.000154], [3300,0.000146], [3400,0.000137], [3500,0.000129],
        [3600,0.00012], [3700,0.000112], [3800,0.000104], [3900,0.0000956], [4000,0.0000877], [4100,0.00008],
        [4200,0.0000725], [4300,0.0000653], [4400,0.0000584], [4500,0.0000518], [4600,0.0000455], [4700,0.0000395],
        [4800,0.0000339], [4900,0.0000286], [5000,0.0000238], [5100,0.0000194], [5200,0.0000154], [5300,0.0000118],
        [5400,0.00000872], [5500,0.00000608], [5600,0.0000039], [5700,0.0000022], [5800,9.78e-7], [5900,2.45e-7],
        [6000,0]
      ] }
  ]
}
```

## Embedding clusters

Sentence embeddings projected to two dimensions, coloured by topic. `marks` puts a labelled cross on each
k-means centroid.

```chart scatter
{
  "title": "Sentence embeddings by topic, UMAP",
  "note": "Crosses are k-means centroids with k = 4",
  "xTitle": "UMAP 1",
  "yTitle": "UMAP 2",
  "series": [
    {
      "name": "sports",
      "points": [
        [-4.63,2.73], [-1.98,1.79], [-2.53,2.93], [-3.23,2.66], [-3.31,1.45], [-2.57,1.82],
        [-3.22,3.18], [-4.8,1.38], [-3.3,2.54], [-3.2,2.19], [-3.86,1.14], [-3.22,1.95],
        [-3.97,2.33], [-3.31,1.58], [-1.56,2.67], [-3.93,2.74], [-4.23,0.8], [-3.94,2.42],
        [-3.36,2.8], [-4.32,1.84], [-2.59,0.71], [-3.46,1.45], [-2.34,1.45], [-2.99,1.31],
        [-2.34,2.28], [-3.37,2.13], [-2.89,1.83], [-3.19,1.34], [-3.87,2.94], [-4.38,2.6],
        [-5.1,2.73], [-4.38,2.01], [-4.17,2.14], [-4.42,0.67]
      ]
    },
    {
      "name": "finance",
      "points": [
        [2.33,3.55], [2.81,2.24], [3.38,4.71], [3.85,4.51], [5.3,1.72], [4.21,4.5],
        [2.29,3.12], [5.79,4.09], [2.89,3.9], [3.67,2.58], [5.14,3.22], [1.87,1.83],
        [2.53,2.63], [3.22,3.43], [5.06,3], [4.69,3.19], [2.26,3.07], [2.96,2.2],
        [5.48,2.71], [3.05,4.33], [2.75,3.74], [2.89,4.22], [2.21,3.37], [2.76,3.35],
        [2.55,2.85], [4.69,4.84], [4.05,1.97], [3.6,2.1], [0.97,3.09], [4.48,3.12]
      ]
    },
    {
      "name": "cooking",
      "points": [
        [0.93,-2.95], [-0.38,-2.59], [1.45,-3.6], [0.32,-2.26], [-0.55,-3.22], [0.28,-3.96],
        [-1.68,-2.73], [-2.07,-2.45], [-0.5,-3.97], [-1.76,-3.64], [2.91,-3.59], [0.48,-2.4],
        [0.38,-2.64], [0.09,-2.37], [0.62,-2.67], [1.25,-2.35], [-0.64,-2.6], [0.1,-2.31],
        [-0.44,-3.26], [-1.19,-3.95], [1.15,-2.74], [-0.26,-2.02], [-0.86,-2.88], [2.59,-2.85],
        [-0.29,-4.5], [0.63,-3.31], [0.58,-2.95], [2.45,-2.48], [1.82,-4.03], [2.21,-0.87],
        [1.63,-2.03], [2.79,-2.77]
      ]
    },
    {
      "name": "travel",
      "points": [
        [5.44,0.05], [3.97,-1.26], [5.83,0.24], [3.82,-2.47], [3.08,-0.47], [4.77,-2.62],
        [4.5,-0.42], [3.87,-2.13], [5.51,-1.92], [5.88,-0.35], [4.76,-1.76], [4.56,-0.67],
        [3.69,-0.85], [4,-1.67], [5.17,-0.5], [4.46,-2.1], [4.75,-1.17], [4.1,-1.73],
        [2.93,-2.31], [4.18,-0.99], [3.89,-2.18], [4.5,-0.46]
      ]
    }
  ],
  "marks": [
    { "at": [-3.47,2.02], "label": "k1" },
    { "at": [3.46,3.24], "label": "k2" },
    { "at": [0.44,-2.9], "label": "k3" },
    { "at": [4.44,-1.26], "label": "k4" }
  ]
}
```
