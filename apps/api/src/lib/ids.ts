import { randomUUID, randomBytes } from "node:crypto";
export const uuid = () => randomUUID();
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const seed = () => randomBytes(16).toString("hex");
