---
packages:
  redis-on-workers:
    type: minor
---

### Rewrite the client around a pull-based RESP decoder

The API shrinks to `send`, `sendRaw`, `close`, and `await using`. `sendOnce`, `sendOnceRaw`, `pipeline`, `isConnected`, `connection()`, and `RedisInstance` are gone. Use `await using` and `Promise.all` instead. A server error reply rejects its command with a `RedisError` and keeps the connection open. A transport failure closes the connection.
