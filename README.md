# ChainTrace — Blockchain Supply Chain & Product Passport

A full-stack blockchain supply chain tracking system with a tamper-evident audit
trail, product passports, cold-chain monitoring, authenticity checks, carbon
footprint accounting, reputation, and a lightweight AI risk predictor.

- **Smart contract:** Solidity + Hardhat (`blockchain/`)
- **Backend API:** Node.js + Express + ethers (`backend/`)
- **Frontend:** React + Vite + ethers (`frontend/`)
- **One-command dev runner:** `start.js` (boots node, deploys, starts backend & frontend)

## Features

| Area | Description |
| --- | --- |
| Product Passport | Full lifecycle of every product with a shareable QR code (`?pid=<id>`) |
| Ownership Transfers | Request → confirm/cancel handoffs between supply chain actors |
| Cold Chain | Temperature checkpoints with automatic out-of-range alerts |
| Authenticity | Scan tracking and counterfeit / suspicious-scan detection |
| Audit Trail | Hash-linked, immutable event log with `verifyChain` integrity check and a tamper simulation |
| Carbon Footprint | Per-leg emissions by transport mode, with offset estimates |
| AI Prediction | Rule-based delivery risk score with reasons and suggestions |
| Roles & Reputation | Role assignment (Manufacturer, Distributor, Retailer, Carrier, ...) with reliability scoring and disputes |

## Architecture

```
Frontend (React/Vite :3000)
        │  REST
        ▼
Backend (Express :5000)  ── ethers ──▶  Hardhat node (:8545)
        │                                     │
        └── reads/writes SupplyChain contract ◀┘
```

## Prerequisites

- Node.js 18+
- npm

## Quick Start

Install dependencies for all three packages:

```bash
npm install
npm --prefix blockchain install
npm --prefix backend install
npm --prefix frontend install
```

Run everything (blockchain node + deploy + backend + frontend) with one command:

```bash
npm run dev
```

Then open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Local chain RPC: http://127.0.0.1:8545

## Running Individual Services

```bash
npm run chain      # start the local Hardhat node
npm run deploy     # compile + deploy the contract to localhost
npm run backend    # start the Express API
npm run frontend   # start the Vite dev server
```

Compile and test the contract directly:

```bash
npm --prefix blockchain run compile
npm --prefix blockchain test
```

## Configuration

`start.js` deploys the contract and writes the deployed address into
`backend/.env`. The backend reads:

```
PORT=5000
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x...        # written on deploy
MNEMONIC=test test test ...   # optional; defaults to Hardhat test mnemonic
```

> The default mnemonic and private keys are Hardhat's **public test** values and
> are only meant for local development. `backend/.env` is git-ignored.

## API Overview (selected)

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend + contract status |
| GET | `/actors` | Dev actors, roles, reputation |
| GET/POST | `/items` | List / create products |
| POST | `/items/:id/state` | ship / receive / distribute / deliver |
| POST | `/items/:id/transfer/request\|confirm\|cancel` | Ownership transfers |
| POST | `/items/:id/temperature` | Add a temperature checkpoint |
| POST | `/items/:id/leg` | Add a transport leg (carbon) |
| POST | `/items/:id/scan` | Record a scan (authenticity) |
| GET | `/items/:id/passport` | Full aggregated product passport |
| GET | `/items/:id/verify` | Verify the audit chain integrity |
| POST | `/items/:id/tamper\|untamper` | Simulate/undo tampering (demo) |
| GET | `/items/:id/prediction` | AI delivery risk score |
| GET | `/carbon`, `/authenticity`, `/predictions`, `/reputation`, `/overview` | Aggregated analytics |

## Project Structure

```
blockchain-supply-chain/
├── blockchain/            # Hardhat project
│   ├── contracts/         # SupplyChain.sol
│   └── scripts/deploy.js
├── backend/               # Express API (server.js, contractAbi.js)
├── frontend/              # React + Vite app
│   └── src/components/    # Dashboard, Products, Passport, Temperature, ...
├── start.js               # one-command dev orchestrator
└── package.json
```

## Deploying to Vercel (Sepolia)

A local Hardhat node can't run on Vercel, so the deployed app uses the **Sepolia
testnet**. This project deploys as **two Vercel projects** (both auto-detected):

- `backend/` → Express API (Vercel Function)
- `frontend/` → Vite site, pointed at the backend URL via `VITE_API_URL`

### 1. Create a funded Sepolia account

1. Copy `blockchain/.env.example` to `blockchain/.env` and set a `MNEMONIC`
   (any 12-word phrase) and `DEPLOYER_PRIVATE_KEY` = private key of **index 0**.
2. Get the deployer address and top it up with Sepolia ETH from a faucet
   (e.g. https://sepolia-faucet.pk910.de).
3. Set `SEPOLIA_RPC_URL` (defaults to a public RPC; an Alchemy/Infura key is
   more reliable).

### 2. Deploy the contract and fund the actors

```bash
npm --prefix blockchain run deploy:sepolia   # deploys + assigns actor roles
npm --prefix blockchain run fund:sepolia     # sends gas ETH to actors 1..6
```

The deploy prints the contract address and updates `backend/.env` and
`frontend/src/contract.js`.

### 3. Deploy the backend

```bash
cd backend
vercel
vercel env add RPC_URL            # your Sepolia RPC
vercel env add CONTRACT_ADDRESS   # from step 2
vercel env add MNEMONIC           # same mnemonic as above
vercel --prod
```

### 4. Deploy the frontend

```bash
cd frontend
vercel
vercel env add VITE_API_URL       # https://<your-backend>.vercel.app
vercel --prod
```

Open the frontend URL — it now reads and writes to the Sepolia contract.

## License

MIT
