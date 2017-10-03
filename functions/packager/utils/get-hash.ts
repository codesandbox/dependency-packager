const hash = require("string-hash");

export default function({ name, version }: { name: string; version: string }) {
  return String(hash(JSON.stringify(`${name}@${version}`)));
}
