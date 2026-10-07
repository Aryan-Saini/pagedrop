---
title: Message passing between Erlang processes
---

Erlang processes share nothing. They talk by sending messages, and a send never waits for the receiver. These timelines show what that means for when a message is handled and in what order messages arrive.

## Sends do not block

The sender carries on as soon as the message is in the receiver's mailbox. The receiver only sees it when it next runs `receive`.

```lanes
{
  "title": "Message passing in Erlang is asynchronous",
  "note": "Msg waits in the mailbox until Pid2 reaches receive",
  "axis": "time (ms)",
  "lanes": [
    { "name": "Pid1", "segs": [
      { "from": 0, "to": 1.4, "label": "busy", "state": "busy" },
      { "from": 1.4, "to": 3.2, "label": "Pid2 ! Msg", "state": "send" },
      { "from": 3.2, "to": 9, "label": "busy", "state": "busy" }
    ] },
    { "name": "Pid2", "segs": [
      { "from": 0, "to": 5.4, "label": "busy", "state": "busy" },
      { "from": 5.4, "to": 7.6, "label": "receive ...", "state": "recv" },
      { "from": 7.6, "to": 9, "label": "busy", "state": "busy" }
    ] }
  ],
  "msgs": [
    { "from": { "lane": "Pid1", "t": 3.0 }, "to": { "lane": "Pid2", "t": 5.6 }, "label": "Msg" }
  ]
}
```

## Ordering is per sender

Erlang guarantees that two messages from the same sender arrive in the order sent. Nothing is promised across senders, so a message relayed through a third process can overtake one sent directly.

```lanes
{
  "title": "Message ordering",
  "note": "M32 overtakes M12: only same-sender order is guaranteed",
  "lanes": [
    { "name": "Pid1", "segs": [
      { "from": 0, "to": 1.2, "label": "busy", "state": "busy" },
      { "from": 1.2, "to": 2.6, "label": "Pid2!M12", "state": "send" },
      { "from": 2.6, "to": 4, "label": "Pid3!M13", "state": "send" },
      { "from": 4, "to": 5.2, "label": "busy", "state": "busy" },
      { "from": 5.2, "to": 11.8, "label": "idle", "state": "idle" }
    ] },
    { "name": "Pid2", "segs": [
      { "from": 0, "to": 1.4, "label": "receive", "state": "recv" },
      { "from": 1.4, "to": 9, "label": "blocked", "state": "blocked" },
      { "from": 9, "to": 10.4, "label": "?M32", "state": "recv" },
      { "from": 10.4, "to": 11.8, "label": "?M12", "state": "recv" }
    ] },
    { "name": "Pid3", "segs": [
      { "from": 0, "to": 4.4, "label": "busy", "state": "busy" },
      { "from": 4.4, "to": 5.8, "label": "receive", "state": "recv" },
      { "from": 5.8, "to": 6.4, "state": "blocked" },
      { "from": 6.4, "to": 7.6, "label": "?M13", "state": "recv" },
      { "from": 7.6, "to": 9, "label": "Pid2!M32", "state": "send" },
      { "from": 9, "to": 11.8, "label": "busy", "state": "busy" }
    ] }
  ],
  "msgs": [
    { "from": { "lane": "Pid1", "t": 2.2 }, "to": { "lane": "Pid2", "t": 11.2 }, "label": "M12", "step": 1 },
    { "from": { "lane": "Pid1", "t": 3.6 }, "to": { "lane": "Pid3", "t": 6.9 }, "label": "M13", "step": 2 },
    { "from": { "lane": "Pid3", "t": 8.6 }, "to": { "lane": "Pid2", "t": 9.6 }, "label": "M32", "step": 3 }
  ]
}
```

The numbered badges give send order. Pid2 handles M32 (sent third) before M12 (sent first) because its `receive` pattern matched M32 first.

## Side by side

`compact` drops the minimum width so two small timelines can sit in a narrow column.

```lanes
{
  "title": "Request and reply",
  "compact": true,
  "lanes": [
    { "name": "client", "segs": [
      { "from": 0, "to": 1, "label": "send", "state": "send" },
      { "from": 1, "to": 4, "label": "waiting", "state": "blocked" },
      { "from": 4, "to": 5, "label": "recv", "state": "recv" }
    ] },
    { "name": "server", "segs": [
      { "from": 0, "to": 1.5, "state": "idle" },
      { "from": 1.5, "to": 3.5, "label": "handle", "state": "busy" },
      { "from": 3.5, "to": 5, "state": "idle" }
    ] }
  ],
  "msgs": [
    { "from": { "lane": "client", "t": 0.8 }, "to": { "lane": "server", "t": 1.6 }, "label": "req" },
    { "from": { "lane": "server", "t": 3.4 }, "to": { "lane": "client", "t": 4.1 }, "label": "reply" }
  ]
}
```
