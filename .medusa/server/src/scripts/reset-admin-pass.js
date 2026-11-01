"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = resetAdminPass;
const utils_1 = require("@medusajs/framework/utils");
// One-off: reset the emailpass password for the existing admin user so Dan
// has a known credential. The user row + emailpass identity already exist
// (seeded 2026-05-29) but the original password is unknown.
// Run: NEW_ADMIN_PASS='...' npx medusa exec ./src/scripts/reset-admin-pass.ts
async function resetAdminPass({ container }) {
    const authService = container.resolve(utils_1.Modules.AUTH);
    const email = "admin@theproductlab.in";
    const password = process.env.NEW_ADMIN_PASS || "TplAdmin#Temp2026";
    const result = await authService.updateProvider("emailpass", {
        entity_id: email,
        password,
    });
    console.log("RESET_RESULT:", JSON.stringify(result));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzZXQtYWRtaW4tcGFzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9zY3JpcHRzL3Jlc2V0LWFkbWluLXBhc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFPQSxpQ0FXQztBQWpCRCxxREFBbUQ7QUFFbkQsMkVBQTJFO0FBQzNFLDBFQUEwRTtBQUMxRSw0REFBNEQ7QUFDNUQsOEVBQThFO0FBQy9ELEtBQUssVUFBVSxjQUFjLENBQUMsRUFBRSxTQUFTLEVBQVk7SUFDbEUsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxlQUFPLENBQUMsSUFBSSxDQUFDLENBQUE7SUFDbkQsTUFBTSxLQUFLLEdBQUcsd0JBQXdCLENBQUE7SUFDdEMsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksbUJBQW1CLENBQUE7SUFFbEUsTUFBTSxNQUFNLEdBQUcsTUFBTSxXQUFXLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRTtRQUMzRCxTQUFTLEVBQUUsS0FBSztRQUNoQixRQUFRO0tBQ1QsQ0FBQyxDQUFBO0lBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBO0FBQ3RELENBQUMifQ==