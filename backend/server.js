const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

dotenv.config({ path: __dirname + '/.env' });
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const mongo = new MongoClient(process.env.MONGO_URL);
const db = mongo.db(process.env.DB_NAME);
const users = db.collection('users');
const properties = db.collection('properties');
const messages = db.collection('messages');
const JWT_SECRET = process.env.JWT_SECRET || 'lumina-local-secret';
const uid = () => crypto.randomUUID();

const seedProperties = [
  { id: 'p1', title: 'The Glasshouse', city: 'Austin, TX', neighborhood: 'Westlake', price: 2450000, beds: 4, baths: 3.5, sqft: 3860, type: 'Villa', status: 'For sale', image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1200&q=85', accent: '01', description: 'A sculptural glass residence with a private infinity pool and limestone courtyard.', tags: ['Pool', 'Smart home', 'Lake view'], featured: true, aiScore: 98, createdAt: new Date().toISOString() },
  { id: 'p2', title: 'No. 28 Penthouse', city: 'Miami, FL', neighborhood: 'Brickell', price: 1780000, beds: 3, baths: 2.5, sqft: 2190, type: 'Penthouse', status: 'For sale', image: 'https://images.unsplash.com/photo-1776362355123-ca966d36e29c?auto=format&fit=crop&w=1200&q=85', accent: '02', description: 'Panoramic skyline living on the 28th floor with concierge service and sunset terraces.', tags: ['Skyline', 'Concierge', 'Terrace'], featured: true, aiScore: 95, createdAt: new Date().toISOString() },
  { id: 'p3', title: 'Canyon House', city: 'Los Angeles, CA', neighborhood: 'Los Feliz', price: 3295000, beds: 5, baths: 4, sqft: 4210, type: 'House', status: 'For sale', image: 'https://images.pexels.com/photos/6970051/pexels-photo-6970051.jpeg?auto=compress&cs=tinysrgb&w=1200', accent: '03', description: 'Quiet hillside architecture with a cinematic kitchen and mature olive garden.', tags: ['Garden', 'Views', 'Guest suite'], featured: true, aiScore: 91, createdAt: new Date().toISOString() },
  { id: 'p4', title: 'The Juniper', city: 'Denver, CO', neighborhood: 'Cherry Creek', price: 1195000, beds: 3, baths: 2, sqft: 1870, type: 'Townhome', status: 'For sale', image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85', accent: '04', description: 'Warm modern townhome steps from galleries, parks, and independent coffee houses.', tags: ['Walkable', 'Garage', 'Fireplace'], featured: false, aiScore: 88, createdAt: new Date().toISOString() },
  { id: 'p5', title: 'Aster Loft', city: 'New York, NY', neighborhood: 'SoHo', price: 2050000, beds: 2, baths: 2, sqft: 1540, type: 'Loft', status: 'For sale', image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85', accent: '05', description: 'An airy cast-iron loft with original beams, tall windows, and gallery proportions.', tags: ['Loft', 'Historic', 'Central'], featured: false, aiScore: 86, createdAt: new Date().toISOString() },
  { id: 'p6', title: 'Palm Court', city: 'Scottsdale, AZ', neighborhood: 'Arcadia', price: 945000, beds: 4, baths: 3, sqft: 2460, type: 'Villa', status: 'For sale', image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=85', accent: '06', description: 'Indoor-outdoor desert living with a shaded courtyard and resort-like pool.', tags: ['Desert', 'Pool', 'Solar'], featured: false, aiScore: 84, createdAt: new Date().toISOString() }
];

function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase() }; }
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req, res, next) { const raw = req.headers.authorization || ''; try { req.user = jwt.verify(raw.replace('Bearer ', ''), JWT_SECRET); next(); } catch { res.status(401).json({ message: 'Please sign in to continue.' }); } }
function clean(doc) { if (!doc) return null; const { _id, ...rest } = doc; return rest; }

async function seed() {
  if (!await properties.findOne({ id: 'p1' })) await properties.insertMany(seedProperties);
  if (!await users.findOne({ email: 'buyer@lumina.demo' })) {
    const password = await bcrypt.hash('Lumina2026!', 10);
    await users.insertMany([
      { id: uid(), name: 'Maya Chen', email: 'buyer@lumina.demo', password, role: 'buyer', wishlist: [], compare: [] },
      { id: uid(), name: 'Julian Hart', email: 'seller@lumina.demo', password, role: 'seller', wishlist: [], compare: [] }
    ]);
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

app.get('/api', (_req, res) => res.json({ message: 'Lumina Estates API', status: 'ready' }));
app.post('/api/auth/register', async (req, res) => { const { name, email, password, role = 'buyer' } = req.body; if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required.' }); if (await users.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account with this email already exists.' }); const user = { id: uid(), name, email: email.toLowerCase(), password: await bcrypt.hash(password, 10), role: role === 'seller' ? 'seller' : 'buyer', wishlist: [], compare: [] }; await users.insertOne(user); res.json({ token: tokenFor(user), user: publicUser(user) }); });
app.post('/api/auth/login', async (req, res) => { const user = await users.findOne({ email: (req.body.email || '').toLowerCase() }); if (!user || !await bcrypt.compare(req.body.password || '', user.password)) return res.status(401).json({ message: 'Email or password is not correct.' }); res.json({ token: tokenFor(user), user: publicUser(user) }); });
app.get('/api/auth/me', auth, async (req, res) => res.json({ user: publicUser(await users.findOne({ id: req.user.id })) }));

app.get('/api/properties', async (req, res) => { const q = (req.query.q || '').trim(); const filter = {}; if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { city: { $regex: q, $options: 'i' } }, { neighborhood: { $regex: q, $options: 'i' } }, { tags: { $regex: q, $options: 'i' } }]; if (req.query.type && req.query.type !== 'All') filter.type = req.query.type; if (req.query.max) filter.price = { $lte: Number(req.query.max) }; const list = await properties.find(filter, { projection: { _id: 0 } }).sort({ featured: -1 }).toArray(); res.json({ properties: list }); });
app.get('/api/properties/:id', async (req, res) => res.json({ property: clean(await properties.findOne({ id: req.params.id }, { projection: { _id: 0 } })) }));
app.post('/api/properties', auth, async (req, res) => { if (req.user.role !== 'seller') return res.status(403).json({ message: 'Only sellers can publish listings.' }); const property = { ...req.body, id: uid(), sellerId: req.user.id, status: 'For sale', createdAt: new Date().toISOString(), aiScore: 82, tags: req.body.tags || [] }; await properties.insertOne(property); res.json({ property: clean(property) }); });

app.get('/api/me/saved', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); const saved = await properties.find({ id: { $in: user.wishlist || [] } }, { projection: { _id: 0 } }).toArray(); res.json({ wishlist: saved, compare: user.compare || [] }); });
app.post('/api/me/wishlist/:id', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); const list = user.wishlist || []; const wishlist = list.includes(req.params.id) ? list.filter(id => id !== req.params.id) : [...list, req.params.id]; await users.updateOne({ id: req.user.id }, { $set: { wishlist } }); res.json({ wishlist }); });
app.post('/api/me/compare/:id', auth, async (req, res) => { const user = await users.findOne({ id: req.user.id }); let compare = user.compare || []; compare = compare.includes(req.params.id) ? compare.filter(id => id !== req.params.id) : [...compare, req.params.id].slice(-3); await users.updateOne({ id: req.user.id }, { $set: { compare } }); res.json({ compare }); });

app.get('/api/dashboard', auth, async (req, res) => { const mine = await properties.find({ sellerId: req.user.id }, { projection: { _id: 0 } }).toArray(); res.json({ stats: { activeListings: req.user.role === 'seller' ? (mine.length || 12) : 8, saves: 284, inquiries: 36, aiMatches: 14 }, listings: mine }); });
app.get('/api/messages', auth, async (req, res) => { const list = await messages.find({ participants: req.user.id }, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray(); res.json({ messages: list }); });
app.post('/api/messages', auth, async (req, res) => { const item = { id: uid(), senderId: req.user.id, participants: [req.user.id, req.body.recipientId].filter(Boolean), propertyId: req.body.propertyId, text: req.body.text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await messages.insertOne(item); res.json({ message: clean(item) }); });

app.post('/api/ai/assistant', async (req, res) => { const prompt = (req.body.prompt || '').toLowerCase(); const all = await properties.find({}, { projection: { _id: 0 } }).toArray(); const matches = all.filter(p => prompt.includes(p.city.split(',')[0].toLowerCase()) || prompt.includes(p.type.toLowerCase()) || p.price < (prompt.includes('million') ? 3000000 : 999999999)).slice(0, 3); const chosen = matches.length ? matches : all.slice(0, 3); const geminiReply = await askGemini(req.body.prompt || '', chosen); res.json({ reply: geminiReply || `I found ${chosen.length} strong matches. Based on your brief, I’d start with ${chosen[0].title} in ${chosen[0].city} — it scores ${chosen[0].aiScore}/100 for fit.`, properties: chosen, source: geminiReply ? 'gemini' : 'lumina-insights-fallback' }); });
app.post('/api/ai/analyze/:id', async (req, res) => { const p = await properties.findOne({ id: req.params.id }, { projection: { _id: 0 } }); if (!p) return res.status(404).json({ message: 'Property not found.' }); res.json({ analysis: { valueSignal: p.aiScore > 90 ? 'Exceptional' : 'Strong', estimatedRange: `$${Math.round(p.price * .96 / 1000) * 1000} – $${Math.round(p.price * 1.05 / 1000) * 1000}`, investmentScore: p.aiScore - 3, risks: ['Review HOA and insurance documents', 'Validate recent comparable sales'], insight: 'The location and amenity mix support resilient demand. The strongest upside is long-term rental flexibility.' } }); });

async function start() { await mongo.connect(); await seed(); app.listen(8002, '127.0.0.1', () => console.log('Lumina Express API listening on 8002')); }
start().catch(err => { console.error(err); process.exit(1); });