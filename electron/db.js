const bcrypt = require('bcryptjs')
const https = require('https')
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = require('./config')

function httpRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: { ...headers, 'Content-Length': body ? Buffer.byteLength(body) : 0 } }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        if (res.statusCode >= 400) { try { reject(new Error(JSON.parse(data).message)) } catch (e) { reject(new Error(data)) } return }
        try { resolve(data ? JSON.parse(data) : null) } catch (e) { resolve(null) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const H = { 'Content-Type': 'application/json', 'apikey': SUPABASE_SECRET_KEY, 'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`, 'Prefer': 'return=representation' }

async function rest(method, table, opts = {}) {
  const { filter, body, select, single } = opts
  let url = `${SUPABASE_URL}/rest/v1/${table}`
  const p = []
  if (select) p.push(`select=${select}`)
  if (filter) p.push(filter)
  if (single) p.push('limit=1')
  if (p.length) url += '?' + p.join('&')
  return httpRequest(method, url, { ...H, ...(single ? { 'Accept': 'application/vnd.pgrst.object+json' } : {}) }, body ? JSON.stringify(body) : null)
}

const GET = (t, o) => rest('GET', t, o)
const POST = (t, o) => rest('POST', t, o)
const PATCH = (t, o) => rest('PATCH', t, o)
const DELETE = (t, o) => rest('DELETE', t, o)

async function safe(fn) {
  try { return { ok: true, data: await fn() } }
  catch (e) { console.error(e.message); return { ok: false, err: e.message } }
}

async function initAdmin() {
  try { const u = await GET('users', { select: 'id', single: true }); if (u) return } catch (e) { }
  const hash = await bcrypt.hash('admin123', 10)
  await POST('users', { body: { username: 'admin', display_name: 'Yönetici', role: 'admin', password_hash: hash } })
}

async function login(username, password) {
  try {
    const d = await GET('users', { filter: `username=eq.${username.toLowerCase().trim()}`, single: true })
    if (!d) return { ok: false, err: 'Kullanıcı bulunamadı.' }
    const m = await bcrypt.compare(password, d.password_hash)
    if (!m) return { ok: false, err: 'Şifre hatalı.' }
    return { ok: true, user: { id: d.id, username: d.username, displayName: d.display_name, role: d.role } }
  } catch (e) { return { ok: false, err: 'Kullanıcı bulunamadı.' } }
}

async function register(username, displayName, password) {
  const u = username.toLowerCase().trim()
  if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, err: 'Kullanıcı adı: harf, rakam, _ kullanın.' }
  if (password.length < 4) return { ok: false, err: 'Şifre en az 4 karakter.' }
  try { await GET('users', { filter: `username=eq.${u}`, single: true }); return { ok: false, err: 'Bu kullanıcı adı zaten alınmış.' } } catch (e) { }
  const hash = await bcrypt.hash(password, 10)
  const data = await POST('users', { body: { username: u, display_name: displayName.trim(), role: 'user', password_hash: hash } })
  const user = Array.isArray(data) ? data[0] : data
  return { ok: true, user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } }
}

async function changePassword(uid, p) {
  if (p.length < 4) return { ok: false, err: 'Şifre en az 4 karakter.' }
  const hash = await bcrypt.hash(p, 10)
  return safe(() => PATCH('users', { filter: `id=eq.${uid}`, body: { password_hash: hash } }))
}

async function getUsers() {
  try { const d = await GET('users', { select: 'id,username,display_name,role,created_at', filter: 'order=created_at' }); return (d || []).map(u => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, createdAt: u.created_at })) } catch (e) { return [] }
}

async function addUser(data) {
  const u = data.username.toLowerCase().trim()
  try { await GET('users', { filter: `username=eq.${u}`, single: true }); return { ok: false, err: 'Bu kullanıcı adı zaten var.' } } catch (e) { }
  const hash = await bcrypt.hash(data.password, 10)
  return safe(() => POST('users', { body: { username: u, display_name: data.displayName, role: data.role || 'user', password_hash: hash } }))
}

async function deleteUser(uid) { return safe(() => DELETE('users', { filter: `id=eq.${uid}` })) }

async function loadData(uid) {
  try {
    const [k, s, sa, c] = await Promise.all([
      GET('kayitlar', { filter: `user_id=eq.${uid}&order=created_at.desc` }),
      GET('stok', { filter: `user_id=eq.${uid}&order=tarih.asc` }),
      GET('satis', { filter: `user_id=eq.${uid}&order=tarih.desc` }),
      GET('counters', { filter: `user_id=eq.${uid}`, single: true }).catch(() => null)
    ])
    return { kayitlar: (k || []).map(mapKayit), stok: (s || []).map(mapStok), satis: (sa || []).map(mapSatis), fisC: c?.fis_c || 1, satisC: c?.satis_c || 1 }
  } catch (e) { return { kayitlar: [], stok: [], satis: [], fisC: 1, satisC: 1 } }
}

async function saveKayit(uid, r) {
  return safe(async () => {
    const d = await POST('kayitlar', { body: { user_id: parseInt(uid), fis_no: r.fisNo, tarih: r.tarih, uretici_ad: r.ureticiAd, uretici_tc: r.ureticiTC || null, uretici_tel: r.ureticiTel, ilce: r.ilce, koy: r.koy, il: r.il || 'Mersin', ada_no: r.adaNo || null, parsel_no: r.parselNo || null, cinsler: r.cinsler || [], gelen_kg: r.gelenKg, cekim_tipi: r.cekimTipi, cikan_yag: r.cikanYag || null, randiman: r.randiman || null, hak_oran: r.hakOran || null, hak_yag: r.hakYag || null, musteri_yag: r.musteriYag || null, birim_fiyat: r.birimFiyat || null, toplam_ucret: r.toplamUcret || null, odenen_tutar: r.odenenTutar || null, kalan_tutar: r.kalanTutar || null, odeme_sekli: r.odemeSekli || null, durum: r.durum || 'beklemede', notlar: r.notlar || null, hash: r.hash || null } })
    return Array.isArray(d) ? d[0] : d
  })
}

async function updateKayitDurum(id, durum) { return safe(() => PATCH('kayitlar', { filter: `id=eq.${id}`, body: { durum } })) }

async function saveStok(uid, s) {
  return safe(async () => {
    const d = await POST('stok', { body: { user_id: parseInt(uid), tarih: s.tarih, kaynak: s.kaynak, aciklama: s.aciklama, giris: s.giris || 0, cikis: s.cikis || 0, tur: s.tur || null, maliyet: s.maliyet || null, tedarikci: s.tedarikci || null } })
    return Array.isArray(d) ? d[0] : d
  })
}

async function saveSatis(uid, s) {
  return safe(async () => {
    const d = await POST('satis', { body: { user_id: parseInt(uid), satis_no: s.satisNo, tarih: s.tarih, musteri: s.musteri, tel: s.tel || null, tc: s.tc || null, tur: s.tur, miktar: s.miktar, birim_fiyat: s.birimFiyat, toplam: s.toplam, odenen: s.odenen, kalan: s.kalan, odeme_sekli: s.odemeSekli, ambalaj: s.ambalaj, notlar: s.notlar || null } })
    return Array.isArray(d) ? d[0] : d
  })
}

async function saveCounters(uid, fisC, satisC) {
  return safe(() => httpRequest('POST', `${SUPABASE_URL}/rest/v1/counters`, { ...H, 'Prefer': 'return=minimal,resolution=merge-duplicates' }, JSON.stringify({ user_id: parseInt(uid), fis_c: fisC, satis_c: satisC })))
}

function mapKayit(r) { return { id: r.id, fisNo: r.fis_no, tarih: r.tarih, ureticiAd: r.uretici_ad, ureticiTC: r.uretici_tc, ureticiTel: r.uretici_tel, ilce: r.ilce, koy: r.koy, il: r.il, adaNo: r.ada_no, parselNo: r.parsel_no, cinsler: r.cinsler || [], gelenKg: parseFloat(r.gelen_kg || 0), cekimTipi: r.cekim_tipi, cikanYag: r.cikan_yag ? parseFloat(r.cikan_yag) : null, randiman: r.randiman ? parseFloat(r.randiman) : null, hakOran: r.hak_oran ? parseFloat(r.hak_oran) : null, hakYag: r.hak_yag ? parseFloat(r.hak_yag) : null, musteriYag: r.musteri_yag ? parseFloat(r.musteri_yag) : null, birimFiyat: r.birim_fiyat ? parseFloat(r.birim_fiyat) : null, toplamUcret: r.toplam_ucret ? parseFloat(r.toplam_ucret) : null, odenenTutar: r.odenen_tutar ? parseFloat(r.odenen_tutar) : null, kalanTutar: r.kalan_tutar ? parseFloat(r.kalan_tutar) : null, odemeSekli: r.odeme_sekli, durum: r.durum, notlar: r.notlar, hash: r.hash } }
function mapStok(r) { return { id: r.id, tarih: r.tarih, kaynak: r.kaynak, aciklama: r.aciklama, giris: parseFloat(r.giris || 0), cikis: parseFloat(r.cikis || 0), tur: r.tur, maliyet: r.maliyet ? parseFloat(r.maliyet) : null, tedarikci: r.tedarikci } }
function mapSatis(r) { return { id: r.id, satisNo: r.satis_no, tarih: r.tarih, musteri: r.musteri, tel: r.tel, tc: r.tc, tur: r.tur, miktar: parseFloat(r.miktar || 0), birimFiyat: parseFloat(r.birim_fiyat || 0), toplam: parseFloat(r.toplam || 0), odenen: parseFloat(r.odenen || 0), kalan: parseFloat(r.kalan || 0), odemeSekli: r.odeme_sekli, ambalaj: r.ambalaj, notlar: r.notlar } }

module.exports = { initAdmin, login, register, changePassword, getUsers, addUser, deleteUser, loadData, saveKayit, updateKayitDurum, saveStok, saveSatis, saveCounters }