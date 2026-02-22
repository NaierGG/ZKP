const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Semaphore contract addresses by network
// https://docs.semaphore.pse.dev/deployed-contracts
const SEMAPHORE_ADDRESSES = {
  sepolia: "0x3889927F0B5Eb1a02C6E2C20b39a1Bd4EAd76131",
  localhost: "", // deploy locally via semaphore hardhat package
};

async function main() {
  const network = hre.network.name;
  console.log(`\nDeploying AnonSocial to ${network}...`);

  const semaphoreAddress = SEMAPHORE_ADDRESSES[network];
  if (!semaphoreAddress) {
    throw new Error(`No Semaphore address configured for network: ${network}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);

  const AnonSocial = await hre.ethers.getContractFactory("AnonSocial");
  const anonSocial = await AnonSocial.deploy(semaphoreAddress);
  await anonSocial.waitForDeployment();

  const address = await anonSocial.getAddress();
  console.log(`AnonSocial deployed at: ${address}`);

  const artifact = await hre.artifacts.readArtifact("AnonSocial");

  const output = {
    address,
    abi: artifact.abi,
    network,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "../frontend/src/contracts/AnonSocial.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`ABI + address written to ${outputPath}`);

  // Keep frontend env in sync for runtime configuration.
  const frontendEnvPath = path.join(__dirname, "../frontend/.env");
  const key = "VITE_CONTRACT_ADDRESS";
  let envContent = "";

  if (fs.existsSync(frontendEnvPath)) {
    envContent = fs.readFileSync(frontendEnvPath, "utf8");
  }

  if (new RegExp(`^${key}=`, "m").test(envContent)) {
    envContent = envContent.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${address}`);
  } else {
    if (envContent.length > 0 && !envContent.endsWith("\n")) {
      envContent += "\n";
    }
    envContent += `${key}=${address}\n`;
  }

  fs.writeFileSync(frontendEnvPath, envContent, "utf8");
  console.log(`Updated ${frontendEnvPath} (${key})`);

  if (network !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("\nWaiting 5 blocks for Etherscan indexing...");
    await anonSocial.deploymentTransaction()?.wait(5);

    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [semaphoreAddress],
      });
      console.log("Contract verified on Etherscan");
    } catch (e) {
      console.warn("Etherscan verification failed:", e.message);
    }
  }

  console.log("\nDeployment complete.\n");
  console.log("Next steps:");
  console.log("  1. Run: cd frontend && npm run dev");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
