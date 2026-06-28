import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// One-off: reset the emailpass password for the existing admin user so Dan
// has a known credential. The user row + emailpass identity already exist
// (seeded 2026-05-29) but the original password is unknown.
// Run: NEW_ADMIN_PASS='...' npx medusa exec ./src/scripts/reset-admin-pass.ts
export default async function resetAdminPass({ container }: ExecArgs) {
  const authService = container.resolve(Modules.AUTH)
  const email = "admin@theproductlab.in"
  const password = process.env.NEW_ADMIN_PASS || "TplAdmin#Temp2026"

  const result = await authService.updateProvider("emailpass", {
    entity_id: email,
    password,
  })

  console.log("RESET_RESULT:", JSON.stringify(result))
}
