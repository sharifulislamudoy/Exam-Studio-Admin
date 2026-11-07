import { existsSync, readFileSync, writeFileSync } from "node:fs";
const template = new URL("./.env.example", import.meta.url);
const output = new URL("./.env.local", import.meta.url);
if (existsSync(output))
  console.log(".env.local already exists; kept unchanged.");
else {
  const text = readFileSync(template, "utf8");
  writeFileSync(output, text, { mode: 0o600 });
  console.log(
    "Created .env.local. Set your own connection/settings before running.",
  );
}
