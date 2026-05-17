// Run: node generate-hash.js yourpassword
// Then copy the output and set it as APP_PASSWORD_HASH in Render

const bcrypt = require('bcryptjs');
const password = process.argv[2];

if (!password) {
  console.error('Usage: node generate-hash.js <your-password>');
  process.exit(1);
}

bcrypt.hash(password, 12).then(hash => {
  console.log('\n✅ Your password hash:\n');
  console.log(hash);
  console.log('\n👉 Add this as APP_PASSWORD_HASH in your Render backend environment variables\n');
});
