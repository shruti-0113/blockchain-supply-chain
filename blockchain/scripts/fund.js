const hre = require('hardhat');

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';
const FUND_INDICES = [1, 2, 3, 4, 5, 6];

// Sends a little ETH from the deployer (actor 0) to each other actor so they can
// pay gas for ship/receive/transfer/scan transactions on a live network.
async function main() {
  const mnemonic = process.env.MNEMONIC || DEFAULT_MNEMONIC;
  const amount = process.env.FUND_ETH || '0.03';

  const [deployer] = await hre.ethers.getSigners();
  const deployerBalance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Funding from ${deployer.address} (${hre.ethers.formatEther(deployerBalance)} ETH)`);

  for (const index of FUND_INDICES) {
    const actor = hre.ethers.HDNodeWallet.fromPhrase(mnemonic, '', `m/44'/60'/0'/0/${index}`);
    const balance = await hre.ethers.provider.getBalance(actor.address);
    if (balance >= hre.ethers.parseEther(amount)) {
      console.log(`#${index} ${actor.address} already funded (${hre.ethers.formatEther(balance)} ETH)`);
      continue;
    }
    const tx = await deployer.sendTransaction({ to: actor.address, value: hre.ethers.parseEther(amount) });
    await tx.wait();
    console.log(`Funded #${index} ${actor.address} with ${amount} ETH`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
