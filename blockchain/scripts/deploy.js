const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

// Default Hardhat test mnemonic. Override with MNEMONIC in blockchain/.env so the
// backend's derived actors match the accounts that get roles/gas on the network.
const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

// Actor roster must mirror backend/server.js ACTOR_DEFS.
const ACTOR_ROLES = [
  { index: 1, role: 1, label: 'Manufacturer A' },
  { index: 2, role: 1, label: 'Manufacturer B' },
  { index: 3, role: 2, label: 'Distributor' },
  { index: 4, role: 3, label: 'Retailer' },
  { index: 5, role: 4, label: 'Customer' },
  { index: 6, role: 6, label: 'Carrier' }
];

function deriveActor(mnemonic, index) {
  return hre.ethers.HDNodeWallet.fromPhrase(mnemonic, '', `m/44'/60'/0'/0/${index}`);
}

async function main() {
  const network = hre.network.name;
  const mnemonic = process.env.MNEMONIC || DEFAULT_MNEMONIC;

  const SupplyChain = await hre.ethers.getContractFactory('SupplyChain');
  const supplyChain = await SupplyChain.deploy();
  await supplyChain.waitForDeployment();
  const address = await supplyChain.getAddress();
  console.log(`SupplyChain deployed to ${address} on ${network}`);

  const root = path.join(__dirname, '..', '..');

  fs.writeFileSync(
    path.join(root, 'blockchain', 'deployment.json'),
    JSON.stringify({ address, network, deployedAt: new Date().toISOString() }, null, 2)
  );

  const artifact = require('../artifacts/contracts/SupplyChain.sol/SupplyChain.sol/SupplyChain.json');
  fs.writeFileSync(
    path.join(root, 'frontend', 'src', 'contract.js'),
    `export const CONTRACT_ADDRESS = '${address}'\n` +
      'export const CONTRACT_ABI = ' + JSON.stringify(artifact.abi, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(root, 'backend', 'contractAbi.js'),
    'module.exports = ' + JSON.stringify(artifact.abi, null, 2) + ';\n'
  );

  const rpcUrl =
    network === 'sepolia'
      ? process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
      : 'http://127.0.0.1:8545';
  const envPath = path.join(root, 'backend', '.env');
  fs.writeFileSync(
    envPath,
    `PORT=5000\nRPC_URL=${rpcUrl}\nCONTRACT_ADDRESS=${address}\nMNEMONIC=${mnemonic}\n`
  );

  // Assign on-chain roles so the deployed backend does not need to send
  // transactions on cold start. Idempotent: skips roles already set.
  const [deployer] = await hre.ethers.getSigners();
  const admin = deriveActor(mnemonic, 0);
  if (admin.address.toLowerCase() !== deployer.address.toLowerCase()) {
    console.warn(
      `\nWARNING: deployer ${deployer.address} is not actor 0 (${admin.address}) of the mnemonic.` +
        `\nThe "Admin" actor in the app will not be able to assign roles.\n`
    );
  }

  for (const { index, role, label } of ACTOR_ROLES) {
    const actor = deriveActor(mnemonic, index);
    const current = Number(await supplyChain.roles(actor.address));
    if (current === role) {
      console.log(`Role already set for ${label} (${actor.address})`);
      continue;
    }
    const tx = await supplyChain.assignRole(actor.address, role);
    await tx.wait();
    console.log(`Assigned role ${role} to ${label} (${actor.address})`);
  }

  console.log('\nWrote frontend/src/contract.js, backend/contractAbi.js and backend/.env');
  console.log('next: fund the actor wallets (node blockchain/scripts/fund.js --network sepolia)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
