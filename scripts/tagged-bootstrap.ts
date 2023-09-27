import { bucketTags } from "@config/taggingConfig";
import { execSync } from "child_process";

// Create an array of tags to pass to the CDK bootstrap command
// These tags will be applied to the bootstrap bucket
const tags: string[] = [];
Object.entries(bucketTags.cdkBootstrap).forEach(([key, value]) => {
  tags.push(`--tags ${key}=${value}`);
});

// Check if npx is installed
function npxInstalled() {
  try {
    execSync("npx --version");
    return true;
  } catch (error) {
    return false;
  }
}

const cliArguments = tags.join(" ");

if (tags.length > 0) {
  console.log("Bootstrapping with:", cliArguments);
}

// If npx is installed, use it to run the CDK command in the local node_modules folder
// Otherwise, assume the CDK is installed globally
if (!npxInstalled()) {
  execSync(`cdk bootstrap ${cliArguments}`, { stdio: "inherit" });
} else {
  execSync(`npx cdk bootstrap ${cliArguments}`, { stdio: "inherit" });
}
