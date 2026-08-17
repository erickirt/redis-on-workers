import { expect, test } from "bun:test";
import { encodeCommand } from "~/lib/utils/encode-command";

test("encode-command", () => {
  const encoded = encodeCommand(["SET", "key", "value"]);

  expect(encoded).toBeInstanceOf(Uint8Array);
  expect(new TextDecoder().decode(encoded)).toBe("*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n");
});

test("encode-command with binary argument", () => {
  const payload = new Uint8Array([0, 1, 2]);
  const encoded = encodeCommand(["SET", "key", payload]);

  expect(new TextDecoder().decode(encoded.subarray(0, 22))).toBe(
    "*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n",
  );
  expect(encoded.subarray(22)).toEqual(new Uint8Array([36, 51, 13, 10, 0, 1, 2, 13, 10]));
});
