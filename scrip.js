/* ═══════════════════════════════════════════
   AIMAX Restaurant Dashboard — script.js
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
    const url   = `${CONFIG.supabaseUrl}/rest/v1/${table}?select=*&order=created_at.desc&limit=5000`;
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
    renderOrders(); updateMetrics(); updateLastSync(); setSyncOk();
  } catch (err) {
    console.warn('Error Supabase:', err);
    setSyncError();
    if (allOrders.length === 0) useDemoData();
  }
  if (btn) btn.classList.remove('spinning');
}

function parseSupabaseRow(row, idx) {
  // Soporta columnas con nombres del Sheet original Y nombres estándar
  const fechaRaw = row.Fecha    || row.fecha    || (row.created_at ? row.created_at.slice(0,10) : '');
  const cliente  = row.Nombre   || row.cliente  || 'Cliente sin nombre';
  const telefono = row.Telefono || row.telefono || '';
  const pedido   = row.Platos   || row.pedido   || '';
  const entrega  = row.Entrega  || row.entrega  || '';
  const direccion= row.Direccion|| row.direccion|| '';
  const pago     = row.Pago     || row.pago     || '';
  const total    = row.Total    || row.total    || '';
  // Extraer hora de la fecha si viene como "4/3/2026 20:20:37"
  let hora = row.hora || '';
  const horaMatch = fechaRaw.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (horaMatch && !hora) hora = horaMatch[1];
  const fecha = fechaRaw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?/, '').trim();
  const dateObj = parseDate(fechaRaw, hora);
  return { id: `order-${row.id || idx+1}`, index: idx+1, fecha, hora, cliente, telefono, pedido, entrega, direccion, pago, total, dateObj, items: parseItems(pedido) };
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
  // Extraer hora de la fecha si viene como "19/4/2026 23:53:37"
  let hora = '';
  const horaMatch = fecha.match(/(\d{1,2}:\d{2}(:\d{2})?)/);
  if (horaMatch) hora = horaMatch[1];
  const dateObj = parseDate(fecha, hora);
  return { id: `order-${idx+1}`, index: idx+1, fecha, hora, cliente, telefono, pedido, entrega, direccion, pago, total, dateObj, items: parseItems(pedido) };
}

function parseDate(fecha, hora) {
  if (!fecha) return new Date();
  // Formato americano mes/dia/año: 4/21/2026 20:55:23
  const m1 = fecha.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (m1) {
    const mes  = m1[1].padStart(2,'0');
    const dia  = m1[2].padStart(2,'0');
    const anio = m1[3];
    const time = m1[4] || hora || '00:00:00';
    const d = new Date(`${anio}-${mes}-${dia}T${time}`);
    if (!isNaN(d)) return d;
  }
  let d = new Date(fecha);
  if (!isNaN(d)) return d;
  return new Date();
}

function parseItems(pedido) {
  if (!pedido) return [];
  return pedido.split(/[,\n]/).map(s => s.trim().replace(/^[•\-\*]+\s*/, '')).filter(Boolean);
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
  ];
  allOrders = demos.map((d, i) => {
    const dateObj = new Date(now - i * 1000 * 60 * 30);
    return { id: `order-${i+1}`, index: i+1, fecha: fmt(dateObj), hora: fmtT(dateObj), cliente: d.cliente, telefono: d.telefono, pedido: d.pedido, entrega: d.entrega, direccion: d.direccion, pago: d.pago, total: d.total, dateObj, items: parseItems(d.pedido) };
  });
  renderOrders(); updateMetrics(); updateLastSync(); setSyncOk();
  if (!window._demoWarned) { window._demoWarned = true; console.info('AIMAX: Usando datos de demostración.'); }
}

/* ── FILTERS ── */
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

function filterOrders(orders) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (currentFilter) {
    case 'day':   return orders.filter(o => o.dateObj >= today);
    case 'week':  { const ws = new Date(today); ws.setDate(today.getDate() - today.getDay()); return orders.filter(o => o.dateObj >= ws); }
    case 'month': return orders.filter(o => o.dateObj >= new Date(now.getFullYear(), now.getMonth(), 1));
    case 'year':  return orders.filter(o => o.dateObj >= new Date(now.getFullYear(), 0, 1));
    default:      return orders;
  }
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
    direccion: order.direccion, pago: order.pago, total: order.total
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
  orders.forEach(o => o.items.forEach(item => { const clean = item.replace(/^\d+x?\s*/i, '').trim(); if (clean) freq[clean] = (freq[clean] || 0) + 1; }));
  const sorted = Object.entries(freq).sort((a,b) => b[1]-a[1]);
  return sorted.length ? sorted[0][0] : null;
}

function renderTopProducts(orders) {
  const freq = {};
  orders.forEach(o => o.items.forEach(item => { const clean = item.replace(/^\d+x?\s*/i, '').trim(); if (clean) freq[clean] = (freq[clean] || 0) + 1; }));
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
  msg.style.color = '#52c07a';
  msg.textContent = `Ticket configurado: ${w}px · fuente ${f}px ✓`;
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

  // Aplicar dimensiones guardadas
  const ticketW = parseInt(localStorage.getItem('aimax_ticket_width')) || 300;
  const ticketF = parseInt(localStorage.getItem('aimax_ticket_font'))  || 13;
  container.style.width    = ticketW + 'px';
  container.style.fontSize = ticketF + 'px';
  // Ajustar acciones al mismo ancho
  const actions = document.querySelector('.print-modal-actions');
  if (actions) actions.style.width = ticketW + 'px';

  const items = order.items && order.items.length > 0 ? order.items : (order.pedido || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  function parseQtyItem(line) {
    const m1 = line.match(/^(\d+)x?\s+(.+)/i);
    const m2 = line.match(/^(.+?)\s+x(\d+)$/i);
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
      <div class="ticket-info-row"><span class="ticket-info-label">PEDIDO #</span><span class="ticket-info-value">${String(order.index||'—').padStart(3,'0')}</span></div>
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
    ${order.entrega  ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">ENTREGA</span><span class="ticket-info-value">${esc(order.entrega)}</span></div>` : ''}
    ${order.direccion? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">DIRECCIÓN</span><span class="ticket-info-value" style="max-width:60%;text-align:right">${esc(order.direccion)}</span></div>` : ''}
    ${order.pago     ? `<div class="ticket-info-row" style="margin-bottom:4px"><span class="ticket-info-label">PAGO</span><span class="ticket-info-value">${esc(order.pago)}</span></div>` : ''}
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

// Cerrar modal al hacer clic fuera del ticket
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
  const titles = { orders: 'Pedidos', metrics: 'Métricas', config: 'Configuración' };
  document.getElementById('pageTitle').textContent = titles[name] || name;
  const navItems = document.querySelectorAll('.nav-item');
  const idx = { orders: 0, metrics: 1, config: 2 };
  if (navItems[idx[name]]) navItems[idx[name]].classList.add('active');
  closeSidebar();
  if (name === 'metrics') updateMetrics();
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
  showMsg('Supabase conectado ✓', 'green');
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
  const restaurantName = CONFIG.restaurantName || 'Restaurante';
  const period = getPeriodLabel();

  // Construir CSV con BOM para que Excel lo abra en UTF-8 correctamente
  const BOM = '\uFEFF';
  const headers = ['#', 'Fecha', 'Hora', 'Cliente', 'Teléfono', 'Platos', 'Entrega', 'Dirección', 'Método de Pago', 'Total'];

  const rows = orders.map((o, i) => [
    i + 1,
    o.fecha,
    o.hora,
    o.cliente,
    o.telefono || '',
    o.pedido,
    o.entrega || '',
    o.direccion || '',
    o.pago || '',
    o.total
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = BOM + `${restaurantName} — ${period}\n\n` + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `AIMAX_Pedidos_${period.replace(/ /g,'_')}_${new Date().toLocaleDateString('es')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
      <td>${i+1}</td>
      <td>${o.fecha}</td>
      <td>${o.hora || '—'}</td>
      <td><strong>${o.cliente}</strong>${o.telefono ? '<br><small>'+o.telefono+'</small>' : ''}</td>
      <td>${o.pedido}</td>
      <td><span class="badge ${o.entrega && o.entrega.toLowerCase().includes('dom') ? 'dom' : 'local'}">${o.entrega || '—'}</span></td>
      <td>${o.direccion || '—'}</td>
      <td>${o.pago || '—'}</td>
      <td class="total">${o.total}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Reporte ${period} — ${restaurantName}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 24px; }
    h1 { font-size: 20px; letter-spacing: 2px; color: #000; }
    h2 { font-size: 13px; color: #555; font-weight: normal; margin-top: 4px; }
    .meta { font-size: 11px; color: #888; margin: 6px 0 18px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #111; color: #D4AF37; font-size: 10px; letter-spacing: 1px; padding: 8px 10px; text-align: left; text-transform: uppercase; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    td.total { font-weight: 700; color: #000; white-space: nowrap; }
    small { color: #888; font-size: 10px; }
    .badge { display:inline-block; padding:2px 7px; border-radius:100px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
    .badge.dom   { background:#fff8dc; color:#a88a20; border:1px solid #D4AF37; }
    .badge.local { background:#e8f8ee; color:#2e7d4f; border:1px solid #52c07a; }
    .footer { margin-top: 20px; font-size: 10px; color: #aaa; text-align: center; }
    .summary { display:flex; gap:24px; margin: 16px 0; }
    .summary-item { background:#f5f5f5; padding:10px 16px; border-left:3px solid #D4AF37; }
    .summary-item b { display:block; font-size:18px; }
    .summary-item span { font-size:10px; color:#888; text-transform:uppercase; letter-spacing:1px; }
    @media print { body { padding:12px; } }
  </style></head><body>
  <h1>AIMAX — ${restaurantName}</h1>
  <h2>Reporte de Pedidos · ${period}</h2>
  <p class="meta">Generado el ${fecha} · ${orders.length} pedido${orders.length !== 1 ? 's' : ''}</p>
  <div class="summary">
    <div class="summary-item"><b>${orders.length}</b><span>Total Pedidos</span></div>
    <div class="summary-item"><b>${orders.filter(o=>o.entrega&&o.entrega.toLowerCase().includes('dom')).length}</b><span>Domicilios</span></div>
    <div class="summary-item"><b>${orders.filter(o=>!o.entrega||o.entrega.toLowerCase().includes('local')).length}</b><span>En Local</span></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Platos</th><th>Entrega</th><th>Dirección</th><th>Pago</th><th>Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">powered by AIMAX Restaurant OS</p>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank');
  showMsg('PDF listo para imprimir ✓', 'green');
}

/* ── UTILS ── */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── EXTRA ANIMATIONS ── */
const styleEl = document.createElement('style');
styleEl.textContent = `
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