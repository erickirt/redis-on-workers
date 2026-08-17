# `redis-on-workers`

Connect to your Redis server in Cloudflare Workers using `cloudflare:sockets`.

Use this package in Cloudflare Workers or Node.js with the [`cloudflare:sockets` for Node.js](https://github.com/Ethan-Arrowood/socket) implementation.

## Installation

```sh
npm install redis-on-workers
```

## Usage

### Minimal

Connect to a Redis server.

```ts
import { createRedis } from "redis-on-workers";

const redis = createRedis("redis://<username>:<password>@<host>:<port>");

await redis.send("SET", "foo", "bar");

const value = await redis.send("GET", "foo");

console.log(value); // bar

// Close the connection after use, or call `redis.sendOnce`.
await redis.close();
```

### Automatic cleanup

`Redis` supports `await using`. The connection closes when the block ends.

```ts
import { createRedis } from "redis-on-workers";

await using redis = createRedis("redis://<username>:<password>@<host>:<port>");

await redis.send("SET", "foo", "bar");
```

### Pipeline

Send multiple commands in one write. Replies come back in the same order.

```ts
const [, value] = await redis.pipeline([
  ["SET", "foo", "bar"],
  ["GET", "foo"],
]);

console.log(value); // bar
```

### Raw Uint8Array

Use this API to store binary data, such as protobuf messages.

```ts
import { createRedis } from "redis-on-workers";

const redis = createRedis("redis://<username>:<password>@<host>:<port>");

await redis.sendRaw("SET", "foo", "bar");

const value = await redis.sendOnceRaw("GET", "foo");

const decoder = new TextDecoder();

console.log(decoder.decode(value)); // bar
```

### Node.js

Install the `cloudflare:sockets` Node.js polyfill:

```sh
npm install @arrowood.dev/socket
```

## API

### `createRedis(options: CreateRedisOptions | string): Redis`

Create a Redis client. It connects when you send the first command.

### `CreateRedisOptions`

- `url` (string): The URL of the Redis server.
- `tls` (boolean): Whether to use TLS. Default: `false`.
- `logger` (function): A function to log debug messages.
- `connectFn` (function): Polyfill for `cloudflare:sockets`'s `connect` function if you're using it in node.js. Default: `undefined`.

## License

MIT
