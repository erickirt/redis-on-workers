import type { Command, CreateRedisOptions, RedisConnectConfig, RedisResponse } from "../type";
import { Connection } from "./connection";
import { encodeCommand } from "./utils/encode-command";
import { stringifyResult } from "./utils/stringify-result";

const connectionClosedError = new Error("Redis connection closed");

function parseConnectConfig(options: CreateRedisOptions): RedisConnectConfig {
  if ("url" in options) {
    const { hostname, port, username, password, pathname, protocol } = new URL(options.url);

    return {
      hostname,
      port: Number(port) || 6379,
      username: username || undefined,
      password: password || undefined,
      database: pathname.slice(1) || undefined,
      tls: options.tls ?? protocol === "rediss:",
    };
  }

  const { hostname, username, port, password, database, tls } = options;

  return { hostname, username, port: Number(port) || 6379, password, database, tls };
}

function initCommands(config: RedisConnectConfig) {
  const commands: Command[] = [];

  if (config.password) {
    commands.push(
      config.username ? ["AUTH", config.username, config.password] : ["AUTH", config.password],
    );
  }

  if (config.database) {
    commands.push(["SELECT", config.database]);
  }

  return commands;
}

export class Redis {
  readonly config: RedisConnectConfig;

  private connection?: Promise<Connection>;
  private pending: PromiseWithResolvers<RedisResponse>[] = [];
  private writeChain = Promise.resolve();

  constructor(readonly options: CreateRedisOptions) {
    this.config = parseConnectConfig(options);
  }

  async send(...command: Command) {
    return stringifyResult(await this.sendRaw(...command));
  }

  async sendRaw(...command: Command) {
    const [reply] = await this.dispatch([command]);

    return reply ?? null;
  }

  async sendOnce(...command: Command) {
    try {
      return await this.send(...command);
    } finally {
      await this.close();
    }
  }

  async sendOnceRaw(...command: Command) {
    try {
      return await this.sendRaw(...command);
    } finally {
      await this.close();
    }
  }

  async pipeline(commands: Command[]) {
    return (await this.pipelineRaw(commands)).map(stringifyResult);
  }

  pipelineRaw(commands: Command[]) {
    return this.dispatch(commands);
  }

  async isConnected() {
    if (!this.connection) return false;

    try {
      return Boolean(await this.connection);
    } catch {
      return false;
    }
  }

  async close(reason?: Error) {
    const pending = this.pending;
    const connection = this.connection ? await this.connection.catch(() => undefined) : undefined;
    const error = reason ?? (pending.length > 0 ? connectionClosedError : undefined);

    this.connection = undefined;
    this.pending = [];
    this.writeChain = Promise.resolve();

    if (error) {
      for (const reply of pending) {
        reply.reject(error);
      }
    }

    await connection?.close(error);
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }

  private async dispatch(commands: Command[]) {
    this.connection ??= this.open().catch((error) => {
      this.connection = undefined;
      throw error;
    });

    const connection = await this.connection;

    try {
      return await this.write(connection, commands);
    } catch (error) {
      await this.close(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async open() {
    const connection = await Connection.open(this.config, this.options);

    void this.pump(connection);

    const init = initCommands(this.config);

    if (init.length > 0) await this.write(connection, init);

    return connection;
  }

  private async pump(connection: Connection) {
    const active = this.connection;

    try {
      for await (const reply of connection.replies) {
        this.options.logger?.("Received reply", String(reply));

        const pending = this.pending.shift();

        if (reply instanceof Error) {
          pending?.reject(reply);
        } else {
          pending?.resolve(reply);
        }
      }
    } catch (error) {
      if (this.connection === active) {
        await this.close(error instanceof Error ? error : new Error(String(error)));
      }

      return;
    }

    if (this.connection === active) await this.close();
  }

  private async write(connection: Connection, commands: Command[]) {
    const replies = commands.map(() => Promise.withResolvers<RedisResponse>());

    this.pending.push(...replies);

    const chunks = commands.flatMap((command) =>
      encodeCommand(command.map((arg) => (arg instanceof Uint8Array ? arg : String(arg)))),
    );

    await this.enqueueWrite(() => connection.write(chunks));

    return Promise.all(replies.map((reply) => reply.promise));
  }

  private enqueueWrite(operation: () => Promise<void>) {
    const next = this.writeChain.then(operation);

    this.writeChain = next.catch(() => {});

    return next;
  }
}
