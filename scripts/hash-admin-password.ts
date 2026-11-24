// Creates the values for the OS admin login. Run:  npm run auth:hash-password
// It asks for the password without echoing it (it is never passed on the command line, so it stays out of shell
// history), then prints:
//   ADMIN_PASSWORD_HASH  - scrypt hash to store as a server-side environment variable (not the password itself)
//   ADMIN_SESSION_SECRET - a fresh random signing secret (only needed the first time, or to sign everyone out)
// Nothing is written to disk or sent anywhere.

import { randomBytes } from "node:crypto"
import { hashPassword } from "../lib/auth/session"

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    process.stdout.write(prompt)
    if (!stdin.isTTY) {
      let data = ""
      stdin.setEncoding("utf8")
      stdin.on("data", (c) => { data += c })
      stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")))
      stdin.on("error", reject)
      return
    }
    let value = ""
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding("utf8")
    const onData = (ch: string) => {
      if (ch === "\u0003") { process.stdout.write("\n"); process.exit(130) }
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData)
        process.stdout.write("\n"); resolve(value); return
      }
      if (ch === "\u007f") { value = value.slice(0, -1); return }
      value += ch
    }
    stdin.on("data", onData)
  })
}

async function main() {
  const password = await readHidden("New admin password (min 12 characters): ")
  if (process.stdin.isTTY) {
    const again = await readHidden("Repeat password: ")
    if (again !== password) { console.error("Passwords do not match."); process.exit(1) }
  }
  const hash = await hashPassword(password)
  console.log("\nADMIN_PASSWORD_HASH=" + hash)
  console.log("ADMIN_SESSION_SECRET=" + randomBytes(48).toString("base64url"))
  console.log("\nStore these as server-side environment variables (never in Git, never NEXT_PUBLIC_).")
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
