// Set up Azurite blob service with HTTPS on port 443.
// The action hardcodes https://<account>.blob.core.windows.net URLs, so we:
//   1. Generate a self-signed cert for the hostname
//   2. Map the hostname to 127.0.0.1 via /etc/hosts
//   3. Start Azurite on port 443 with HTTPS
//   4. Wait for readiness
//
// Required env: AZURITE_ACCOUNT

const { execSync, spawn } = require("child_process");
const https = require("https");

const account = process.env.AZURITE_ACCOUNT;
if (!account) {
  console.error("AZURITE_ACCOUNT must be set");
  process.exit(1);
}

const hostname = account + ".blob.core.windows.net";

// Generate self-signed cert
execSync(
  `openssl req -x509 -nodes -days 30 -newkey rsa:2048 ` +
    `-keyout /tmp/azurite-key.pem -out /tmp/azurite-cert.pem ` +
    `-subj "/CN=${hostname}"`,
  { stdio: "inherit" }
);

// Route the hostname to localhost
execSync(`echo "127.0.0.1 ${hostname}" | sudo tee -a /etc/hosts`, {
  stdio: "inherit",
});

// Start Azurite blob service on port 443 with HTTPS
const azurite = spawn(
  "sudo",
  [
    "env",
    `PATH=${process.env.PATH}`,
    "npx",
    "azurite-blob",
    "--blobHost",
    "0.0.0.0",
    "--blobPort",
    "443",
    "--cert",
    "/tmp/azurite-cert.pem",
    "--key",
    "/tmp/azurite-key.pem",
    "--loose",
    "--silent",
  ],
  { stdio: "inherit", detached: true }
);
azurite.unref();

// Wait for Azurite to be ready
async function waitForReady() {
  for (let i = 1; i <= 10; i++) {
    const ok = await new Promise((resolve) => {
      const req = https.get(
        `https://${hostname}/`,
        { rejectUnauthorized: false },
        (res) => {
          res.resume();
          resolve(true);
        }
      );
      req.on("error", () => resolve(false));
    });
    if (ok) {
      console.log("Azurite is ready");
      return;
    }
    console.log(`Waiting for Azurite... (${i})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error("Azurite failed to start");
  process.exit(1);
}

waitForReady();
