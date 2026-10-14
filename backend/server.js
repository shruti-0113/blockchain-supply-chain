const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const contractAbi = require('./contractAbi');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const MNEMONIC =
  process.env.MNEMONIC || 'test test test test test test test test test test test junk';

const provider = new ethers.JsonRpcProvider(RPC_URL);

// ---------------------------------------------------------------------------
// Enums (must mirror the Solidity contract)
// ---------------------------------------------------------------------------
const STATE_NAMES = ['Manufactured', 'Shipped', 'Received', 'Distributed', 'Delivered'];
const ROLE = { None: 0, Manufacturer: 1, Distributor: 2, Retailer: 3, Customer: 4, Admin: 5, Carrier: 6 };
const ROLE_NAMES = ['None', 'Manufacturer', 'Distributor', 'Retailer', 'Customer', 'Admin', 'Carrier'];
const EVENT_NAMES = [
  'Created', 'Shipped', 'Received', 'Distributed', 'Delivered',
  'Temperature', 'TransferRequested', 'TransferConfirmed', 'Scan', 'Leg', 'Note'
];
const EVENT = EVENT_NAMES.reduce((acc, n, i) => ((acc[n] = i), acc), {});

// Deterministic Hardhat dev actors, derived from the default test mnemonic.
const ACTOR_DEFS = [
  { label: 'Admin', role: ROLE.Admin, i: 0 },
  { label: 'Manufacturer A', role: ROLE.Manufacturer, i: 1 },
  { label: 'Manufacturer B', role: ROLE.Manufacturer, i: 2 },
  { label: 'Distributor', role: ROLE.Distributor, i: 3 },
  { label: 'Retailer', role: ROLE.Retailer, i: 4 },
  { label: 'Customer', role: ROLE.Customer, i: 5 },
  { label: 'Carrier', role: ROLE.Carrier, i: 6 }
];

const ACTORS = ACTOR_DEFS.map((def) => {
  const node = ethers.HDNodeWallet.fromPhrase(MNEMONIC, '', `m/44'/60'/0'/0/${def.i}`);
  return {
    index: def.i,
    label: def.label,
    role: def.role,
    roleName: ROLE_NAMES[def.role],
    privateKey: node.privateKey,
    address: node.address,
    connect: () => new ethers.Wallet(node.privateKey, provider)
  };
});

function actorByIndex(i) {
  const idx = Number(i);
  const a = ACTORS.find((x) => x.index === idx);
  if (!a) throw new Error('Unknown actor index ' + i);
  return a;
}

function contractFor(actorIndex) {
  const signer = actorByIndex(actorIndex).connect();
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, signer);
}

function readContract() {
  return new ethers.Contract(CONTRACT_ADDRESS, contractAbi, provider);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
const toScaled = (v) => Math.round(Number(v) * 100);

function serializeItem(raw) {
  const tempMin = Number(raw[10]);
  const tempMax = Number(raw[11]);
  return {
    id: Number(raw[0]),
    sku: raw[1],
    name: raw[2],
    description: raw[3],
    imageUrl: raw[4],
    category: raw[5],
    origin: raw[6],
    manufacturer: raw[7],
    currentOwner: raw[8],
    state: Number(raw[9]),
    stateName: STATE_NAMES[Number(raw[9])],
    tempMin: tempMin / 100,
    tempMax: tempMax / 100,
    hasTempRange: tempMin !== 0 || tempMax !== 0,
    createdAt: Number(raw[12]),
    updatedAt: Number(raw[13]),
    exists: raw[14]
  };
}

function serializeCheckpoint(raw) {
  const type = Number(raw[1]);
  return {
    index: Number(raw[0]),
    eventType: type,
    type: EVENT_NAMES[type],
    data: raw[2],
    temperature: Number(raw[3]) / 100,
    hasTemperature: raw[4],
    tempAlert: raw[5],
    actor: raw[6],
    timestamp: Number(raw[7]),
    prevHash: raw[8],
    recordHash: raw[9]
  };
}

async function fetchItems() {
  const c = readContract();
  const count = Number(await c.itemCount());
  if (count === 0) return [];
  const raws = await Promise.all(Array.from({ length: count }, (_, i) => c.getItem(i + 1)));
  return raws.filter((raw) => raw[14]).map(serializeItem);
}

async function fetchItem(id) {
  const raw = await readContract().getItem(id);
  if (!raw[14]) return null;
  return serializeItem(raw);
}

async function fetchCheckpoints(id) {
  const raw = await readContract().getCheckpoints(id);
  return raw.map(serializeCheckpoint);
}

function parseLeg(data) {
  try {
    const obj = JSON.parse(data);
    return {
      from: obj.from || '',
      to: obj.to || '',
      km: Number(obj.km) || 0,
      mode: (obj.mode || 'truck').toLowerCase()
    };
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Derived analytics: carbon, prediction, scans, temperature
// ---------------------------------------------------------------------------
const EMISSION_FACTORS = {
  truck: 0.105,
  van: 0.12,
  rail: 0.028,
  ship: 0.016,
  air: 0.5,
  drone: 0.05,
  bike: 0.0
};

function computeCarbon(checkpoints) {
  const byMode = {};
  let totalKm = 0;
  let totalKg = 0;
  const legs = [];
  checkpoints
    .filter((c) => c.eventType === EVENT.Leg)
    .forEach((c) => {
      const leg = parseLeg(c.data);
      if (!leg) return;
      const factor = EMISSION_FACTORS[leg.mode] ?? EMISSION_FACTORS.truck;
      const kg = leg.km * factor;
      totalKm += leg.km;
      totalKg += kg;
      byMode[leg.mode] = (byMode[leg.mode] || 0) + kg;
      legs.push({ ...leg, factor, kg, timestamp: c.timestamp });
    });
  const airKg = totalKm * EMISSION_FACTORS.air;
  return {
    totalKm: round(totalKm),
    totalKg: round(totalKg),
    byMode: Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, round(v)])),
    legs,
    treesToOffset: round(totalKg / 21),
    vsAirSavedKg: round(Math.max(airKg - totalKg, 0)),
    factorTable: EMISSION_FACTORS
  };
}

function computeTemperature(item, checkpoints) {
  const readings = checkpoints
    .filter((c) => c.eventType === EVENT.Temperature)
    .map((c) => ({ temperature: c.temperature, alert: c.tempAlert, location: c.data, timestamp: c.timestamp }));
  const alerts = readings.filter((r) => r.alert);
  return {
    readings,
    alerts,
    alertCount: alerts.length,
    min: readings.length ? Math.min(...readings.map((r) => r.temperature)) : null,
    max: readings.length ? Math.max(...readings.map((r) => r.temperature)) : null,
    range: item.hasTempRange ? { min: item.tempMin, max: item.tempMax } : null,
    status: alerts.length ? 'ALERT' : readings.length ? 'OK' : 'NO_DATA'
  };
}

function computeScans(checkpoints) {
  const scans = checkpoints
    .filter((c) => c.eventType === EVENT.Scan)
    .map((c) => ({ location: c.data || 'unknown', timestamp: c.timestamp, actor: c.actor }));
  const locations = {};
  scans.forEach((s) => (locations[s.location] = (locations[s.location] || 0) + 1));
  const uniqueLocations = Object.keys(locations);
  const reasons = [];
  if (uniqueLocations.length >= 4) reasons.push('Scanned from ' + uniqueLocations.length + ' different locations');
  if (scans.length >= 6) reasons.push('Unusually high scan count (' + scans.length + ')');
  const rapid = rapidScanDetected(scans);
  if (rapid) reasons.push('Multiple scans in a very short time window');
  return {
    scans,
    count: scans.length,
    locations,
    uniqueLocations,
    suspicious: reasons.length > 0,
    reasons
  };
}

function rapidScanDetected(scans) {
  const sorted = [...scans].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sorted.length; i++) {
    let inWindow = 0;
    const uniq = new Set();
    for (let j = i; j < sorted.length && sorted[j].timestamp - sorted[i].timestamp <= 60; j++) {
      inWindow++;
      uniq.add(sorted[j].location);
    }
    if (inWindow >= 3 && uniq.size >= 2) return true;
  }
  return false;
}

function computePrediction(item, checkpoints, allItems) {
  const now = Math.floor(Date.now() / 1000);
  const ageHours = (now - item.createdAt) / 3600;
  const staleHours = (now - item.updatedAt) / 3600;
  const temp = computeTemperature(item, checkpoints);
  const carbon = computeCarbon(checkpoints);

  let score = 0;
  const reasons = [];

  if (staleHours > 6) {
    const s = Math.min((staleHours - 6) / 2, 40);
    score += s;
    reasons.push(`No update for ${staleHours.toFixed(1)}h`);
  }
  if (temp.alertCount > 0) {
    score += Math.min(temp.alertCount * 12, 36);
    reasons.push(`${temp.alertCount} temperature alert(s) recorded`);
  }
  if (carbon.totalKm > 500) {
    score += Math.min(carbon.totalKm / 200, 20);
    reasons.push(`Long route (${carbon.totalKm} km)`);
  }
  const legs = checkpoints.filter((c) => c.eventType === EVENT.Leg).length;
  if (legs >= 3) {
    score += Math.min(legs * 4, 20);
    reasons.push(`${legs} transport handoffs`);
  }
  if (item.state === 1) {
    score += 10;
    reasons.push('Currently in transit');
  }
  if (item.state === 4) {
    score = Math.min(score, 5);
  }

  const delivered = allItems.filter((i) => i.state === 4);
  let avgTransit = null;
  if (delivered.length) {
    avgTransit = delivered.reduce((a, i) => a + (i.updatedAt - i.createdAt), 0) / delivered.length / 3600;
    if (item.state !== 4 && ageHours > avgTransit * 1.5) {
      score += 15;
      reasons.push(`Age ${ageHours.toFixed(1)}h exceeds historical avg ${avgTransit.toFixed(1)}h`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score < 30 ? 'Low' : score < 60 ? 'Medium' : 'High';

  const suggestions = [];
  if (temp.alertCount > 0) suggestions.push('Inspect cold-chain. Consider a faster carrier or reroute via a monitored hub.');
  if (staleHours > 6 && item.state !== 4) suggestions.push('Contact the current custodian to refresh the shipment checkpoint.');
  if (carbon.totalKm > 500) suggestions.push('Evaluate air freight or a shorter alternate route to protect ETA.');
  if (legs >= 3) suggestions.push('Consolidate handoffs to reduce handling delays.');
  if (!suggestions.length) suggestions.push('Shipment looks healthy. Continue monitoring normally.');

  const etaHours = avgTransit ? Math.max(0, avgTransit - ageHours) : null;
  return {
    riskScore: score,
    level,
    reasons,
    suggestions,
    ageHours: round(ageHours),
    staleHours: round(staleHours),
    historicalAvgTransitHours: avgTransit ? round(avgTransit) : null,
    estimatedHoursRemaining: etaHours !== null ? round(etaHours) : null
  };
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function fail(res, error, code = 400) {
  const message =
    (error && (error.shortMessage || error.reason || error.info?.error?.message || error.message)) ||
    String(error);
  res.status(code).json({ error: message });
}

// ---------------------------------------------------------------------------
// Routes: meta
// ---------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    const count = await readContract().itemCount();
    res.json({ ok: true, contract: CONTRACT_ADDRESS, itemCount: Number(count) });
  } catch (e) {
    res.json({ ok: false, contract: CONTRACT_ADDRESS, error: e.message });
  }
});

app.get('/actors', async (req, res) => {
  try {
    const c = readContract();
    const out = [];
    for (const a of ACTORS) {
      const role = Number(await c.roles(a.address));
      out.push({
        index: a.index,
        label: a.label,
        address: a.address,
        role,
        roleName: ROLE_NAMES[role],
        defaultRole: a.role,
        defaultRoleName: a.roleName,
        deliveries: Number(await c.deliveries(a.address)),
        disputes: Number(await c.disputes(a.address)),
        reliability: Number(await c.reliabilityScore(a.address))
      });
    }
    res.json({ actors: out, roles: ROLE_NAMES, states: STATE_NAMES, events: EVENT_NAMES });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: products
// ---------------------------------------------------------------------------
app.get('/items', async (req, res) => {
  try {
    res.json({ items: await fetchItems() });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/items/:id', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Product not found', notFound: true });
    res.json({ item });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.post('/items', async (req, res) => {
  try {
    const {
      actorIndex = 1,
      sku,
      name,
      description = '',
      imageUrl = '',
      category = 'General',
      origin = '',
      tempMin = 0,
      tempMax = 0
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const finalSku = sku && sku.trim() ? sku.trim() : 'SKU-' + Date.now();
    const c = contractFor(actorIndex);
    const tx = await c.createItem(
      finalSku,
      name,
      description,
      imageUrl,
      category,
      origin,
      toScaled(tempMin),
      toScaled(tempMax)
    );
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash, sku: finalSku });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/items/:id/state', async (req, res) => {
  try {
    const { actorIndex = 1, action } = req.body;
    const map = { ship: 'shipItem', receive: 'receiveItem', distribute: 'distributeItem', deliver: 'deliverItem' };
    const method = map[action];
    if (!method) return res.status(400).json({ error: 'Unknown action: ' + action });
    const c = contractFor(actorIndex);
    const tx = await c[method](req.params.id);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

// ---------------------------------------------------------------------------
// Routes: ownership transfer
// ---------------------------------------------------------------------------
app.post('/items/:id/transfer/request', async (req, res) => {
  try {
    const { actorIndex = 1, to } = req.body;
    if (!to) return res.status(400).json({ error: 'Receiver address (to) is required' });
    const c = contractFor(actorIndex);
    const tx = await c.requestTransfer(req.params.id, to);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/items/:id/transfer/confirm', async (req, res) => {
  try {
    const { actorIndex } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.confirmTransfer(req.params.id);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/items/:id/transfer/cancel', async (req, res) => {
  try {
    const { actorIndex = 1 } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.cancelTransfer(req.params.id);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/items/:id/transfer', async (req, res) => {
  try {
    const raw = await readContract().transfers(req.params.id);
    res.json({
      transfer: {
        itemId: Number(raw[0]),
        from: raw[1],
        to: raw[2],
        pending: raw[3],
        completed: raw[4],
        requestedAt: Number(raw[5]),
        completedAt: Number(raw[6])
      }
    });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: temperature
// ---------------------------------------------------------------------------
app.post('/items/:id/temperature', async (req, res) => {
  try {
    const { actorIndex = 1, temperature, location = 'Sensor checkpoint' } = req.body;
    if (temperature === undefined) return res.status(400).json({ error: 'temperature is required' });
    const c = contractFor(actorIndex);
    const tx = await c.addTemperature(req.params.id, toScaled(temperature), location);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/items/:id/temperature', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Product not found', notFound: true });
    const cps = await fetchCheckpoints(req.params.id);
    res.json({ temperature: computeTemperature(item, cps) });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: transport leg / carbon
// ---------------------------------------------------------------------------
app.post('/items/:id/leg', async (req, res) => {
  try {
    const { actorIndex = 1, from = '', to = '', distanceKm = 0, mode = 'truck' } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.addLeg(req.params.id, from, to, Math.round(Number(distanceKm)), mode);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/items/:id/carbon', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Product not found', notFound: true });
    const cps = await fetchCheckpoints(req.params.id);
    res.json({ carbon: computeCarbon(cps) });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/carbon', async (req, res) => {
  try {
    const items = await fetchItems();
    let totalKg = 0;
    let totalKm = 0;
    const perItem = [];
    const all = await Promise.all(items.map((item) => fetchCheckpoints(item.id)));
    items.forEach((item, i) => {
      const carbon = computeCarbon(all[i]);
      totalKg += carbon.totalKg;
      totalKm += carbon.totalKm;
      perItem.push({ id: item.id, name: item.name, ...carbon });
    });
    res.json({ totalKg: round(totalKg), totalKm: round(totalKm), perItem });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: scans / fake-product detection
// ---------------------------------------------------------------------------
app.post('/items/:id/scan', async (req, res) => {
  try {
    const { actorIndex = 5, location = 'Unknown' } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.recordScan(req.params.id, location);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.get('/items/:id/authenticity', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) {
      return res.status(404).json({
        notFound: true,
        authentic: false,
        message: 'Product not found on the blockchain. This QR may be counterfeit.',
        scans: { scans: [], count: 0, locations: {}, uniqueLocations: 0, suspicious: false, reasons: [] }
      });
    }
    const cps = await fetchCheckpoints(req.params.id);
    const scans = computeScans(cps);
    res.json({
      item,
      authentic: true,
      scanVerified: cps.some((c) => c.eventType === EVENT.Scan),
      scans,
      message: scans.suspicious
        ? 'Authentic product, but suspicious scanning activity detected.'
        : 'Authentic product verified against the blockchain.'
    });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/authenticity', async (req, res) => {
  try {
    const items = await fetchItems();
    const all = await Promise.all(items.map((item) => fetchCheckpoints(item.id)));
    const out = items.map((item, i) => ({
      item,
      scans: computeScans(all[i]),
      carbon: computeCarbon(all[i])
    }));
    const suspicious = out.filter((o) => o.scans.suspicious);
    res.json({ items: out, suspiciousCount: suspicious.length });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: audit trail / integrity
// ---------------------------------------------------------------------------
app.get('/items/:id/checkpoints', async (req, res) => {
  try {
    const cps = await fetchCheckpoints(req.params.id);
    const c = readContract();
    for (const cp of cps) {
      try {
        cp.tampered = await c.tampered(req.params.id, cp.index);
      } catch (e) {
        cp.tampered = false;
      }
    }
    res.json({ checkpoints: cps });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/items/:id/verify', async (req, res) => {
  try {
    const result = await readContract().verifyChain(req.params.id);
    res.json({ valid: result[0], length: Number(result[1]) });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.post('/items/:id/tamper', async (req, res) => {
  try {
    const { actorIndex = 0, index = 0, newData = 'TAMPERED BY ATTACKER' } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.simulateTamper(req.params.id, index, newData);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/items/:id/untamper', async (req, res) => {
  try {
    const { actorIndex = 0, index = 0 } = req.body;
    const c = contractFor(actorIndex);
    const tx = await c.undoTamper(req.params.id, index);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

// ---------------------------------------------------------------------------
// Routes: AI prediction
// ---------------------------------------------------------------------------
app.get('/items/:id/prediction', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Product not found', notFound: true });
    const cps = await fetchCheckpoints(req.params.id);
    const all = await fetchItems();
    res.json({ prediction: computePrediction(item, cps, all) });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/predictions', async (req, res) => {
  try {
    const items = await fetchItems();
    const all = await Promise.all(items.map((item) => fetchCheckpoints(item.id)));
    const out = items.map((item, i) => ({ item, prediction: computePrediction(item, all[i], items) }));
    out.sort((a, b) => b.prediction.riskScore - a.prediction.riskScore);
    res.json({ predictions: out });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Routes: reputation / disputes
// ---------------------------------------------------------------------------
app.get('/reputation', async (req, res) => {
  try {
    const c = readContract();
    const out = [];
    for (const a of ACTORS) {
      const role = Number(await c.roles(a.address));
      const deliveries = Number(await c.deliveries(a.address));
      const disputes = Number(await c.disputes(a.address));
      const reliability = Number(await c.reliabilityScore(a.address));
      if (role === ROLE.None) continue;
      out.push({
        index: a.index,
        label: a.label,
        address: a.address,
        role,
        roleName: ROLE_NAMES[role],
        deliveries,
        disputes,
        reliability
      });
    }
    out.sort((a, b) => b.reliability - a.reliability);
    res.json({ suppliers: out });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.post('/dispute', async (req, res) => {
  try {
    const { actorIndex = 0, supplier, reason = 'Unspecified' } = req.body;
    if (!supplier) return res.status(400).json({ error: 'supplier address is required' });
    const c = contractFor(actorIndex);
    const tx = await c.raiseDispute(supplier, reason);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

app.post('/roles/assign', async (req, res) => {
  try {
    const { actorIndex = 0, account, role } = req.body;
    if (!account || role === undefined) return res.status(400).json({ error: 'account and role are required' });
    const c = contractFor(actorIndex);
    const tx = await c.assignRole(account, Number(role));
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash });
  } catch (e) {
    fail(res, e);
  }
});

// ---------------------------------------------------------------------------
// Routes: passport + overview
// ---------------------------------------------------------------------------
app.get('/items/:id/passport', async (req, res) => {
  try {
    const item = await fetchItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Product not found', notFound: true });
    const cps = await fetchCheckpoints(req.params.id);
    const all = await fetchItems();
    const verify = await readContract().verifyChain(req.params.id);
    res.json({
      item,
      checkpoints: cps,
      temperature: computeTemperature(item, cps),
      carbon: computeCarbon(cps),
      scans: computeScans(cps),
      prediction: computePrediction(item, cps, all),
      integrity: { valid: verify[0], length: Number(verify[1]) }
    });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/overview', async (req, res) => {
  try {
    const items = await fetchItems();
    const all = await Promise.all(items.map((item) => fetchCheckpoints(item.id)));
    let totalCheckpoints = 0;
    let alerts = 0;
    let highRisk = 0;
    let suspicious = 0;
    const byState = [0, 0, 0, 0, 0];
    const activity = [];
    items.forEach((item, i) => {
      const cps = all[i];
      byState[item.state]++;
      totalCheckpoints += cps.length;
      const temp = computeTemperature(item, cps);
      alerts += temp.alertCount;
      if (computeScans(cps).suspicious) suspicious++;
      if (computePrediction(item, cps, items).level === 'High') highRisk++;
      cps.slice(-3).forEach((cp) => activity.push({ id: item.id, name: item.name, ...cp }));
    });
    activity.sort((a, b) => b.timestamp - a.timestamp);
    res.json({
      itemCount: items.length,
      byState,
      stateNames: STATE_NAMES,
      totalCheckpoints,
      alerts,
      highRisk,
      suspicious,
      recentActivity: activity.slice(0, 12)
    });
  } catch (e) {
    fail(res, e, 500);
  }
});

// ---------------------------------------------------------------------------
// Bootstrap: make sure actors have their default on-chain roles
// ---------------------------------------------------------------------------
async function bootstrapRoles() {
  try {
    const c = readContract();
    const admin = contractFor(0);
    for (const a of ACTORS) {
      if (a.role === ROLE.Admin) continue;
      const current = Number(await c.roles(a.address));
      if (current === ROLE.None) {
        const tx = await admin.assignRole(a.address, a.role);
        await tx.wait();
        console.log(`Assigned role ${a.roleName} to ${a.label} (${a.address})`);
      }
    }
    console.log('Role bootstrap complete.');
  } catch (e) {
    console.warn('Role bootstrap skipped:', e.shortMessage || e.message);
  }
}

module.exports = app;

if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Contract: ${CONTRACT_ADDRESS}`);
    await bootstrapRoles();
  });
}
