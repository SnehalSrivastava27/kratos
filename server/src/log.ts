// One JSON object per line on stdout (info/warn) or stderr (error).
type Fields = Record<string, unknown>;
const line = (level: string, msg: string, f?: Fields) => JSON.stringify({ ts: new Date().toISOString(), level, msg, ...f });

export const log = {
  info: (msg: string, f?: Fields) => console.log(line("info", msg, f)),
  warn: (msg: string, f?: Fields) => console.log(line("warn", msg, f)),
  error: (msg: string, e?: unknown, f?: Fields) =>
    console.error(line("error", msg, { ...f, error: e instanceof Error ? e.message : e === undefined ? undefined : String(e), stack: e instanceof Error ? e.stack : undefined })),
};
