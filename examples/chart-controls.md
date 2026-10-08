---
title: Switchable charts
---

A chart can carry `views` (tabs over one chart slot) and `controls` (a settings menu behind the icon at the top right). Every combination is drawn ahead of time, so switching works without a script.

## Three metrics, one slot

Each tab is a different x metric. The settings menu flips the x axis between log and linear, and hides the point labels, the Pareto frontier and the shaded quadrant. Click a provider in the legend to hide it. Table swaps the plot for its numbers.

```chart scatter
{
  "title": "Intelligence index vs cost, speed and latency",
  "yTitle": "Intelligence index",
  "format": "int",
  "xScale": "log10",
  "labels": true,
  "pareto": "top-left",
  "quadrant": "top-left",
  "series": [
    {
      "name": "Atlas",
      "points": [
        [
          20,
          58,
          "Atlas Ultra"
        ],
        [
          4.1,
          56,
          "Atlas Pro"
        ],
        [
          0.4,
          44,
          "Atlas Mini"
        ]
      ]
    },
    {
      "name": "Borealis",
      "points": [
        [
          9.5,
          57,
          "Borealis 3"
        ],
        [
          1.2,
          49,
          "Borealis 3 Fast"
        ]
      ]
    },
    {
      "name": "Cirrus",
      "points": [
        [
          3.3,
          55,
          "Cirrus Deep"
        ],
        [
          0.35,
          47,
          "Cirrus Flash"
        ]
      ]
    },
    {
      "name": "Dune",
      "points": [
        [
          0.9,
          52,
          "Dune R2"
        ],
        [
          0.25,
          45,
          "Dune V4"
        ]
      ]
    },
    {
      "name": "Ember",
      "points": [
        [
          0.6,
          38,
          "Ember 70B"
        ],
        [
          0.07,
          31,
          "Ember 8B"
        ]
      ]
    },
    {
      "name": "Fjord",
      "points": [
        [
          1.8,
          41,
          "Fjord Large"
        ],
        [
          0.1,
          33,
          "Fjord Small"
        ]
      ]
    }
  ],
  "xTitle": "Cost per task (USD)",
  "views": [
    {
      "label": "vs Cost per task"
    },
    {
      "label": "vs Output speed",
      "series": [
        {
          "name": "Atlas",
          "points": [
            [
              52,
              58,
              "Atlas Ultra"
            ],
            [
              88,
              56,
              "Atlas Pro"
            ],
            [
              190,
              44,
              "Atlas Mini"
            ]
          ]
        },
        {
          "name": "Borealis",
          "points": [
            [
              71,
              57,
              "Borealis 3"
            ],
            [
              160,
              49,
              "Borealis 3 Fast"
            ]
          ]
        },
        {
          "name": "Cirrus",
          "points": [
            [
              95,
              55,
              "Cirrus Deep"
            ],
            [
              240,
              47,
              "Cirrus Flash"
            ]
          ]
        },
        {
          "name": "Dune",
          "points": [
            [
              64,
              52,
              "Dune R2"
            ],
            [
              85,
              45,
              "Dune V4"
            ]
          ]
        },
        {
          "name": "Ember",
          "points": [
            [
              120,
              38,
              "Ember 70B"
            ],
            [
              310,
              31,
              "Ember 8B"
            ]
          ]
        },
        {
          "name": "Fjord",
          "points": [
            [
              105,
              41,
              "Fjord Large"
            ],
            [
              280,
              33,
              "Fjord Small"
            ]
          ]
        }
      ],
      "xTitle": "Output tokens per second",
      "xScale": "linear",
      "pareto": "top-right",
      "quadrant": "top-right"
    },
    {
      "label": "vs Latency",
      "series": [
        {
          "name": "Atlas",
          "points": [
            [
              9.1,
              58,
              "Atlas Ultra"
            ],
            [
              3.2,
              56,
              "Atlas Pro"
            ],
            [
              0.9,
              44,
              "Atlas Mini"
            ]
          ]
        },
        {
          "name": "Borealis",
          "points": [
            [
              6.4,
              57,
              "Borealis 3"
            ],
            [
              1.4,
              49,
              "Borealis 3 Fast"
            ]
          ]
        },
        {
          "name": "Cirrus",
          "points": [
            [
              4.8,
              55,
              "Cirrus Deep"
            ],
            [
              0.7,
              47,
              "Cirrus Flash"
            ]
          ]
        },
        {
          "name": "Dune",
          "points": [
            [
              7.5,
              52,
              "Dune R2"
            ],
            [
              1.9,
              45,
              "Dune V4"
            ]
          ]
        },
        {
          "name": "Ember",
          "points": [
            [
              1.1,
              38,
              "Ember 70B"
            ],
            [
              0.4,
              31,
              "Ember 8B"
            ]
          ]
        },
        {
          "name": "Fjord",
          "points": [
            [
              2.2,
              41,
              "Fjord Large"
            ],
            [
              0.5,
              33,
              "Fjord Small"
            ]
          ]
        }
      ],
      "xTitle": "Time to answer (s)"
    }
  ],
  "controls": [
    "log-x",
    "labels",
    "pareto",
    "quadrant",
    "legend",
    "table"
  ]
}
```

## Log scales on a training curve

```chart lines
{
  "title": "Training loss",
  "xTitle": "Step",
  "yTitle": "Loss",
  "x": [
    100,
    200,
    400,
    800,
    1600,
    3200,
    6400,
    12800
  ],
  "series": [
    {
      "name": "Train",
      "values": [
        4.1,
        3.2,
        2.5,
        1.9,
        1.4,
        1.05,
        0.82,
        0.66
      ]
    },
    {
      "name": "Validation",
      "values": [
        4.2,
        3.3,
        2.7,
        2.1,
        1.7,
        1.45,
        1.38,
        1.36
      ]
    }
  ],
  "zeroFloor": false,
  "controls": [
    "log-x",
    "log-y",
    "legend",
    "table"
  ]
}
```

## Sorting bars

```chart bars
{
  "title": "Benchmarks, Atlas Pro",
  "format": "pct",
  "labels": [
    "Coding",
    "Math",
    "Agentic",
    "Tool use",
    "Long context",
    "Science"
  ],
  "values": [
    0.71,
    0.64,
    0.48,
    0.77,
    0.59,
    0.66
  ],
  "views": [
    {
      "label": "Score"
    },
    {
      "label": "Change vs last release",
      "values": [
        0.09,
        0.04,
        0.12,
        0.02,
        0.07,
        0.03
      ]
    }
  ],
  "controls": [
    "sort",
    "table"
  ]
}
```

