import { expect, test } from "bun:test";
import { decodeResp } from "~/lib/resp";
import type { RedisResponse } from "~/type";

const encoder = new TextEncoder();

async function decodeChunks(...chunks: string[]) {
  const queue = chunks.map((chunk) => encoder.encode(chunk));

  const reader = {
    read: async () => (queue.length > 0 ? { value: queue.shift(), done: false } : { done: true }),
  };

  const values: RedisResponse[] = [];

  for await (const value of decodeResp(reader)) {
    values.push(value);
  }

  return values;
}

test("simple string", async () => {
  expect(await decodeChunks("+OK\r\n")).toEqual([encoder.encode("OK")]);
});

test("error reply", async () => {
  const [reply] = await decodeChunks("-ERR something went wrong\r\n");

  expect(reply).toBeInstanceOf(Error);
  expect(reply instanceof Error && reply.message).toBe("ERR something went wrong");
});

test("integer", async () => {
  expect(await decodeChunks(":42\r\n")).toEqual([42]);
});

test("negative integer", async () => {
  expect(await decodeChunks(":-123\r\n")).toEqual([-123]);
});

test("bulk string", async () => {
  expect(await decodeChunks("$5\r\nhello\r\n")).toEqual([encoder.encode("hello")]);
});

test("empty bulk string", async () => {
  expect(await decodeChunks("$0\r\n\r\n")).toEqual([encoder.encode("")]);
});

test("null bulk string", async () => {
  expect(await decodeChunks("$-1\r\n")).toEqual([null]);
});

test("array", async () => {
  expect(await decodeChunks("*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n")).toEqual([
    [encoder.encode("foo"), encoder.encode("bar")],
  ]);
});

test("empty array", async () => {
  expect(await decodeChunks("*0\r\n")).toEqual([[]]);
});

test("null array", async () => {
  expect(await decodeChunks("*-1\r\n")).toEqual([null]);
});

test("nested array", async () => {
  expect(await decodeChunks("*2\r\n*2\r\n:1\r\n:2\r\n*2\r\n:3\r\n:4\r\n")).toEqual([
    [
      [1, 2],
      [3, 4],
    ],
  ]);
});

test("mixed array", async () => {
  expect(await decodeChunks("*4\r\n+OK\r\n:42\r\n$5\r\nhello\r\n$-1\r\n")).toEqual([
    [encoder.encode("OK"), 42, encoder.encode("hello"), null],
  ]);
});

test("multiple replies in one chunk", async () => {
  expect(await decodeChunks("+OK\r\n:1\r\n+PONG\r\n")).toEqual([
    encoder.encode("OK"),
    1,
    encoder.encode("PONG"),
  ]);
});

test("reply split across chunks", async () => {
  expect(await decodeChunks("+OK\r\n*2\r\n$3\r\n", "foo\r\n$3\r\nbar\r\n")).toEqual([
    encoder.encode("OK"),
    [encoder.encode("foo"), encoder.encode("bar")],
  ]);
});

test("byte-by-byte chunks", async () => {
  const payload = "*2\r\n$3\r\nfoo\r\n:42\r\n";

  expect(await decodeChunks(...payload.split(""))).toEqual([[encoder.encode("foo"), 42]]);
});

test("large bulk string across chunks", async () => {
  const largeString = "x".repeat(100 * 1024);

  const values = await decodeChunks(
    `$${largeString.length}\r\n${largeString.slice(0, 50000)}`,
    `${largeString.slice(50000)}\r\n`,
  );

  expect(values).toEqual([encoder.encode(largeString)]);
});

test("incomplete trailing data yields nothing", async () => {
  expect(await decodeChunks("+OK\r\n$5\r\nhel")).toEqual([encoder.encode("OK")]);
});

test("invalid type byte throws", async () => {
  expect(decodeChunks("!bad\r\n")).rejects.toThrow("Protocol error");
});
