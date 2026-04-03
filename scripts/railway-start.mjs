import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: process.env,
    });

    let stderr = "";

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

async function main() {
  const migrate = await run("npx", ["prisma", "migrate", "deploy"]);

  if (migrate.code !== 0) {
    const canFallback = /P3005/.test(migrate.stderr);

    if (!canFallback) {
      process.exit(migrate.code);
      return;
    }

    console.log("Detected Prisma P3005 (non-empty schema). Falling back to prisma db push...");
    const push = await run("npx", ["prisma", "db", "push"]);
    if (push.code !== 0) {
      process.exit(push.code);
      return;
    }
  }

  const app = await run("npm", ["run", "start"]);
  process.exit(app.code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
