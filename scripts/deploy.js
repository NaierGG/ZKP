const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Semaphore contract addresses by network
// https://docs.semaphore.pse.dev/deployed-contracts
const SEMAPHORE_ADDRESSES = {
  sepolia: "0x3889927F0B5Eb1a02C6E2C20b39a1Bd4EAd76131", // update if needed
  localhost: "", // deploy locally via semaphore hardhat package
};

async function main() {
  const network = hre.network.name;
  console.log(`\n🚀 Deploying AnonSocial to ${network}...`);

  const semaphoreAddress = SEMAPHORE_ADDRESSES[network];
  if (!semaphoreAddress) {
    throw new Error(`No Semaphore address configured for network: ${network}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`📝 Deployer: ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ETH`);

  // Deploy AnonSocial
  const AnonSocial = await hre.ethers.getContractFactory("AnonSocial");
  const anonSocial = await AnonSocial.deploy(semaphoreAddress);
  await anonSocial.waitForDeployment();

  const address = await anonSocial.getAddress();
  console.log(`✅ AnonSocial deployed at: ${address}`);

  // Retrieve ABI from compiled artifacts
  const artifact = await hre.artifacts.readArtifact("AnonSocial");

  // Write address + ABI to frontend
  const output = {
    address,
    abi: artifact.abi,
    network,
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(
    __dirname,
    "../frontend/src/contracts/AnonSocial.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`📄 ABI + address written to ${outputPath}`);

  // Verify on Etherscan (optional)
  if (network !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("\n⏳ Waiting 5 blocks for Etherscan indexing...");
    await anonSocial.deploymentTransaction()?.wait(5);

    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [semaphoreAddress],
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (e) {
      console.warn("⚠️  Etherscan verification failed:", e.message);
    }
  }

  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log(`  1. Copy ${address} to frontend/.env as VITE_CONTRACT_ADDRESS`);
  console.log("  2. Run: cd frontend && npm run dev");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
