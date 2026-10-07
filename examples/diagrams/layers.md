---
title: Layered systems
---

Two stacks every systems course draws. The `layers` fence lists them top to bottom; a pyramid widens downward to say "bigger and slower", a plain stack keeps every layer the same width.

## Memory hierarchy

Each step down is roughly an order of magnitude more capacity and an order of magnitude more latency.

```layers
{
  "title": "Memory hierarchy",
  "note": "Typical latencies on a 2025 desktop part",
  "items": [
    { "label": "Registers", "note": "< 1 ns" },
    { "label": "L1 cache", "note": "~1 ns, 48 KB" },
    { "label": "L2 cache", "note": "~4 ns, 2 MB" },
    { "label": "L3 cache", "note": "~15 ns, 32 MB" },
    { "label": "DRAM", "note": "~80 ns, 64 GB" },
    { "label": "NVMe SSD", "note": "~100 µs, 2 TB" }
  ]
}
```

## Network stack

`shape: stack` for layers that are peers in size, with tones picking out the layers this course covers.

```layers
{
  "title": "TCP/IP stack",
  "shape": "stack",
  "items": [
    { "label": "Application", "note": "HTTP, DNS, SSH", "tone": "flat" },
    { "label": "Transport", "note": "TCP, UDP, QUIC", "tone": "c1" },
    { "label": "Network", "note": "IP, ICMP", "tone": "c3" },
    { "label": "Link", "note": "Ethernet, Wi-Fi", "tone": "flat" },
    { "label": "Physical", "note": "copper, fibre, radio", "tone": "flat" }
  ]
}
```
