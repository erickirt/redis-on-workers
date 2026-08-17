import { expect, test } from "bun:test";
import { createRedis } from "../src";
import { decodeResp } from "../src/lib/resp";

const decoder = new TextDecoder();

function createPushReader() {
  const chunks: Uint8Array[] = [];
  let notify: (() => void) | undefined;

  return {
    push(chunk: Uint8Array) {
      chunks.push(chunk);
      notify?.();
    },
    async read(): Promise<{ value?: Uint8Array; done: boolean }> {
      while (chunks.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }

      return { value: chunks.shift(), done: false };
    },
  };
}

function startFakeRedis(handler: (command: string[]) => string) {
  const commands: string[][] = [];

  const server = Bun.listen<{ push(chunk: Uint8Array): void }>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        const reader = createPushReader();

        socket.data = reader;

        void (async () => {
          for await (const value of decodeResp(reader)) {
            if (!Array.isArray(value)) continue;

            const command = value.map((arg) =>
              arg instanceof Uint8Array ? decoder.decode(arg) : String(arg),
            );

            commands.push(command);
            socket.write(handler(command));
          }
        })();
      },
      data(socket, chunk) {
        socket.data.push(new Uint8Array(chunk));
      },
    },
  });

  return {
    url: `redis://127.0.0.1:${server.port}`,
    commands,
    stop: () => server.stop(true),
  };
}

function defaultHandler(command: string[]) {
  switch (command[0]) {
    case "PING":
      return "+PONG\r\n";
    case "AUTH":
    case "SELECT":
    case "SET":
      return "+OK\r\n";
    case "GET":
      return "$3\r\nbar\r\n";
    case "ECHO":
      return `$${command[1]?.length ?? 0}\r\n${command[1] ?? ""}\r\n`;
    default:
      return `-ERR unknown command '${command[0]}'\r\n`;
  }
}

test("send and sendRaw", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    const redis = createRedis(server.url);

    expect(await redis.sendRaw("PING")).toEqual(new TextEncoder().encode("PONG"));
    expect(await redis.send("SET", "foo", "bar")).toBe("OK");
    expect(await redis.send("GET", "foo")).toBe("bar");
    expect(await redis.isConnected()).toBe(true);

    await redis.close();

    expect(await redis.isConnected()).toBe(false);
  } finally {
    server.stop();
  }
});

test("error reply rejects", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    const redis = createRedis(server.url);

    expect(redis.sendOnce("MY_GO")).rejects.toThrow("ERR unknown command 'MY_GO'");
  } finally {
    server.stop();
  }
});

test("auth and select run before the first command", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    const redis = createRedis(`${server.url.replace("redis://", "redis://user:secret@")}/2`);

    await redis.send("PING");
    await redis.close();

    expect(server.commands.slice(0, 2)).toEqual([
      ["AUTH", "user", "secret"],
      ["SELECT", "2"],
    ]);
  } finally {
    server.stop();
  }
});

test("concurrent sends keep replies matched", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    const redis = createRedis(server.url);

    const payloads = Array.from({ length: 10 }, (_, index) => `value-${index}`);
    const replies = await Promise.all(payloads.map((payload) => redis.send("ECHO", payload)));

    expect(replies).toEqual(payloads);

    await redis.close();
  } finally {
    server.stop();
  }
});

test("pipeline returns replies in order", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    const redis = createRedis(server.url);

    expect(await redis.pipeline([["SET", "foo", "bar"], ["GET", "foo"], ["PING"]])).toEqual([
      "OK",
      "bar",
      "PONG",
    ]);

    await redis.close();
  } finally {
    server.stop();
  }
});

test("await using closes the connection", async () => {
  const server = startFakeRedis(defaultHandler);

  try {
    let leaked: ReturnType<typeof createRedis> | undefined;

    {
      await using redis = createRedis(server.url);

      await redis.send("PING");
      leaked = redis;
    }

    expect(await leaked.isConnected()).toBe(false);
  } finally {
    server.stop();
  }
});
