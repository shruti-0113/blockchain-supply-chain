const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const SupplyChain = await hre.ethers.getContractFactory('SupplyChain');
  const supplyChain = await SupplyChain.deploy();
  await supplyChain.waitForDeployment();
  const address = await supplyChain.getAddress();
  console.log('SupplyChain deployed to:', address);

  const root = path.join(__dirname, '..', '..');

  // 1. Save deployment info
  fs.writeFileSync(
    path.join(root, 'blockchain', 'deployment.json'),
    JSON.stringify({ address, network: 'localhost', deployedAt: new Date().toISOString() }, null, 2)
  );

  // 2. Write frontend contract module (address + ABI)
  const artifact = require('../artifacts/contracts/SupplyChain.sol/SupplyChain.sol/SupplyChain.json');
  fs.writeFileSync(
    path.join(root, 'frontend', 'src', 'contract.js'),
    `export const CONTRACT_ADDRESS = '${address}'\n` +
      'export const CONTRACT_ABI = ' + JSON.stringify(artifact.abi, null, 2) + '\n'
  );

  // 3. Write backend ABI (from artifact)
  fs.writeFileSync(
    path.join(root, 'backend', 'contractAbi.js'),
    'module.exports = ' + JSON.stringify(artifact.abi, null, 2) + ';\n'
  );

  // 4. Update backend .env CONTRACT_ADDRESS line
  const envPath = path.join(root, 'backend', '.env');
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  env = env.replace(/CONTRACT_ADDRESS=.*/g, '').replace(/\n{2,}/g, '\n').trim();
  env = `PORT=5000\nRPC_URL=http://127.0.0.1:8545\nCONTRACT_ADDRESS=${address}\nPRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80\n`;
  fs.writeFileSync(envPath, env);

  console.log('Synced address to frontend, backend ABI and backend .env');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
