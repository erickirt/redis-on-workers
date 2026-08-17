import type { RedisResponse } from "../type";

const decoder = new TextDecoder();

export interface RespReader {
  read(): Promise<{ value?: Uint8Array; done: boolean }>;
}

interface Parsed {
  value: RedisResponse;
  offset: number;
}

// ponytail: partial values re-parse from their start on every new chunk; fine for
// typical reply sizes, switch to a resumable state machine if profiles say otherwise
export async function* decodeResp(reader: RespReader): AsyncGenerator<RedisResponse, void> {
  let buffer: Uint8Array = new Uint8Array(0);
  let offset = 0;

  while (true) {
    const parsed = parseValue(buffer, offset);

    if (parsed) {
      offset = parsed.offset;
      yield parsed.value;
      continue;
    }

    const { value, done } = await reader.read();

    if (done) return;

    buffer = append(buffer.subarray(offset), value);
    offset = 0;
  }
}

function append(buffer: Uint8Array, chunk?: Uint8Array) {
  if (!chunk) return buffer;

  if (buffer.length === 0) return chunk;

  const merged = new Uint8Array(buffer.length + chunk.length);

  merged.set(buffer);
  merged.set(chunk, buffer.length);

  return merged;
}

function parseValue(buffer: Uint8Array, offset: number): Parsed | undefined {
  const type = buffer[offset];

  if (type === undefined) return;

  switch (type) {
    case 43: // +
      return parseSimpleString(buffer, offset + 1);
    case 45: // -
      return parseError(buffer, offset + 1);
    case 58: // :
      return parseInteger(buffer, offset + 1);
    case 36: // $
      return parseBulkString(buffer, offset + 1);
    case 42: // *
      return parseArray(buffer, offset + 1);
    default:
      throw new Error(
        `Protocol error, got ${JSON.stringify(String.fromCharCode(type))} as reply type byte at offset ${offset}`,
      );
  }
}

function findLineEnd(buffer: Uint8Array, offset: number) {
  for (let index = offset; index + 1 < buffer.length; index++) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) return index;
  }
}

function parseSimpleString(buffer: Uint8Array, offset: number): Parsed | undefined {
  const end = findLineEnd(buffer, offset);

  if (end === undefined) return;

  return { value: buffer.slice(offset, end), offset: end + 2 };
}

function parseError(buffer: Uint8Array, offset: number): Parsed | undefined {
  const end = findLineEnd(buffer, offset);

  if (end === undefined) return;

  return {
    value: new Error(decoder.decode(buffer.subarray(offset, end)) || "Unknown error"),
    offset: end + 2,
  };
}

function parseInteger(buffer: Uint8Array, offset: number): Parsed | undefined {
  const end = findLineEnd(buffer, offset);

  if (end === undefined) return;

  return { value: Number(decoder.decode(buffer.subarray(offset, end))), offset: end + 2 };
}

function parseLength(buffer: Uint8Array, offset: number) {
  const end = findLineEnd(buffer, offset);

  if (end === undefined) return;

  return { length: Number(decoder.decode(buffer.subarray(offset, end))), offset: end + 2 };
}

function parseBulkString(buffer: Uint8Array, offset: number): Parsed | undefined {
  const header = parseLength(buffer, offset);

  if (header === undefined) return;

  if (header.length < 0) return { value: null, offset: header.offset };

  const end = header.offset + header.length;

  if (end + 2 > buffer.length) return;

  return { value: buffer.slice(header.offset, end), offset: end + 2 };
}

function parseArray(buffer: Uint8Array, offset: number): Parsed | undefined {
  const header = parseLength(buffer, offset);

  if (header === undefined) return;

  if (header.length < 0) return { value: null, offset: header.offset };

  const values: RedisResponse[] = [];
  let cursor = header.offset;

  for (let index = 0; index < header.length; index++) {
    const element = parseValue(buffer, cursor);

    if (element === undefined) return;

    values.push(element.value);
    cursor = element.offset;
  }

  return { value: values, offset: cursor };
}
