const encoder = new TextEncoder();
const crlf = encoder.encode("\r\n");

export function encodeCommand(args: Array<string | Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [encoder.encode(`*${args.length}\r\n`)];

  for (const arg of args) {
    const bytes = typeof arg === "string" ? encoder.encode(arg) : arg;

    parts.push(encoder.encode(`$${bytes.length}\r\n`), bytes, crlf);
  }

  let length = 0;

  for (const part of parts) {
    length += part.length;
  }

  const payload = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    payload.set(part, offset);
    offset += part.length;
  }

  return payload;
}
