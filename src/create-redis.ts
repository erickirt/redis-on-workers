import { Redis } from "./lib/redis";
import type { CreateRedisOptions } from "./type";

export function createRedis(options: CreateRedisOptions | string) {
  return new Redis(typeof options === "string" ? { url: options } : options);
}
