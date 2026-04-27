/* ═══════════════════════════════════════════
   AIMAX Restaurant Dashboard — scrip.js
   v2.0 — Con Ventas, Clientes, Horas
═══════════════════════════════════════════ */

const CONFIG = {
  supabaseUrl: localStorage.getItem('aimax_sb_url') || '',
  supabaseKey: localStorage.getItem('aimax_sb_key') || '',
  supabaseTable: localStorage.getItem('aimax_sb_table') || 'pedidos',
  password: localStorage.getItem('aimax_password') || 'AIMAX',
  restaurantName: localStorage.getItem('aimax_name') || 'Mi Restaurante',
  refreshInterval: 15000,
};

let allOrders    = [];
let currentFilter = 'day';
let refreshTimer  = null;
let isLoggedIn    = false;

// Estado de filtros por sección
let ventasProductoPeriodo = 'day';
let horasPeriodo = 'day';

/* ── AUTH ── */
function handleLogin() {
  const input = document.getElementById('passwordInput').value;
  const error = document.getElementById('loginError');
  if (input === CONFIG.password) {
    error.style.display = 'none';
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    isLoggedIn = true;
    initApp();
  } else {
    error.style.display = 'block';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'shake 0.3s ease';
  }
}

function handleLogout() {
  isLoggedIn = false;
  clearInterval(refreshTimer);
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('passwordInput').value = '';
}

/* ── INIT ── */
function initApp() {
  updateClock();
  setInterval(updateClock, 1000);
  const sbUrl   = localStorage.getItem('aimax_sb_url');
  const sbKey   = localStorage.getItem('aimax_sb_key');
  const sbTable = localStorage.getItem('aimax_sb_table');
  if (sbUrl)   { document.getElementById('supabaseUrlInput').value   = sbUrl;   CONFIG.supabaseUrl   = sbUrl; }
  if (sbKey)   { document.getElementById('supabaseKeyInput').value   = sbKey;   CONFIG.supabaseKey   = sbKey; }
  if (sbTable) { document.getElementById('supabaseTableInput').value = sbTable; CONFIG.supabaseTable = sbTable; }
  const savedName = localStorage.getItem('aimax_name');
  if (savedName) document.getElementById('restaurantNameInput').value = savedName;
  loadTicketSizeUI();
  fetchOrders();
  refreshTimer = setInterval(fetchOrders, CONFIG.refreshInterval);
}

/* ── CLOCK ── */
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  const s = String(now.getSeconds()).padStart(2,'0');
  document.getElementById('topbarTime').textContent = `${h}:${m}:${s}`;
}

/* ── FETCH SUPABASE ── */
async function fetchOrders() {
  const btn = document.querySelector('.btn-refresh');
  if (btn) btn.classList.add('spinning');
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    useDemoData();
    if (btn) btn.classList.remove('spinning');
    return;
  }
  try {
    const table = CONFIG.supabaseTable || 'pedidos';
    const url = `${CONFIG.supabaseUrl}/rest/v1/${table}?select=*&order="Fecha".desc&limit=5000`;
    const res   = await fetch(url, {
      headers: {
        'apikey':        CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`,
        'Content-Type':  'application/json'
      }
    });
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    const rows = await res.json();
    allOrders = rows.map((row, idx) => parseSupabaseRow(row, idx));
    renderOrders(); updateMetrics(); updateRevenueStrip(); updateLastSync(); setSyncOk();
  } catch (err) {
    console.warn('Error Supabase:', err);
    setSyncError();
    if (allOrders.length === 0) useDemoData();
  }
  if (btn) btn.classList.remove('spinning');
}

function parseSupabaseRow(row, idx) {
  const fechaRaw = row.Fecha || row.fecha || '';
  const cliente  = row.Nombre   || row.cliente  || 'Cliente sin nombre';
  const telefono = row.Telefono || row.telefono || '';
  const pedido   = row.Platos   || row.pedido   || '';
  const entregaRaw = row.Entrega || row.entrega || '';
const entrega = entregaRaw.toLowerCase() === 'comer' ? 'Comer en el local'
              : entregaRaw.toLowerCase() === 'local' ? 'Recoger en el local'
              : entregaRaw;
  const direccion= row.Direccion|| row.direccion|| '';
  const pago     = row.Pago     || row.pago     || '';
  const total    = row.Total    || row.total    || '';
  const extras   = row.Extras    || row.extras    || '';
  const efectivo = row.Efectivo || row.efectivo || '';
  let hora = row.hora || '';
  const horaMatch = fechaRaw.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (horaMatch && !hora) hora = horaMatch[1];
  const fecha = fechaRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?/, '').trim();
  const dateObj = parseDate(fechaRaw, hora);
  return { id: `order-${row.id || idx+1}`, index: row.id || idx+1, fecha, hora, cliente, telefono, pedido, entrega, direccion, pago, total, extras, efectivo, dateObj, items: parseItems(pedido) };
}

function parseRow(row, idx) {
  const c = CONFIG.cols;
  const cells = row.c;
  const getVal = (i) => { if (!cells || !cells[i] || cells[i].v === null) return ''; return String(cells[i].f || cells[i].v).trim(); };
  const fecha    = getVal(c.fecha);
  const cliente  = getVal(c.cliente) || 'Cliente sin nombre';
  const telefono = getVal(c.telefono);
  const pedido   = getVal(c.pedido);
  const entrega  = getVal(c.entrega);
  const direccion= getVal(c.direccion);
  const pago     = getVal(c.pago);
  const total    = getVal(c.total);
  let hora = '';
  const horaMatch = fecha.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (horaMatch) hora = horaMatch[1];
  const dateObj = parseDate(fecha, hora);
  return { id: `order-${idx+1}`, index: idx+1, fecha, hora, cliente, telefono, pedido, entrega, direccion, pago, total, dateObj, items: parseItems(pedido) };
}

function parseDate(fecha, hora) {
  if (!fecha) return new Date();
  const partes = fecha.trim().split(' ');
  const fechaParte = partes[0];
  const horaParte  = (partes[1] || hora || '00:00:00')
                     .split(':').map(p => p.padStart(2,'0')).join(':');
  const f = fechaParte.split('/');
  if (f.length === 3) {
    const dia  = f[0].padStart(2,'0');
    const mes  = f[1].padStart(2,'0');
    const anio = f[2].padStart(4,'0');
    const time = horaParte.split(':').length === 2 
                 ? horaParte + ':00' : horaParte;
    const d = new Date(`${anio}-${mes}-${dia}T${time}`);
    if (!isNaN(d)) return d;
  }
  return new Date(0);
}

function parseItems(pedido) {
  if (!pedido) return [];
  return pedido.split(/[•\n,]/).map(s => s.trim().replace(/^[•\-\*]+\s*/, '')).filter(Boolean);
}

/* ── PARSEAR TOTAL A NÚMERO ── */
function parseTotal(totalStr) {
  if (!totalStr) return 0;
  const clean = String(totalStr).replace(/[^0-9]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function formatMoney(num) {
  if (num >= 1000000) return '$' + (num/1000000).toFixed(1) + 'M';
  if (num >= 1000) return '$' + Math.round(num).toLocaleString('es-CO');
  return '$' + Math.round(num);
}

/* ── DEMO DATA ── */
function useDemoData() {
  const now = new Date();
  const fmt  = (d) => `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  const fmtT = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const demos = [
    { cliente: 'María García',   telefono: '3001234567', pedido: '2x Hamburguesa Clásica, 1x Papas Grandes, 2x Coca Cola', entrega: 'Domicilio',  direccion: 'Calle 45 #12-30', pago: 'Bancolombia', total: '$85.000'  },
    { cliente: 'Juan Rodríguez', telefono: '3109876543', pedido: '1x Pizza Pepperoni, 1x Ensalada César',                   entrega: 'Local',      direccion: '',               pago: 'Efectivo',    total: '$52.000'  },
    { cliente: 'Ana López',      telefono: '3205556677', pedido: '3x Alitas BBQ, 1x Cerveza',                               entrega: 'Domicilio',  direccion: 'Carrera 8 #22-10',pago: 'Nequi',      total: '$43.000'  },
    { cliente: 'Carlos Mendez',  telefono: '3114443322', pedido: '1x Combo Familiar, 4x Refresco',                          entrega: 'Local',      direccion: '',               pago: 'Efectivo',    total: '$120.000' },
    { cliente: 'Laura Sánchez',  telefono: '3187776655', pedido: '2x Taco de Res, 1x Burrito, 1x Agua',                    entrega: 'Domicilio',  direccion: 'Av. 30 #5-20',   pago: 'Daviplata',   total: '$31.000'  },
    { cliente: 'Roberto Kim',    telefono: '3002221133', pedido: '1x Hamburguesa BBQ Doble, 1x Papas Gajo, 1x Limonada',   entrega: 'Local',      direccion: '',               pago: 'Bancolombia', total: '$49.000'  },
    { cliente: 'María García',   telefono: '3001234567', pedido: '1x Hamburguesa Clásica, 1x Coca Cola',                   entrega: 'Domicilio',  direccion: 'Calle 45 #12-30', pago: 'Bancolombia', total: '$38.000'  },
    { cliente: 'Juan Rodríguez', telefono: '3109876543', pedido: '2x Pizza Pepperoni, 2x Cerveza',                          entrega: 'Local',      direccion: '',               pago: 'Efectivo',    total: '$78.000'  },
    { cliente: 'Sofía Torres',   telefono: '3156789012', pedido: '1x Ensalada César, 1x Jugo Natural, 1x Brownie',          entrega: 'Local',      direccion: '',               pago: 'Tarjeta',     total: '$42.000'  },
    { cliente: 'Pedro Vargas',   telefono: '3223334455', pedido: '2x Hamburguesa Clásica, 2x Papas Grandes',               entrega: 'Domicilio',  direccion: 'Carrera 15 #80-20',pago:'Nequi',       total: '$64.000'  },
    { cliente: 'María García',   telefono: '3001234567', pedido: '3x Alitas BBQ, 2x Refresco',                             entrega: 'Domicilio',  direccion: 'Calle 45 #12-30', pago: 'Bancolombia', total: '$55.000'  },
    { cliente: 'Carlos Mendez',  telefono: '3114443322', pedido: '1x Combo Familiar, 2x Refresco, 1x Postre',              entrega: 'Local',      direccion: '',               pago: 'Efectivo',    total: '$135.000' },
  ];

  const daysBack = [0, 0, 0, 0, 1, 1, 2, 3, 5, 7, 14, 30];
  const hours    = [12, 13, 19, 20, 11, 21, 14, 18, 12, 20, 13, 19];

  allOrders = demos.map((d, i) => {
    const dateObj = new Date(now);
    dateObj.setDate(dateObj.getDate() - daysBack[i]);
    dateObj.setHours(hours[i], Math.floor(Math.random()*60), 0, 0);
    return { id: `order-${i+1}`, index: i+1, fecha: fmt(dateObj), hora: fmtT(dateObj), cliente: d.cliente, telefono: d.telefono, pedido: d.pedido, entrega: d.entrega, direccion: d.direccion, pago: d.pago, total: d.total, dateObj, items: parseItems(d.pedido) };
  });
  renderOrders(); updateMetrics(); updateRevenueStrip(); updateLastSync(); setSyncOk();
  if (!window._demoWarned) { window._demoWarned = true; console.info('AIMAX: Usando datos de demostración.'); }
}

/* ── FILTERS ── */
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

function filterOrders(orders, period) {
  const p = period || currentFilter;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case 'day':   return orders.filter(o => o.dateObj >= today);
    case 'yesterday': {
  const ayer = new Date(today);
  ayer.setDate(today.getDate() - 1);
  return orders.filter(o => o.dateObj >= ayer && o.dateObj < today);
}
    case 'week':  { const ws = new Date(today); ws.setDate(today.getDate() - today.getDay()); return orders.filter(o => o.dateObj >= ws); }
    case 'month': return orders.filter(o => o.dateObj >= new Date(now.getFullYear(), now.getMonth(), 1));
    case 'year':  return orders.filter(o => o.dateObj >= new Date(now.getFullYear(), 0, 1));
    default:      return orders;
  }
}

/* ── REVENUE STRIP (cuadrito de dinero en página principal) ── */
function updateRevenueStrip() {
  const periods = ['day','week','month','year'];
  const ids     = ['revToday','revWeek','revMonth','revYear'];
  periods.forEach((p, i) => {
    const orders = filterOrders(allOrders, p);
    const total = orders.reduce((acc, o) => acc + parseTotal(o.total), 0);
    const el = document.getElementById(ids[i]);
    if (el) el.textContent = formatMoney(total);
  });
}

/* ── RENDER ORDERS ── */
function renderOrders() {
  const grid = document.getElementById('ordersGrid');
  const filtered = filterOrders(allOrders);
  document.getElementById('ordersCount').textContent = `${filtered.length} pedido${filtered.length !== 1 ? 's' : ''}`;
  if (filtered.length === 0) { grid.innerHTML = ''; const div = document.createElement('div'); div.className = 'empty-state'; div.innerHTML = '<div class="empty-icon">📋</div><p>No hay pedidos en este período</p>'; grid.appendChild(div); return; }
  const sorted = [...filtered].sort((a, b) => b.dateObj - a.dateObj);
  grid.innerHTML = sorted.map(order => createOrderCard(order)).join('');
}

function createOrderCard(order) {
  const itemsHtml = order.items.length > 0
    ? order.items.map(item => `<div class="order-item-line">• ${escHtml(item)}</div>`).join('')
    : `<div class="order-item-line">${escHtml(order.pedido || '—')}</div>`;

  const entregaBadge = order.entrega
    ? `<span class="entrega-badge ${order.entrega.toLowerCase().includes('dom') ? 'badge-dom' : 'badge-local'}">${escHtml(order.entrega)}</span>`
    : '';

  const printData = encodeURIComponent(JSON.stringify({
    id: order.id, index: order.index, cliente: order.cliente,
    telefono: order.telefono, fecha: order.fecha, hora: order.hora,
    pedido: order.pedido, items: order.items, entrega: order.entrega,
    direccion: order.direccion, pago: order.pago, extras: order.extras, total: order.total, efectivo: order.efectivo
  }));

  return `
    <div class="order-card" id="${order.id}">
      <div class="order-card-header">
        <div>
          <div class="order-number">#${String(order.index).padStart(3,'0')} ${entregaBadge}</div>
          <div class="order-client">${escHtml(order.cliente)}</div>
          ${order.telefono ? `<div class="order-meta">📞 ${escHtml(order.telefono)}</div>` : ''}
        </div>
        <div class="order-time">${escHtml(order.hora)}</div>
      </div>
      <div class="order-divider"></div>
      <div class="order-items">${itemsHtml}</div>
      ${order.direccion ? `<div class="order-meta-row"><span class="order-meta-label">📍 Dirección</span><span class="order-meta-val">${escHtml(order.direccion)}</span></div>` : ''}
      ${order.pago     ? `<div class="order-meta-row"><span class="order-meta-label">💳 Pago</span><span class="order-meta-val">${escHtml(order.pago)}</span></div>` : ''}
      ${order.total    ? `<div class="order-total"><span class="order-total-label">TOTAL</span><span class="order-total-value">${escHtml(order.total)}</span></div>` : ''}
      <button class="btn-print" onclick="printOrder('${printData}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir
      </button>
    </div>`;
}

/* ── METRICS ── */
function updateMetrics() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const todayOrders = allOrders.filter(o => o.dateObj >= today);
  const monthOrders = allOrders.filter(o => o.dateObj >= monthStart);
  const weekOrders  = allOrders.filter(o => o.dateObj >= weekStart);
  const yearOrders  = allOrders.filter(o => o.dateObj >= yearStart);
  document.getElementById('metricToday').textContent = todayOrders.length;
  document.getElementById('metricMonth').textContent = monthOrders.length;
  document.getElementById('metricTop').textContent = getTopProduct(allOrders) || '—';
  document.getElementById('m2Today').textContent = todayOrders.length;
  document.getElementById('m2Week').textContent  = weekOrders.length;
  document.getElementById('m2Month').textContent = monthOrders.length;
  document.getElementById('m2Year').textContent  = yearOrders.length;
  renderTopProducts(allOrders);
}

function getTopProduct(orders) {
  const freq = {};
  orders.forEach(o => o.items.forEach(item => {
  const m1 = item.match(/^(\d+)\s*[×x]\s*(.+)/i);        // nuevo: "1 × Nombre"
  const m2 = item.match(/^(.+?)\s*[×x]\s*(\d+)$/i);      // viejo: "Nombre ×1"
  const qty = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[2]) : 1;
  const clean = m1 ? m1[2].replace(/\s*—.*$/, '').trim() : m2 ? m2[1].replace(/^[•\s]+/, '').trim() : item.replace(/^[•\s]+/, '').trim();
  if (clean) freq[clean] = (freq[clean] || 0) + qty;
}));
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]);
  return sorted.length ? sorted[0][0] : null;
}

function renderTopProducts(orders) {
  const freq = {};
  orders.forEach(o => o.items.forEach(item => {
  const m1 = item.match(/^(\d+)\s*[×x]\s*(.+)/i);        // nuevo: "1 × Nombre"
  const m2 = item.match(/^(.+?)\s*[×x]\s*(\d+)$/i);      // viejo: "Nombre ×1"
  const qty = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[2]) : 1;
  const clean = m1 ? m1[2].replace(/\s*—.*$/, '').trim() : m2 ? m2[1].replace(/^[•\s]+/, '').trim() : item.replace(/^[•\s]+/, '').trim();
  if (clean) freq[clean] = (freq[clean] || 0) + qty;
}));
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const maxVal = sorted.length ? sorted[0][1] : 1;
  const list = document.getElementById('topProductsList');
  if (!sorted.length) { list.innerHTML = '<p style="color:#555;font-size:13px">Sin datos suficientes</p>'; return; }
  list.innerHTML = sorted.map(([name, count], i) => `
    <div class="tpl-item">
      <span class="tpl-rank">#${i+1}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span class="tpl-name">${escHtml(name)}</span>
          <span class="tpl-count">${count}x</span>
        </div>
        <div class="tpl-bar" style="width:${Math.round(count/maxVal*100)}%"></div>
      </div>
    </div>`).join('');
}

/* ════════════════════════════════════════
   SECCIÓN VENTAS
════════════════════════════════════════ */
function renderVentas() {
  if (!allOrders.length) return;

  // Leer el filtro seleccionado
  const filtro = document.getElementById('ventasMesFilter')?.value || 'all';
  const base = filterOrders(allOrders, filtro === 'all' ? undefined : filtro);

  // Tarjetas resumen de dinero — siempre muestran el período seleccionado
  const periods = ['day','week','month','year'];
  const ids     = ['vToday','vWeek','vMonth','vYear'];
  periods.forEach((p, i) => {
    const orders = filterOrders(allOrders, p);
    const total  = orders.reduce((acc, o) => acc + parseTotal(o.total), 0);
    const el = document.getElementById(ids[i]);
    if (el) el.textContent = formatMoney(total);
  });

  // Local vs Domicilio vs Comer — filtrados por período seleccionado
  const localOrders   = base.filter(o => o.entrega && o.entrega.toLowerCase().includes('recoger'));
const domOrders     = base.filter(o => o.entrega && o.entrega.toLowerCase().includes('domicilio'));
const recogerOrders = base.filter(o => o.entrega && o.entrega.toLowerCase().includes('comer'));
  const localTotal    = localOrders.reduce((a, o) => a + parseTotal(o.total), 0);
  const domTotal      = domOrders.reduce((a, o) => a + parseTotal(o.total), 0);
  const recogerTotal  = recogerOrders.reduce((a, o) => a + parseTotal(o.total), 0);
  document.getElementById('vLocal').textContent = formatMoney(localTotal);
  document.getElementById('vLocalCount').textContent = localOrders.length;
  document.getElementById('vDom').textContent   = formatMoney(domTotal);
  document.getElementById('vDomCount').textContent   = domOrders.length;
  if (document.getElementById('vRecoger')) {
    document.getElementById('vRecoger').textContent = formatMoney(recogerTotal);
    document.getElementById('vRecogerCount').textContent = recogerOrders.length;
  }

  // Ventas por producto
  renderVentasProducto();

  // Mes a mes
  renderMesAMes();
}

function setVentasProductoPeriodo(period, btn) {
  ventasProductoPeriodo = period;
  document.querySelectorAll('#section-ventas .filter-tabs .filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderVentasProducto();
}

function renderVentasProducto() {
  const orders = filterOrders(allOrders, ventasProductoPeriodo);
  const freq = {};
  orders.forEach(o => {
    o.items.forEach(item => {
      // DESPUÉS
const m1 = item.match(/^(\d+)\s*[×x]\s*(.+)/i);   // "1 × Nombre"
const m2 = item.match(/^(.+?)\s*[×x]\s*(\d+)$/i);  // "Nombre × 1"
const qty  = m1 ? parseInt(m1[1]) : m2 ? parseInt(m2[2]) : 1;
const name = m1 ? m1[2].replace(/\s*—.*$/, '').trim()
           : m2 ? m2[1].trim()
           : item.replace(/\s*—.*$/, '').trim();
      if (name) freq[name] = (freq[name] || 0) + qty;
    });
  });
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10);
  const maxVal = sorted.length ? sorted[0][1] : 1;
  const list = document.getElementById('ventasProductoList');
  if (!sorted.length) { list.innerHTML = '<p style="color:#555;font-size:13px">Sin datos en este período</p>'; return; }
  list.innerHTML = sorted.map(([name, count], i) => `
    <div class="tpl-item">
      <span class="tpl-rank">#${i+1}</span>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span class="tpl-name">${escHtml(name)}</span>
          <span class="tpl-count">${count} und.</span>
        </div>
        <div class="tpl-bar" style="width:${Math.round(count/maxVal*100)}%"></div>
      </div>
    </div>`).join('');
}

function renderMesAMes() {
  // Agrupar ventas por mes
  const meses = {};
  allOrders.forEach(o => {
    const key = `${o.dateObj.getFullYear()}-${String(o.dateObj.getMonth()+1).padStart(2,'0')}`;
    meses[key] = (meses[key] || 0) + parseTotal(o.total);
  });
  const sorted = Object.entries(meses).sort((a,b) => a[0].localeCompare(b[0])).slice(-12);
  if (!sorted.length) { document.getElementById('mesAMesChart').innerHTML = '<p style="color:#555;font-size:13px">Sin datos</p>'; return; }
  const maxVal = Math.max(...sorted.map(([,v]) => v));
  const nomMeses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('mesAMesChart').innerHTML = `
    <div class="bar-chart">
      ${sorted.map(([key, val]) => {
        const [yr, mo] = key.split('-');
        const label = nomMeses[parseInt(mo)-1] + ' ' + yr.slice(2);
        const pct = maxVal > 0 ? Math.round(val/maxVal*100) : 0;
        return `<div class="bar-item">
          <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%" title="${formatMoney(val)}"></div></div>
          <div class="bar-value">${formatMoney(val)}</div>
          <div class="bar-label">${label}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function exportVentasExcel() {
  const headers = ['Mes','Total Ventas','Pedidos','Ticket Promedio'];
  const meses = {};
  const counts = {};
  allOrders.forEach(o => {
    const key = `${o.dateObj.getFullYear()}-${String(o.dateObj.getMonth()+1).padStart(2,'0')}`;
    meses[key]  = (meses[key]  || 0) + parseTotal(o.total);
    counts[key] = (counts[key] || 0) + 1;
  });
  const rows = Object.entries(meses).sort((a,b) => a[0].localeCompare(b[0])).map(([key, total]) => {
    const count = counts[key];
    const prom  = count > 0 ? Math.round(total/count) : 0;
    return [key, Math.round(total), count, prom].map(v => `"${v}"`).join(';');
  });
  const BOM = '\uFEFF';
  const csv = BOM + headers.join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `AIMAX_Ventas_MesAMes.csv` });
  a.click();
  showMsg('Excel de ventas descargado ✓', 'green');
}

/* ════════════════════════════════════════
   SECCIÓN CLIENTES
════════════════════════════════════════ */
function renderClientes() {
  if (!allOrders.length) return;
  const busqueda = (document.getElementById('clienteSearch')?.value || '').toLowerCase().trim();

  // Agrupar por cliente
  const clientes = {};
  allOrders.forEach(o => {
    const key = o.cliente.trim().toLowerCase();
    if (!clientes[key]) {
      clientes[key] = { nombre: o.cliente, pedidos: [], telefono: o.telefono, productos: {} };
    }
    clientes[key].pedidos.push(o);
    o.items.forEach(item => {
      const name = item.replace(/^(.+?)\s*[×x]\s*\d+$/i, '$1').replace(/^\d+[x×]\s*/i,'').trim();
      if (name) clientes[key].productos[name] = (clientes[key].productos[name] || 0) + 1;
    });
  });

  const lista = Object.values(clientes);
  const unicos    = lista.length;
  const frecuentes = lista.filter(c => c.pedidos.length >= 2).length;

  // Ticket promedio global
  const totalDinero = allOrders.reduce((a, o) => a + parseTotal(o.total), 0);
  const ticketProm  = allOrders.length > 0 ? totalDinero / allOrders.length : 0;

  // Frecuencia promedio (días entre primera y última compra / número de compras)
  let frecSuma = 0, frecCount = 0;
  lista.forEach(c => {
    if (c.pedidos.length >= 2) {
      const sorted = c.pedidos.map(p => p.dateObj.getTime()).sort((a,b) => a-b);
      const dias   = (sorted[sorted.length-1] - sorted[0]) / (1000*60*60*24);
      const freq   = dias / (c.pedidos.length - 1);
      if (freq > 0) { frecSuma += freq; frecCount++; }
    }
  });
  const frecProm = frecCount > 0 ? Math.round(frecSuma / frecCount) : null;

  document.getElementById('cUnicos').textContent    = unicos;
  document.getElementById('cFrecuentes').textContent= frecuentes;
  document.getElementById('cTicketProm').textContent = formatMoney(ticketProm);
  document.getElementById('cFrecProm').textContent  = frecProm !== null ? frecProm + 'd' : '—';

  // Tabla de clientes
  let filtrados = lista;
  if (busqueda) filtrados = lista.filter(c => c.nombre.toLowerCase().includes(busqueda));
  filtrados.sort((a,b) => b.pedidos.length - a.pedidos.length);

  const container = document.getElementById('clientesTable');
  if (!filtrados.length) { container.innerHTML = '<p style="color:#555;font-size:13px">Sin resultados</p>'; return; }

  container.innerHTML = filtrados.map(c => {
    const pedidos   = c.pedidos.sort((a,b) => a.dateObj - b.dateObj);
    const totalGast = c.pedidos.reduce((a, o) => a + parseTotal(o.total), 0);
    const ticketC   = c.pedidos.length > 0 ? totalGast / c.pedidos.length : 0;
    const topProds  = Object.entries(c.productos).sort((a,b) => b[1]-a[1]).slice(0,3).map(([n,q]) => `${n} (${q}x)`).join(', ');
    let frecDias    = '—';
    if (pedidos.length >= 2) {
      const dias = (pedidos[pedidos.length-1].dateObj - pedidos[0].dateObj) / (1000*60*60*24);
      frecDias = Math.round(dias / (pedidos.length - 1)) + 'd';
    }
    const ultimaCompra = pedidos.length > 0 ? pedidos[pedidos.length-1].fecha : '—';
    return `<div class="cliente-row">
      <div class="cliente-header">
        <div>
          <span class="cliente-nombre">${escHtml(c.nombre)}</span>
          ${c.telefono ? `<span class="cliente-tel">📞 ${escHtml(c.telefono)}</span>` : ''}
        </div>
        <div style="text-align:right">
          <div class="cliente-stat-val">${formatMoney(totalGast)}</div>
          <div class="cliente-stat-lab">total gastado</div>
        </div>
      </div>
      <div class="cliente-stats">
        <div class="cliente-stat"><span class="cliente-stat-val">${c.pedidos.length}</span><span class="cliente-stat-lab">pedidos</span></div>
        <div class="cliente-stat"><span class="cliente-stat-val">${formatMoney(ticketC)}</span><span class="cliente-stat-lab">ticket prom.</span></div>
        <div class="cliente-stat"><span class="cliente-stat-val">${frecDias}</span><span class="cliente-stat-lab">entre compras</span></div>
        <div class="cliente-stat"><span class="cliente-stat-val">${ultimaCompra}</span><span class="cliente-stat-lab">última compra</span></div>
      </div>
      ${topProds ? `<div class="cliente-prods">🔁 Repite: ${escHtml(topProds)}</div>` : ''}
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   SECCIÓN HORAS
════════════════════════════════════════ */
function setHorasPeriodo(period, btn) {
  horasPeriodo = period;
  document.querySelectorAll('#section-horas .filter-tabs .filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHoras();
}

function renderHoras() {
  renderPedidosPorHora();
  renderHorasDia();
  renderRangoHorario();
}

function renderPedidosPorHora() {
  const orders = filterOrders(allOrders, horasPeriodo);
  const byHour = Array(24).fill(0);
  orders.forEach(o => {
    const h = o.dateObj.getHours();
    byHour[h]++;
  });
  const maxVal = Math.max(...byHour, 1);
  const chart  = document.getElementById('horasChart');
  chart.innerHTML = `<div class="horas-bar-chart">
    ${byHour.map((count, h) => {
      const pct = Math.round(count / maxVal * 100);
      const label = `${String(h).padStart(2,'0')}:00`;
      return `<div class="hora-bar-item ${count === Math.max(...byHour) ? 'hora-peak' : ''}">
        <div class="hora-bar-wrap"><div class="hora-bar-fill" style="height:${pct}%" title="${count} pedidos a las ${label}"></div></div>
        <div class="hora-bar-count">${count > 0 ? count : ''}</div>
        <div class="hora-bar-label">${h % 2 === 0 ? label : ''}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderHorasDia() {
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  // Matriz [hora][dia]
  const matriz = Array.from({length:24}, () => Array(7).fill(0));
  allOrders.forEach(o => {
    const h = o.dateObj.getHours();
    const d = o.dateObj.getDay();
    matriz[h][d]++;
  });
  const maxVal = Math.max(...matriz.flat(), 1);

  const container = document.getElementById('horasDiaChart');
  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="horas-tabla">
        <thead>
          <tr>
            <th>Hora</th>
            ${dias.map(d => `<th>${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${matriz.map((row, h) => {
            const rowTotal = row.reduce((a,b) => a+b, 0);
            if (rowTotal === 0) return '';
            return `<tr>
              <td class="horas-tabla-hora">${String(h).padStart(2,'0')}:00</td>
              ${row.map(v => {
                const intensity = v > 0 ? Math.round(v/maxVal*100) : 0;
                return `<td class="horas-cell ${intensity > 60 ? 'hot' : intensity > 30 ? 'warm' : intensity > 0 ? 'cool' : ''}" title="${v} pedidos">${v > 0 ? v : ''}</td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderRangoHorario() {
  const desde   = document.getElementById('rangoDesde')?.value || '00:00';
  const hasta   = document.getElementById('rangoHasta')?.value || '23:59';
  const periodo = document.getElementById('rangoPeriodo')?.value || 'all';
  const [hD, mD] = desde.split(':').map(Number);
  const [hH, mH] = hasta.split(':').map(Number);

  const orders = filterOrders(allOrders, periodo).filter(o => {
    const h = o.dateObj.getHours();
    const m = o.dateObj.getMinutes();
    const mins = h * 60 + m;
    return mins >= hD * 60 + mD && mins <= hH * 60 + mH;
  });

  const total = orders.reduce((a, o) => a + parseTotal(o.total), 0);
  const elP = document.getElementById('rangoPedidos');
  const elV = document.getElementById('rangoVentas');
  if (elP) elP.textContent = orders.length;
  if (elV) elV.textContent = formatMoney(total);
}

/* ── TICKET SIZE CONFIG ── */
function selectTicketSize(el) {
  document.querySelectorAll('.ticket-size-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('ticketWidthInput').value = el.dataset.width;
  document.getElementById('ticketFontInput').value  = el.dataset.font;
}

function saveTicketSize() {
  const w = parseInt(document.getElementById('ticketWidthInput').value);
  const f = parseInt(document.getElementById('ticketFontInput').value);
  const msg = document.getElementById('ticketSizeMsg');
  if (!w || w < 150 || w > 600) { msg.style.color='#e05252'; msg.textContent='Ancho inválido (150–600px).'; return; }
  if (!f || f < 8  || f > 20)  { msg.style.color='#e05252'; msg.textContent='Fuente inválida (8–20px).'; return; }
  localStorage.setItem('aimax_ticket_width', w);
  localStorage.setItem('aimax_ticket_font',  f);
  msg.style.color='#52c07a';
  msg.textContent='Configuración guardada ✓';
}

function loadTicketSizeUI() {
  const w = localStorage.getItem('aimax_ticket_width');
  const f = localStorage.getItem('aimax_ticket_font');
  if (w) document.getElementById('ticketWidthInput').value = w;
  if (f) document.getElementById('ticketFontInput').value  = f;
  if (w && f) {
    document.querySelectorAll('.ticket-size-option').forEach(o => {
      if (o.dataset.width === w && o.dataset.font === f) o.classList.add('selected');
    });
  }
}

/* ── PRINT MODAL ── */
function printOrder(encodedData) {
  const order = JSON.parse(decodeURIComponent(encodedData));
  const container = document.getElementById('ticketContainer');
  const restaurantName = CONFIG.restaurantName || localStorage.getItem('aimax_name') || '';
  const ticketW = parseInt(localStorage.getItem('aimax_ticket_width')) || 300;
  const ticketF = parseInt(localStorage.getItem('aimax_ticket_font'))  || 13;
  container.style.width    = ticketW + 'px';
  container.style.fontSize = ticketF + 'px';
  const actions = document.querySelector('.print-modal-actions');
  if (actions) actions.style.width = ticketW + 'px';

  const items = order.items && order.items.length > 0 ? order.items : (order.pedido || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  function parseQtyItem(line) {
    const m1 = line.match(/^(\d+)\s*[×x]\s*(.+)/i);
const m2 = line.match(/^(.+?)\s*[×x](\d+)$/i);
if (m1) return { qty: m1[1], name: m1[2].trim() };
if (m2) return { qty: m2[2], name: m2[1].trim() };
return { qty: '1', name: line };
  }

  const esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const itemsHtml = items.map(line => { const { qty, name } = parseQtyItem(line); return `<div class="ticket-item"><span class="ticket-item-qty">${esc(qty)}x</span><span class="ticket-item-name"> ${esc(name)}</span></div>`; }).join('');
  const totalHtml = order.total ? `<div class="ticket-total"><span class="ticket-total-label">TOTAL</span><span class="ticket-total-value">${esc(order.total)}</span></div>` : '';

  container.innerHTML = `
    <div class="ticket-header">
      <div class="ticket-logo">AIMAX</div>
      ${restaurantName ? `<div class="ticket-resto">${esc(restaurantName)}</div>` : ''}
      <div class="ticket-tagline">Sistema de Pedidos</div>
    </div>
    <div class="ticket-info">
      <span class="ticket-info-value">#${String(order.index||'—').padStart(3,'0')}</span>
      <div class="ticket-info-row"><span class="ticket-info-label">FECHA/HORA</span><span class="ticket-info-value">${esc((order.fecha||'')+' '+(order.hora||''))}</span></div>
    </div>
    <div class="ticket-client">
      <div class="ticket-client-label">Cliente</div>
      <div class="ticket-client-name">${esc(order.cliente||'Sin nombre')}</div>
      ${order.telefono ? `<div style="font-size:11px;color:#666;margin-top:2px">📞 ${esc(order.telefono)}</div>` : ''}
    </div>
    <div class="ticket-items">
      <div class="ticket-items-title">Detalle del Pedido</div>
      ${itemsHtml || `<div class="ticket-item">${esc(order.pedido||'—')}</div>`}
    </div>
    ${order.extras   ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">📝 EXTRAS</span></div><div style="font-size:12px;margin-bottom:6px;padding-left:4px">${esc(order.extras)}</div>` : ''}
    ${order.entrega  ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">ENTREGA</span><span class="ticket-info-value">${esc(order.entrega)}</span></div>` : ''}
    ${order.direccion? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">DIRECCIÓN</span><span class="ticket-info-value" style="max-width:60%;text-align:right">${esc(order.direccion)}</span></div>` : ''}
    ${order.pago     ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">PAGO</span><span class="ticket-info-value">${esc(order.pago)}</span></div>` : ''}
${order.efectivo ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">PAGA CON</span><span class="ticket-info-value">${esc(order.efectivo)}</span></div>` : ''}
${(() => { const paga = parseInt(String(order.efectivo||'').replace(/\D/g,'')); const tot = parseInt(String(order.total||'').replace(/\D/g,'')); const dev = paga - tot; return (paga > 0 && dev > 0) ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">DEVUELTA</span><span class="ticket-info-value">$${dev.toLocaleString('es-CO')}</span></div>` : ''; })()}
${totalHtml}
    <div class="ticket-footer">
      <div>¡Gracias por tu pedido!</div>
      <div class="footer-brand">powered by AIMAX</div>
    </div>`;

  document.getElementById('printModalOverlay').classList.remove('hidden');
}

function closePrintModal() {
  document.getElementById('printModalOverlay').classList.add('hidden');
}

document.getElementById('printModalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closePrintModal();
});

/* ── SYNC STATUS ── */
function updateLastSync() {
  const now = new Date();
  document.getElementById('metricLastUpdate').textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}
function setSyncOk() {
  const dot = document.querySelector('.sync-dot'), label = document.querySelector('.sync-label');
  if (dot) dot.style.background = '#52c07a';
  if (label) { label.textContent = 'En vivo'; label.style.color = '#52c07a'; }
}
function setSyncError() {
  const dot = document.querySelector('.sync-dot'), label = document.querySelector('.sync-label');
  if (dot) dot.style.background = '#e05252';
  if (label) { label.textContent = 'Sin conexión'; label.style.color = '#e05252'; }
}

/* ── NAVIGATION ── */
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  const titles = { orders: 'Pedidos', ventas: 'Ventas', clientes: 'Clientes', horas: 'Por Horas', metrics: 'Métricas', config: 'Configuración' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  const navItems = document.querySelectorAll('.nav-item');
  const idx = { orders: 0, ventas: 1, clientes: 2, horas: 3, metrics: 4, config: 5 };
  if (navItems[idx[name]] !== undefined) navItems[idx[name]].classList.add('active');
  closeSidebar();

  // Renderizar la sección activa
  if (name === 'metrics')  updateMetrics();
  if (name === 'ventas')   renderVentas();
  if (name === 'clientes') renderClientes();
  if (name === 'horas')    renderHoras();
}

/* ── SIDEBAR MOBILE ── */
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar'), overlay = getOrCreateOverlay();
  if (sidebar.classList.contains('open')) { closeSidebar(); } else { sidebar.classList.add('open'); overlay.classList.add('visible'); }
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) overlay.classList.remove('visible');
}
function getOrCreateOverlay() {
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; overlay.onclick = closeSidebar; document.body.appendChild(overlay); }
  return overlay;
}

/* ── CONFIG ── */
function saveSupabaseConfig() {
  const url   = document.getElementById('supabaseUrlInput').value.trim();
  const key   = document.getElementById('supabaseKeyInput').value.trim();
  const table = document.getElementById('supabaseTableInput').value.trim() || 'pedidos';
  const msg   = document.getElementById('supabaseMsg');
  if (!url || !key) { msg.style.color='#e05252'; msg.textContent='Completa la URL y la API Key.'; return; }
  CONFIG.supabaseUrl   = url;
  CONFIG.supabaseKey   = key;
  CONFIG.supabaseTable = table;
  localStorage.setItem('aimax_sb_url',   url);
  localStorage.setItem('aimax_sb_key',   key);
  localStorage.setItem('aimax_sb_table', table);
  msg.style.color='#52c07a'; msg.textContent='¡Conectado a Supabase ✓ Cargando pedidos...';
  fetchOrders();
}

function changePassword() {
  const p1 = document.getElementById('newPassInput').value, p2 = document.getElementById('newPassConfirm').value;
  const msg = document.getElementById('passMsg');
  if (!p1 || p1.length < 4) { msg.style.color='#e05252'; msg.textContent='Mínimo 4 caracteres.'; return; }
  if (p1 !== p2) { msg.style.color='#e05252'; msg.textContent='Las contraseñas no coinciden.'; return; }
  CONFIG.password = p1; localStorage.setItem('aimax_password', p1);
  msg.style.color='#52c07a'; msg.textContent='Contraseña cambiada ✓';
  document.getElementById('newPassInput').value = document.getElementById('newPassConfirm').value = '';
}

function saveRestaurantName() {
  const name = document.getElementById('restaurantNameInput').value.trim();
  if (!name) return;
  CONFIG.restaurantName = name; localStorage.setItem('aimax_name', name);
  showMsg('Nombre guardado ✓', 'green');
}

function showMsg(text, color) {
  const toast = document.createElement('div');
  toast.textContent = text;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${color==='green'?'#52c07a':'#e05252'};color:#000;padding:10px 18px;font-weight:600;font-size:13px;border-radius:4px;z-index:9999;animation:fadeUp 0.3s ease`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/* ── EXPORT ── */
function toggleExportMenu() {
  document.getElementById('exportMenu').classList.toggle('open');
}
function closeExportMenu() {
  document.getElementById('exportMenu').classList.remove('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#exportDropdown')) closeExportMenu();
});

function getFilteredSorted() {
  return [...filterOrders(allOrders)].sort((a,b) => a.dateObj - b.dateObj);
}

function getPeriodLabel() {
  const labels = { day: 'Hoy', week: 'Esta Semana', month: 'Este Mes', year: 'Este Año', all: 'Todos los Pedidos' };
  return labels[currentFilter] || 'Pedidos';
}

function exportExcel() {
  const orders = getFilteredSorted();
  if (!orders.length) { showMsg('No hay pedidos para exportar', 'red'); return; }
  const period = getPeriodLabel();
  const limpiar = v => String(v || '').replace(/[•\-\*]\s*/g, '').replace(/\s+/g, ' ').trim();

  const filas = orders.map((o, i) => {
    const platos = (o.items&&o.items.length>0)
      ? o.items.map(p => `<p style="margin:2px 0">${limpiar(p)}</p>`).join('')
      : limpiar(o.pedido);
    const totalTexto = String(o.total||'').trim();
    return `<tr>
      <td style="text-align:center">${i+1}</td>
      <td>${o.fecha}</td>
      <td>${o.hora||''}</td>
      <td><b>${limpiar(o.cliente)}</b><br>${o.telefono||''}</td>
      <td style="min-width:180px">${platos}</td>
      <td>${o.entrega||''}</td>
      <td>${limpiar(o.direccion||'')}</td>
      <td>${limpiar(o.pago||'')}</td>
      <td style="font-weight:bold;mso-number-format:'\@'">${totalTexto}</td>
    </tr>`;
  }).join('');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #111111; color: #D4AF37; padding: 8px; text-align: left; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 8px; vertical-align: top; border: 1px solid #ddd; font-size: 14px; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
  </head>
  <body><table>
    <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Platos</th><th>Entrega</th><th>Dirección</th><th>Pago</th><th>Total</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></body></html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `AIMAX_Pedidos_${period.replace(/ /g,'_')}.xls`
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showMsg('Excel descargado ✓', 'green');
}

function exportPDF() {
  const orders = getFilteredSorted();
  if (!orders.length) { showMsg('No hay pedidos para exportar', 'red'); return; }
  const restaurantName = CONFIG.restaurantName || 'Restaurante';
  const period = getPeriodLabel();
  const fecha  = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });

  const rows = orders.map((o, i) => `
    <tr>
      <td>${i+1}</td><td>${o.fecha}</td><td>${o.hora||'—'}</td>
      <td><strong>${o.cliente}</strong>${o.telefono?'<br><small>'+o.telefono+'</small>':''}</td>
      <td>${o.items&&o.items.length>0 ? o.items.map(i=>'• '+i.replace(/^[•\-\*]\s*/,'')).join('<br>') : o.pedido}</td>
      <td><span class="badge ${o.entrega&&o.entrega.toLowerCase().includes('dom')?'dom':'local'}">${o.entrega||'—'}</span></td>
      <td>${o.direccion||'—'}</td><td>${o.pago||'—'}</td><td class="total">${o.total}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Reporte ${period} — ${restaurantName}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:24px}h1{font-size:20px;letter-spacing:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-top:4px}.meta{font-size:11px;color:#888;margin:6px 0 18px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#111;color:#D4AF37;font-size:10px;letter-spacing:1px;padding:8px 10px;text-align:left;text-transform:uppercase}td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even) td{background:#fafafa}td.total{font-weight:700}small{color:#888;font-size:10px}.badge{display:inline-block;padding:2px 7px;border-radius:100px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px}.badge.dom{background:#fff8dc;color:#a88a20;border:1px solid #D4AF37}.badge.local{background:#e8f8ee;color:#2e7d4f;border:1px solid #52c07a}.footer{margin-top:20px;font-size:10px;color:#aaa;text-align:center}.summary{display:flex;gap:24px;margin:16px 0}.summary-item{background:#f5f5f5;padding:10px 16px;border-left:3px solid #D4AF37}.summary-item b{display:block;font-size:18px}.summary-item span{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px}@media print{body{padding:12px}}</style>
  </head><body>
  <h1>AIMAX — ${restaurantName}</h1><h2>Reporte de Pedidos · ${period}</h2>
  <p class="meta">Generado el ${fecha} · ${orders.length} pedido${orders.length!==1?'s':''}</p>
  <div class="summary">
    <div class="summary-item"><b>${orders.length}</b><span>Total Pedidos</span></div>
    <div class="summary-item"><b>${orders.filter(o=>o.entrega&&o.entrega.toLowerCase().includes('dom')).length}</b><span>Domicilios</span></div>

    <div class="summary-item"><b>${orders.filter(o=>o.entrega&&o.entrega.toLowerCase().includes('local')).length}</b><span>Recoger En El Local</span></div>
    <div class="summary-item"><b>${orders.filter(o=>o.entrega&&o.entrega.toLowerCase().includes('comer')).length}</b><span>Comer Aquí</span></div>

  </div>
  <table><thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Platos</th><th>Entrega</th><th>Dirección</th><th>Pago</th><th>Total</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <p class="footer">powered by AIMAX Restaurant OS</p>
  <script>window.onload=()=>window.print();<\/script></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `AIMAX_Reporte_${period.replace(/ /g,'_')}_${new Date().toLocaleDateString('es')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  showMsg('PDF descargado ✓', 'green');
}

/* ── UTILS ── */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── EXTRA CSS DINÁMICO ── */
const styleEl = document.createElement('style');
styleEl.textContent = `
  /* Revenue strip */
  .revenue-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
  .rev-card { background:var(--card,#161616); border:1px solid #222; border-radius:10px; padding:14px 16px; display:flex; align-items:center; gap:12px; }
  .rev-card-gold { border-color:#D4AF37; }
  .rev-icon { font-size:22px; }
  .rev-info { display:flex; flex-direction:column; gap:2px; }
  .rev-label { font-size:10px; font-weight:600; letter-spacing:1.5px; color:#888; text-transform:uppercase; }
  .rev-value { font-family:'Bebas Neue',sans-serif; font-size:22px; color:#fff; letter-spacing:1px; line-height:1; }
  .rev-card-gold .rev-value { color:#D4AF37; }
  @media(max-width:700px){ .revenue-strip{grid-template-columns:1fr 1fr;} }
  @media(max-width:420px){ .revenue-strip{grid-template-columns:1fr;} }

  /* Ventas — bar chart mes a mes */
  .bar-chart { display:flex; align-items:flex-end; gap:6px; height:160px; overflow-x:auto; padding-bottom:4px; }
  .bar-item { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:50px; }
  .bar-wrap { width:100%; height:120px; display:flex; align-items:flex-end; }
  .bar-fill { width:100%; background:#D4AF37; border-radius:4px 4px 0 0; transition:height 0.4s; min-height:2px; }
  .bar-value { font-size:10px; color:#aaa; white-space:nowrap; }
  .bar-label { font-size:10px; color:#666; white-space:nowrap; }

  /* Horas chart */
  .horas-bar-chart { display:flex; align-items:flex-end; gap:3px; height:160px; overflow-x:auto; padding-bottom:4px; }
  .hora-bar-item { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:28px; flex:1; }
  .hora-bar-item.hora-peak .hora-bar-fill { background:#D4AF37 !important; }
  .hora-bar-wrap { width:100%; height:120px; display:flex; align-items:flex-end; }
  .hora-bar-fill { width:100%; background:#333; border-radius:3px 3px 0 0; transition:height 0.3s; min-height:2px; }
  .hora-bar-count { font-size:9px; color:#888; }
  .hora-bar-label { font-size:8px; color:#555; white-space:nowrap; }

  /* Horas x Día tabla */
  .horas-tabla { width:100%; border-collapse:collapse; font-size:12px; }
  .horas-tabla th { background:#111; color:#888; font-size:10px; padding:6px 8px; text-align:center; font-weight:600; letter-spacing:1px; }
  .horas-tabla-hora { color:#aaa; font-family:'JetBrains Mono',monospace; font-size:11px; padding:4px 8px; white-space:nowrap; }
  .horas-cell { text-align:center; padding:4px 6px; font-size:11px; color:#aaa; border-radius:3px; }
  .horas-cell.hot  { background:#D4AF3733; color:#D4AF37; font-weight:700; }
  .horas-cell.warm { background:#D4AF3722; color:#c8a530; }
  .horas-cell.cool { background:#ffffff08; color:#888; }

  /* Clientes */
  .cliente-row { background:#111; border:1px solid #222; border-radius:10px; padding:14px 16px; margin-bottom:10px; }
  .cliente-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; }
  .cliente-nombre { font-weight:600; font-size:15px; color:#fff; display:block; }
  .cliente-tel { font-size:12px; color:#888; margin-top:2px; display:block; }
  .cliente-stats { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:8px; }
  .cliente-stat { display:flex; flex-direction:column; align-items:center; background:#161616; border-radius:6px; padding:6px 10px; min-width:70px; }
  .cliente-stat-val { font-family:'Bebas Neue',sans-serif; font-size:18px; color:#D4AF37; }
  .cliente-stat-lab { font-size:9px; color:#666; letter-spacing:1px; text-transform:uppercase; margin-top:1px; }
  .cliente-prods { font-size:12px; color:#888; border-top:1px solid #222; padding-top:8px; margin-top:4px; }

  /* Section header actions */
  .section-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:20px; }
  .section-header h2 { font-size:20px; font-weight:600; color:#fff; }
  .section-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-8px); }
    40%     { transform: translateX(8px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }
  @media print {
    body > *:not(#printModalOverlay) { display: none !important; }
    #printModalOverlay { position: static !important; background: none !important; display: block !important; }
    .print-modal-actions { display: none !important; }
    .ticket { box-shadow: none !important; }
  }
`;
document.head.appendChild(styleEl);
