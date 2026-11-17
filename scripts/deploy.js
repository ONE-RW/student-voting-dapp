const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.waitForDeployment();
  const address = await voting.getAddress();
  const artifact = await hre.artifacts.readArtifact("Voting");
  const outPath = path.join(__dirname, "..", "frontend", "Voting.json");
  fs.writeFileSync(outPath, JSON.stringify({ address, abi: artifact.abi }, null, 2));
  console.log(`Voting deployed to ${address}`);
  console.log(`Frontend deployment config written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
