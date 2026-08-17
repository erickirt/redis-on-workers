---
packages:
  redis-on-workers:
    type: minor
---

### Rewrite the client around a pull-based RESP decoder

`RedisInstance` becomes `Redis`, with `pipeline` and `await using` support. The public `connection()` method is removed, and a RESP protocol error now closes the connection.
