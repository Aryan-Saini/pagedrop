---
title: Log axes
---

`chart lines` and `chart scatter` take `xScale` and `yScale`: `linear`, `log2` or `log10`. Ticks sit on
powers of the base, so doubling or a tenfold change reads as one even step. `lines` can also take
numeric `x` positions, and a series with `dashed: true` is a reference line.

## Speedup against processor count

Amdahl's law caps speedup at 1/f for a serial fraction f. On log2 axes ideal scaling is a straight
diagonal, and every Amdahl curve bends away from it.

```chart lines
{
  "title": "Speedup vs processors, log2 on both axes",
  "note": "Ideal is dashed. At P = 64 a 5% serial fraction already loses three quarters of the machine",
  "xScale": "log2",
  "yScale": "log2",
  "x": [1, 2, 4, 8, 16, 32, 64],
  "series": [
    { "name": "Ideal", "values": [1, 2, 4, 8, 16, 32, 64], "dashed": true, "tone": "flat" },
    { "name": "Amdahl f = 5%", "values": [1, 1.9, 3.48, 5.93, 9.14, 12.55, 15.42] },
    { "name": "Amdahl f = 20%", "values": [1, 1.67, 2.5, 3.33, 4, 4.44, 4.71] }
  ]
}
```

## Training loss

Loss falls by orders of magnitude, so a linear axis flattens everything after the first few epochs.
On log10 the gap between train and validation stays visible: the model starts to overfit near epoch 20.

```chart lines
{
  "title": "Cross-entropy loss by epoch, log10 y",
  "note": "Epochs are numeric x, so the uneven checkpoints sit at their true positions",
  "format": "int",
  "yScale": "log10",
  "x": [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30],
  "series": [
    { "name": "Train", "values": [1.802, 1.406, 1.098, 0.858, 0.671, 0.526, 0.324, 0.203, 0.129, 0.07, 0.033, 0.024, 0.023] },
    { "name": "Validation", "values": [1.903, 1.538, 1.245, 1.012, 0.825, 0.675, 0.461, 0.324, 0.238, 0.165, 0.117, 0.106, 0.108], "tone": "bad" }
  ]
}
```

## Memory latency by working set

A pointer chase over arrays from 4 KiB to 256 MiB. Each cache level is a plateau and each cliff is a
level running out. Log10 on both axes keeps a 4 KiB array and a 256 MiB one, and L1 and DRAM latency,
on the same chart.

```chart scatter
{
  "title": "Latency per load vs working set, log-log",
  "note": "Plateaus at L1 (48 KiB), L2 (2 MiB) and L3 (36 MiB), then DRAM",
  "xTitle": "working set, bytes",
  "yTitle": "ns per load",
  "xScale": "log10",
  "yScale": "log10",
  "points": [
    { "x": 4096, "y": 1.1, "label": "4 KiB" },
    { "x": 16384, "y": 1.1, "label": "16 KiB" },
    { "x": 32768, "y": 1.2, "label": "32 KiB" },
    { "x": 131072, "y": 3.9, "label": "128 KiB" },
    { "x": 524288, "y": 4.3, "label": "512 KiB" },
    { "x": 1048576, "y": 4.6, "label": "1 MiB" },
    { "x": 4194304, "y": 14, "label": "4 MiB" },
    { "x": 16777216, "y": 17, "label": "16 MiB" },
    { "x": 67108864, "y": 71, "label": "64 MiB" },
    { "x": 268435456, "y": 88, "label": "256 MiB" }
  ]
}
```
