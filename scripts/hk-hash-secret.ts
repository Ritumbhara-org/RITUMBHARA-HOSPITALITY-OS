// Usage: npx tsx scripts/hk-hash-secret.ts '<admin password>'
// Prints the value for HK_ADMIN_PASSWORD_HASH.
import { hashSecret } from "../lib/hk/secret"

const secret = process.argv[2]
if (!secret || secret.length < 10) {
  console.error("Pass a password of at least 10 characters.")
  process.exit(1)
}
console.log(hashSecret(secret))
