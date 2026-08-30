const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');

dotenv.config({ path: __dirname + '/.env' });
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const mongo = new MongoClient(process.env.MONGO_URL);
const db = mongo.db(process.env.DB_NAME);
const users = db.collection('users');
const properties = db.collection('properties');
const messages = db.collection('messages');
const files = db.collection('files');
const reports = db.collection('market_reports');
const JWT_SECRET = process.env.JWT_SECRET || 'lumina-local-secret';
const uid = () => crypto.randomUUID();
const threadIdFor = (a, b, p) => [a, b].sort().join('|') + '|' + (p || 'general');
const defaultAgentProfile = () => ({ headline: '', bio: '', phone: '', specialties: [], yearsExperience: 0, city: '', portrait: '', licenseNumber: '' });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 8 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) });
let storageKey = null;
const storageBase = `${process.env.INTEGRATION_PROXY_URL || 'https://integrations.emergentagent.com'}/objstore/api/v1/storage`;

const seedProperties = [
  { id: 'p1', title: 'The Glasshouse', city: 'Austin, TX', neighborhood: 'Westlake', price: 2450000, beds: 4, baths: 3.5, sqft: 3860, type: 'Villa', status: 'For sale', image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=85', accent: '01', description: 'A sculptural glass residence with a private infinity pool and limestone courtyard.', tags: ['Pool', 'Smart home', 'Lake view'], featured: true, aiScore: 98, createdAt: new Date().toISOString() },
  { id: 'p2', title: 'No. 28 Penthouse', city: 'Miami, FL', neighborhood: 'Brickell', price: 1780000, beds: 3, baths: 2.5, sqft: 2190, type: 'Penthouse', status: 'For sale', image: 'https://images.unsplash.com/photo-1776362355123-ca966d36e29c?auto=format&fit=crop&w=1200&q=85', accent: '02', description: 'Panoramic skyline living on the 28th floor with concierge service and sunset terraces.', tags: ['Skyline', 'Concierge', 'Terrace'], featured: true, aiScore: 95, createdAt: new Date().toISOString() },
  { id: 'p3', title: 'Canyon House', city: 'Los Angeles, CA', neighborhood: 'Los Feliz', price: 3295000, beds: 5, baths: 4, sqft: 4210, type: 'House', status: 'For sale', image: 'https://images.pexels.com/photos/6970051/pexels-photo-6970051.jpeg?auto=compress&cs=tinysrgb&w=1200', accent: '03', description: 'Quiet hillside architecture with a cinematic kitchen and mature olive garden.', tags: ['Garden', 'Views', 'Guest suite'], featured: true, aiScore: 91, createdAt: new Date().toISOString() },
  { id: 'p4', title: 'The Juniper', city: 'Denver, CO', neighborhood: 'Cherry Creek', price: 1195000, beds: 3, baths: 2, sqft: 1870, type: 'Townhome', status: 'For sale', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85', accent: '04', description: 'Warm modern townhome steps from galleries, parks, and independent coffee houses.', tags: ['Walkable', 'Garage', 'Fireplace'], featured: false, aiScore: 88, createdAt: new Date().toISOString() },
  { id: 'p5', title: 'Aster Loft', city: 'New York, NY', neighborhood: 'SoHo', price: 2050000, beds: 2, baths: 2, sqft: 1540, type: 'Loft', status: 'For sale', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', accent: '05', description: 'An airy cast-iron loft with original beams, tall windows, and gallery proportions.', tags: ['Loft', 'Historic', 'Central'], featured: false, aiScore: 86, createdAt: new Date().toISOString() },
  { id: 'p6', title: 'Palm Court', city: 'Scottsdale, AZ', neighborhood: 'Arcadia', price: 945000, beds: 4, baths: 3, sqft: 2460, type: 'Villa', status: 'For sale', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85', accent: '06', description: 'Indoor-outdoor desert living with a shaded courtyard and resort-like pool.', tags: ['Desert', 'Pool', 'Solar'], featured: false, aiScore: 84, createdAt: new Date().toISOString() }
];

function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(), profile: user.profile || null }; }
function publicAgent(user, listingsCount = 0) { return { id: user.id, name: user.name, role: user.role, initials: user.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase(), profile: user.profile || defaultAgentProfile(), listingsCount }; }
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) { const raw = req.headers.authorization || ''; try { req.user = jwt.verify(raw.replace('Bearer ', ''), JWT_SECRET); next(); } catch { res.status(401).json({ message: 'Please sign in to continue.' }); } }
function clean(doc) { if (!doc) return null; const { _id, ...rest } = doc; return rest; }

async function seed() {
  if (!await users.findOne({ email: 'buyer@lumina.demo' })) {
    const password = await bcrypt.hash('Lumina2026!', 10);
    await users.insertMany([
      { id: uid(), name: 'Maya Chen', email: 'buyer@lumina.demo', password, role: 'buyer', wishlist: [], compare: [], profile: null },
      { id: uid(), name: 'Julian Hart', email: 'seller@lumina.demo', password, role: 'seller', wishlist: [], compare: [], profile: { headline: 'Principal advisor · Coastal & lakefront homes', bio: 'Ten years placing families into homes that hold their character. I represent a small, focused list — every listing personally scouted.', phone: '+1 (512) 555-0102', specialties: ['Lakefront villas', 'Family homes', 'Investment portfolios'], yearsExperience: 11, city: 'Austin, TX', portrait: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=85', licenseNumber: 'TX-882410' } }
    ]);
  }
  const additionalAgents = [
    { email: 'selene@lumina.demo', name: 'Selene Ward', profile: { headline: 'Cityside penthouses & modern lofts', bio: 'Skyline addresses in Miami and New York. Known for sourcing off-market inventory before it lists.', phone: '+1 (305) 555-0187', specialties: ['Penthouses', 'Lofts', 'Off-market deals'], yearsExperience: 8, city: 'Miami, FL', portrait: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=600&q=85', licenseNumber: 'FL-448932' } },
    { email: 'ronan@lumina.demo', name: 'Ronan Vidal', profile: { headline: 'Desert modern & indoor-outdoor living', bio: 'Scottsdale and Los Angeles specialist focused on quiet architecture and long-term value.', phone: '+1 (480) 555-0155', specialties: ['Villas', 'Architectural homes', 'Second homes'], yearsExperience: 14, city: 'Scottsdale, AZ', portrait: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=85', licenseNumber: 'AZ-661201' } }
  ];
  for (const a of additionalAgents) {
    if (!await users.findOne({ email: a.email })) {
      const password = await bcrypt.hash('Lumina2026!', 10);
      await users.insertOne({ id: uid(), name: a.name, email: a.email, password, role: 'seller', wishlist: [], compare: [], profile: a.profile });
    }
  }
  // Backfill: ensure the primary seller has an agent profile
  const primary = await users.findOne({ email: 'seller@lumina.demo' });
  if (primary && !primary.profile) await users.updateOne({ id: primary.id }, { $set: { profile: { headline: 'Principal advisor · Coastal & lakefront homes', bio: 'Ten years placing families into homes that hold their character. I represent a small, focused list — every listing personally scouted.', phone: '+1 (512) 555-0102', specialties: ['Lakefront villas', 'Family homes', 'Investment portfolios'], yearsExperience: 11, city: 'Austin, TX', portrait: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=600&q=85', licenseNumber: 'TX-882410' } } });
  const sellers = await users.find({ role: 'seller' }).toArray();
  const byEmail = Object.fromEntries(sellers.map(s => [s.email, s.id]));
  const assign = { p1: byEmail['seller@lumina.demo'], p2: byEmail['selene@lumina.demo'], p3: byEmail['ronan@lumina.demo'], p4: byEmail['seller@lumina.demo'], p5: byEmail['selene@lumina.demo'], p6: byEmail['ronan@lumina.demo'] };
  if (!await properties.findOne({ id: 'p1' })) {
    await properties.insertMany(seedProperties.map(p => ({ ...p, sellerId: assign[p.id] || byEmail['seller@lumina.demo'] })));
  } else {
    for (const [id, sellerId] of Object.entries(assign)) {
      if (sellerId) await properties.updateOne({ id, sellerId: { $exists: false } }, { $set: { sellerId } });
    }
  }
}

async function askGemini(prompt, catalog) {
  const key = process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY;
  if (!key) return null;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `You are Lumina, a precise luxury real estate advisor. Use only the catalog below. Answer in two warm, concise sentences and name the best matching property. User brief: ${prompt}\nCatalog: ${JSON.stringify(catalog)}` }] }] })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || null;
  } catch (error) { console.warn('Gemini request unavailable:', error.message); return null; }
}

async function getStorageKey() {
  if (storageKey) return storageKey;
  const response = await fetch(`${storageBase}/init`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emergent_key: process.env.EMERGENT_LLM_KEY }) });
  if (!response.ok) throw new Error(`Storage init failed (${response.status})`);
  storageKey = (await response.json()).storage_key;
  return storageKey;
}
async function putImage(file, userId) {
  const ext = file.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `lumina-estates/uploads/${userId}/${uid()}.${ext}`;
  const key = await getStorageKey();
  const response = await fetch(`${storageBase}/objects/${path}`, { method: 'PUT', headers: { 'X-Storage-Key': key, 'Content-Type': file.mimetype }, body: file.buffer });
  if (!response.ok) throw new Error(`Image upload failed (${response.status})`);
  const result = await response.json();
  const record = { id: uid(), storagePath: result.path, originalFilename: file.originalname, contentType: file.mimetype, size: result.size, ownerId: userId, isDeleted: false, createdAt: new Date().toISOString() };
  await files.insertOne(record);
  return { id: record.id, url: `/api/files/${record.id}`, originalFilename: record.originalFilename };
}
async function reportFor(property) {
  const estimatedLow = Math.round(property.price * .96 / 1000) * 1000;
  const estimatedHigh = Math.round(property.price * 1.05 / 1000) * 1000;
  return { valueSignal: property.aiScore > 90 ? 'Exceptional' : 'Strong', estimatedRange: `$${estimatedLow.toLocaleString()} – $${estimatedHigh.toLocaleString()}`, investmentScore: Math.max(70, property.aiScore - 3), confidence: property.aiScore > 90 ? 'High' : 'Good', risks: ['Review HOA and insurance documents', 'Validate recent comparable sales'], comparables: [{ label: 'Neighborhood median', value: `$${Math.round(property.price * .91 / 1000).toLocaleString()}` }, { label: 'Price / sqft', value: `$${Math.round(property.price / property.sqft).toLocaleString()}` }, { label: '12-month demand', value: property.aiScore > 90 ? 'Strong' : 'Steady' }], insight: 'The location and amenity mix support resilient demand. The strongest upside is long-term rental flexibility.' };
}

app.get('/api', (_req, res) => res.json({ message: 'Lumina Estates API', status: 'ready' }));
app.post('/api/auth/register', async (req, res) => { const { name, email, password, role = 'buyer' } = req.body; if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' }); if (await users.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists.' }); const user = { id: uid(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 10), role: role === 'seller' ? 'seller' : 'buyer', wishlist: [], compare: [] }; await users.insertOne(user); res.json({ token: tokenFor(user), user: publicUser(user) }); });
app.post('/api/auth/login', async (req, res) => { const user = await users.findOne({ email: (req.body.email || '').toLowerCase() }); if (!user || !await bcrypt.compare(req.body.password || '', user.password)) return res.status(401).json({ message: 'Email or password is not correct.' }); res.json({ token: tokenFor(user), user: publicUser(user) }); });
app.get('/api/auth/me', auth, async (req, res) => res.json({ user: publicUser(await users.findOne({ id: req.user.id })) }));

app.get('/api/properties', async (req, res) => { const q = (req.query.q || '').trim(); const filter = {}; if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { city: { $regex: q, $options: 'i' } }, { neighborhood: { $regex: q, $options: 'i' } }, { tags: { $regex: q, $options: 'i' } }]; if (req.query.type && req.query.type !== 'All') filter.type = req.query.type; if (req.query.max) filter.price = { $lte: Number(req.query.max) }; const list = await properties.find(filter, { projection: { _id: 0 } }).sort({ featured: -1 }).toArray(); res.json({ properties: list }); });
app.get('/api/properties/:id', async (req, res) => { const p = await properties.findOne({ id: req.params.id }, { projection: { _id: 0 } }); if (!p) return res.status(404).json({ message: 'Property not found.' }); const seller = p.sellerId ? await users.findOne({ id: p.sellerId }) : null; res.json({ property: { ...p, seller: seller ? publicAgent(seller) : null } }); });
app.post('/api/storage/upload', auth, upload.array('images', 8), async (req, res) => { if (req.user.role !== 'seller') return res.status(403).json({ message: 'Only sellers can upload listing images.' }); if (!req.files?.length) return res.status(400).json({ message: 'Choose at least one JPG, PNG, WEBP, or GIF image.' }); try { const uploaded = []; for (const file of req.files) uploaded.push(await putImage(file, req.user.id)); res.json({ files: uploaded }); } catch (error) { if (/403|401/.test(error.message)) storageKey = null; res.status(502).json({ message: 'Image storage is temporarily unavailable. Please try again.' }); } });
app.get('/api/files/:id', async (req, res) => { const record = await files.findOne({ id: req.params.id, isDeleted: false }); if (!record) return res.status(404).end(); try { const key = await getStorageKey(); const response = await fetch(`${storageBase}/objects/${record.storagePath}`, { headers: { 'X-Storage-Key': key } }); if (!response.ok) return res.status(response.status).end(); res.set('Content-Type', record.contentType); res.send(Buffer.from(await response.arrayBuffer())); } catch { res.status(502).end(); } });
app.post('/api/properties', auth, async (req, res) => { if (req.user.role !== 'seller') return res.status(403).json({ message: 'Only sellers can publish listings.' }); const numeric = ['price', 'beds', 'baths', 'sqft']; const property = { ...req.body, ...Object.fromEntries(numeric.map(key => [key, Number(req.body[key])])), id: uid(), sellerId: req.user.id, status: 'For sale', createdAt: new Date().toISOString(), aiScore: 82, tags: Array.isArray(req.body.tags) ? req.body.tags : String(req.body.tags || '').split(',').map(x => x.trim()).filter(Boolean), views: 0, saves: 0, inquiries: 0 }; await properties.insertOne(property); res.json({ property: clean(property) }); });

app.get('/api/me/saved', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); const saved = await properties.find({ id: { $in: user.wishlist || [] } }, { projection: { _id: 0 } }).toArray(); res.json({ wishlist: saved, compare: user.compare || [] }); });
app.post('/api/me/wishlist/:id', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); const list = user.wishlist || []; const wishlist = list.includes(req.params.id) ? list.filter(id => id !== req.params.id) : [...list, req.params.id]; await users.updateOne({ id: req.user.id }, { $set: { wishlist } }); res.json({ wishlist }); });
app.post('/api/me/compare/:id', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); let compare = user.compare || []; compare = compare.includes(req.params.id) ? compare.filter(id => id !== req.params.id) : [...compare, req.params.id].slice(-3); await users.updateOne({ id: req.user.id }, { $set: { compare } }); res.json({ compare }); });

app.get('/api/dashboard', auth, async (req, res) => { const mine = await properties.find({ sellerId: req.user.id }, { projection: { _id: 0 } }).toArray(); const listingViews = mine.reduce((sum, p) => sum + (p.views || 0), 0); const listingSaves = mine.reduce((sum, p) => sum + (p.saves || 0), 0); res.json({ stats: { activeListings: req.user.role === 'seller' ? mine.length : 8, views: req.user.role === 'seller' ? listingViews : 1240, saves: req.user.role === 'seller' ? listingSaves : 284, inquiries: req.user.role === 'seller' ? mine.reduce((sum, p) => sum + (p.inquiries || 0), 0) : 36, aiMatches: 14 }, listings: mine, suggestions: req.user.role === 'seller' ? ['Add a floor plan to improve qualified saves', 'Your description is strongest when it leads with the garden', 'Weekday evening inquiries are trending up'] : [] }); });
app.get('/api/messages', auth, async (req, res) => {
  const list = await messages.find({ participants: req.user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  const byThread = new Map();
  for (const m of list) {
    if (!byThread.has(m.threadId)) byThread.set(m.threadId, { latest: m, unread: 0 });
    if (m.recipientId === req.user.id && !m.read) byThread.get(m.threadId).unread++;
  }
  const otherIds = [...new Set([...byThread.values()].map(t => t.latest.participants.find(id => id !== req.user.id)).filter(Boolean))];
  const propIds = [...new Set([...byThread.values()].map(t => t.latest.propertyId).filter(Boolean))];
  const [otherUsers, props] = await Promise.all([
    otherIds.length ? users.find({ id: { $in: otherIds } }).toArray() : [],
    propIds.length ? properties.find({ id: { $in: propIds } }).toArray() : []
  ]);
  const userMap = Object.fromEntries(otherUsers.map(u => [u.id, publicUser(u)]));
  const propMap = Object.fromEntries(props.map(p => [p.id, p]));
  const threads = [...byThread.entries()].map(([threadId, t]) => {
    const otherId = t.latest.participants.find(id => id !== req.user.id);
    const p = t.latest.propertyId ? propMap[t.latest.propertyId] : null;
    return { threadId, unread: t.unread, lastText: t.latest.text, lastAt: t.latest.createdAt, lastSenderId: t.latest.senderId, otherUser: userMap[otherId] || null, property: p ? { id: p.id, title: p.title, image: p.image, city: p.city, price: p.price } : null };
  }).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);
  res.json({ threads, unread: unreadTotal });
});

app.get('/api/messages/threads/:threadId', auth, async (req, res) => {
  const list = await messages.find({ threadId: req.params.threadId, participants: req.user.id }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
  if (!list.length) return res.status(404).json({ message: 'Conversation not found.' });
  await messages.updateMany({ threadId: req.params.threadId, recipientId: req.user.id, read: { $ne: true } }, { $set: { read: true } });
  const otherId = list[0].participants.find(id => id !== req.user.id);
  const [other, property] = await Promise.all([
    otherId ? users.findOne({ id: otherId }) : null,
    list[0].propertyId ? properties.findOne({ id: list[0].propertyId }, { projection: { _id: 0 } }) : null
  ]);
  res.json({ threadId: req.params.threadId, otherUser: other ? publicUser(other) : null, property, messages: list });
});

app.post('/api/messages', auth, async (req, res) => {
  const recipientId = (req.body.recipientId || '').trim();
  const text = (req.body.text || '').trim();
  if (!recipientId || !text) return res.status(400).json({ message: 'Recipient and message text are required.' });
  if (recipientId === req.user.id) return res.status(400).json({ message: 'You cannot message yourself.' });
  const recipient = await users.findOne({ id: recipientId });
  if (!recipient) return res.status(404).json({ message: 'Recipient not found.' });
  const propertyId = req.body.propertyId || null;
  const threadId = threadIdFor(req.user.id, recipientId, propertyId);
  const item = { id: uid(), threadId, senderId: req.user.id, recipientId, participants: [req.user.id, recipientId], propertyId, text, read: false, createdAt: new Date().toISOString() };
  await messages.insertOne(item);
  if (propertyId) await properties.updateOne({ id: propertyId }, { $inc: { inquiries: 1 } });
  res.json({ message: clean(item), threadId });
});

app.post('/api/messages/threads/:threadId/read', auth, async (req, res) => {
  await messages.updateMany({ threadId: req.params.threadId, recipientId: req.user.id }, { $set: { read: true } });
  res.json({ ok: true });
});

app.get('/api/agents', async (_req, res) => {
  const list = await users.find({ role: 'seller', profile: { $ne: null } }).toArray();
  const counts = await properties.aggregate([{ $group: { _id: '$sellerId', n: { $sum: 1 } } }]).toArray();
  const countMap = Object.fromEntries(counts.map(c => [c._id, c.n]));
  res.json({ agents: list.map(u => publicAgent(u, countMap[u.id] || 0)) });
});

app.get('/api/agents/:id', async (req, res) => {
  const u = await users.findOne({ id: req.params.id, role: 'seller' });
  if (!u) return res.status(404).json({ message: 'Agent not found.' });
  const listings = await properties.find({ sellerId: u.id }, { projection: { _id: 0 } }).toArray();
  res.json({ agent: publicAgent(u, listings.length), listings });
});

app.put('/api/me/profile', auth, async (req, res) => {
  if (req.user.role !== 'seller') return res.status(403).json({ message: 'Only sellers can maintain an agent profile.' });
  const current = (await users.findOne({ id: req.user.id }))?.profile || defaultAgentProfile();
  const specialties = Array.isArray(req.body.specialties) ? req.body.specialties : String(req.body.specialties || '').split(',').map(x => x.trim()).filter(Boolean);
  const merged = { ...current, ...req.body, specialties: specialties.length ? specialties : current.specialties || [], yearsExperience: Number(req.body.yearsExperience ?? current.yearsExperience) || 0 };
  await users.updateOne({ id: req.user.id }, { $set: { profile: merged } });
  res.json({ profile: merged });
});

app.post('/api/ai/assistant', async (req, res) => { const prompt = (req.body.prompt || '').toLowerCase(); const all = await properties.find({}, { projection: { _id: 0 } }).toArray(); const matches = all.filter(p => prompt.includes(p.city.split(',')[0].toLowerCase()) || prompt.includes(p.type.toLowerCase()) || p.price < (prompt.includes('million') ? 3000000 : 999999999)).slice(0, 3); const chosen = matches.length ? matches : all.slice(0, 3); const geminiReply = await askGemini(req.body.prompt || '', chosen); res.json({ reply: geminiReply || `I found ${chosen.length} strong matches. Based on your brief, I’d start with ${chosen[0].title} in ${chosen[0].city} — it scores ${chosen[0].aiScore}/100 for fit.`, properties: chosen, source: geminiReply ? 'gemini' : 'lumina-insights-fallback' }); });
app.post('/api/ai/analyze/:id', async (req, res) => { const p = await properties.findOne({ id: req.params.id }, { projection: { _id: 0 } }); if (!p) return res.status(404).json({ message: 'Property not found.' }); res.json({ analysis: await reportFor(p) }); });
app.get('/api/reports', auth, async (req, res) => res.json({ reports: await reports.find({ userId: req.user.id }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray() }));
app.post('/api/reports', auth, async (req, res) => { const property = await properties.findOne({ id: req.body.propertyId }, { projection: { _id: 0 } }); if (!property) return res.status(404).json({ message: 'Property not found.' }); const report = { id: uid(), userId: req.user.id, propertyId: property.id, propertyTitle: property.title, city: property.city, price: property.price, analysis: await reportFor(property), createdAt: new Date().toISOString() }; await reports.insertOne(report); res.json({ report: clean(report) }); });

async function start() { await mongo.connect(); await seed(); app.listen(8002, '127.0.0.1', () => console.log('Lumina Express API listening on 8002')); }
start().catch(err => { console.error(err); process.exit(1); });