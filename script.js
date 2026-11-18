const UMBRAL_DISTANCIA = 50; // metros (ficticio)
const REGEX_SENSOR = /^SEN-\d{3}$/;
const REGEX_USUARIO = /^[A-Za-z0-9_]{3,20}$/;
const ESTADOS = { normal: "Normal", revision: "Revisión", urgente: "Urgente" };
const RESERVADOS = ["__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof"];
const USUARIO_DEMO = "demo";

let usuarioActual = null; // clave (minúsculas) del usuario con sesión
let modoRegistro = false;
let mantenimiento = [];   // [{id, componente, horas, estado}]
let sensores = [];        // [{id, codigo, tipo, lectura}]
let siguienteId = 1;
let siguienteSensor = 1;
let editandoMant = null;
let editandoSensor = null;

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);
const esNumero = (t) => t.trim() !== "" && !isNaN(Number(t));
const tiene = (obj, clave) => Object.prototype.hasOwnProperty.call(obj, clave);
const on = (id, evento, fn) => { const el = $(id); if (el) el.addEventListener(evento, fn); };

function toast(texto, tipo) {
  let cont = $("toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    document.body.appendChild(cont);
  }
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.textContent = texto;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function mostrarMensaje(id, texto, tipo) {
  const el = $(id);
  if (!el) return;
  el.textContent = texto;
  el.className = "mensaje " + tipo;
  if (tipo === "error" && id !== "msg-auth" && id !== "msg-cuenta") toast(texto, "error");
}

function limpiarMensaje(id) {
  const el = $(id);
  if (!el) return;
  el.textContent = "";
  el.className = "mensaje";
}

function botonAccion(texto, clase, fn) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = texto;
  b.className = clase;
  b.addEventListener("click", fn);
  return b;
}

function filaVacia(tbody, cols, texto) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = cols;
  td.className = "vacio";
  td.textContent = texto;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

// ---------- Almacenamiento (por usuario) ----------
function claveDatosDe(tipo, k) { return "simtele_" + tipo + "_" + k; }
function claveDatos(tipo) { return claveDatosDe(tipo, usuarioActual); }

function guardar() {
  if (!usuarioActual) return;
  try {
    localStorage.setItem(claveDatos("mant"), JSON.stringify(mantenimiento));
    localStorage.setItem(claveDatos("sens"), JSON.stringify(sensores));
  } catch (e) { /* la página sigue funcionando sin localStorage */ }
}

function cargar() {
  try {
    mantenimiento = JSON.parse(localStorage.getItem(claveDatos("mant"))) || [];
    sensores = JSON.parse(localStorage.getItem(claveDatos("sens"))) || [];
  } catch (e) { mantenimiento = []; sensores = []; }
  if (!Array.isArray(mantenimiento)) mantenimiento = [];
  if (!Array.isArray(sensores)) sensores = [];

  let n = mantenimiento.reduce((m, r) => Math.max(m, r.id || 0), 0);
  mantenimiento.forEach((r) => { if (!r.id) r.id = ++n; });
  siguienteId = n + 1;

  let s = sensores.reduce((m, r) => Math.max(m, r.id || 0), 0);
  sensores.forEach((r) => { if (!r.id) r.id = ++s; });
  siguienteSensor = s + 1;
}

function actualizarKpis() {
  if ($("k-mant")) $("k-mant").textContent = mantenimiento.length;
  if ($("k-urg")) $("k-urg").textContent = mantenimiento.filter((r) => r.estado === "urgente").length + " urgentes";
  if ($("k-sens")) $("k-sens").textContent = sensores.length;
}

// ---------- Autenticación (simulada en el navegador) ----------
function leerUsuarios() {
  try {
    const u = JSON.parse(localStorage.getItem("simtele_usuarios"));
    return u && typeof u === "object" && !Array.isArray(u) ? u : {};
  } catch (e) { return {}; }
}

function guardarUsuarios(u) {
  try { localStorage.setItem("simtele_usuarios", JSON.stringify(u)); return true; }
  catch (e) { return false; }
}

function nuevaSal() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Respaldo simple (solo didáctico) para navegadores sin crypto.subtle.
function hashSimple(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return "d" + (h >>> 0).toString(16);
}

// SHA-256 con sal. Si el navegador no lo permite, usa el respaldo.
async function hashClave(clave, sal, forzarSimple) {
  const texto = sal + ":" + clave;
  if (!forzarSimple && window.crypto && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) { /* cae al respaldo */ }
  }
  return hashSimple(texto);
}

// Un hash SHA-256 mide 64 caracteres; el de respaldo es más corto.
async function claveCorrecta(u, clave) {
  if (!u || typeof u.hash !== "string" || typeof u.sal !== "string") return false;
  const h = await hashClave(clave, u.sal, u.hash.length < 64);
  return h === u.hash;
}

async function sembrarDemo() {
  const usuarios = leerUsuarios();
  if (tiene(usuarios, USUARIO_DEMO)) return;
  const sal = nuevaSal();
  usuarios[USUARIO_DEMO] = { nombre: "demo", sal: sal, hash: await hashClave("demo123", sal) };
  guardarUsuarios(usuarios);
}

function cambiarModo(registro) {
  modoRegistro = registro;
  $("tab-login").classList.toggle("activo", !registro);
  $("tab-registro").classList.toggle("activo", registro);
  $("campo-pass2").hidden = !registro;
  $("auth-submit").textContent = registro ? "Crear cuenta" : "Entrar";
  $("auth-pass").autocomplete = registro ? "new-password" : "current-password";
  limpiarMensaje("msg-auth");
}

async function procesarAuth() {
  const usuario = $("auth-user").value.trim();
  const clave = $("auth-pass").value;
  const usuarios = leerUsuarios();
  const k = usuario.toLowerCase();

  if (usuario === "" || clave === "")
    return mostrarMensaje("msg-auth", "Completa usuario y contraseña.", "error");

  if (modoRegistro) {
    if (!REGEX_USUARIO.test(usuario))
      return mostrarMensaje("msg-auth", "Usuario de 3 a 20 caracteres: letras, números o _.", "error");
    if (RESERVADOS.includes(k))
      return mostrarMensaje("msg-auth", "Ese nombre de usuario no está permitido.", "error");
    if (clave.length < 6)
      return mostrarMensaje("msg-auth", "La contraseña debe tener al menos 6 caracteres.", "error");
    if (clave !== $("auth-pass2").value)
      return mostrarMensaje("msg-auth", "Las contraseñas no coinciden.", "error");
    if (tiene(usuarios, k))
      return mostrarMensaje("msg-auth", "Ese usuario ya existe.", "error");

    const sal = nuevaSal();
    usuarios[k] = { nombre: usuario, sal: sal, hash: await hashClave(clave, sal) };
    if (!guardarUsuarios(usuarios))
      return mostrarMensaje("msg-auth", "No se pudo guardar la cuenta (almacenamiento bloqueado).", "error");
    entrar(k, true);
    toast("Cuenta creada. ¡Bienvenido, " + usuario + "!", "ok");
  } else {
    const u = tiene(usuarios, k) ? usuarios[k] : null;
    if (!u || !(await claveCorrecta(u, clave)))
      return mostrarMensaje("msg-auth", "Usuario o contraseña incorrectos.", "error");
    entrar(k, false);
  }
}

async function enviarAuth(e) {
  e.preventDefault();
  const btn = $("auth-submit");
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    await procesarAuth();
  } catch (err) {
    console.error(err);
    mostrarMensaje("msg-auth", "Ocurrió un error. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
  }
}

function actualizarCabecera() {
  const usuarios = leerUsuarios();
  const u = tiene(usuarios, usuarioActual) ? usuarios[usuarioActual] : null;
  $("usuario").textContent = "👤 " + (u ? u.nombre : usuarioActual);
  $("usuario").hidden = false;
  return u;
}

function entrar(k, silencioso) {
  usuarioActual = k;
  try { sessionStorage.setItem("simtele_sesion", k); } catch (e) {}
  const u = actualizarCabecera();

  document.body.classList.remove("bloqueado");
  try {
    cargar();
    renderMantenimiento();
    renderSensores();
  } catch (e) { console.error(e); }
  $("form-auth").reset();
  cambiarModo(false);
  window.scrollTo(0, 0);
  if (!silencioso) toast("Bienvenido, " + (u ? u.nombre : k), "ok");
}

function limpiarPanel() {
  ["form-detencion", "form-viento"].forEach((id) => { const f = $(id); if (f) f.reset(); });
  ["msg-detencion", "msg-mant", "msg-viento", "msg-sensor"].forEach(limpiarMensaje);
  if ($("medidor-barra")) $("medidor-barra").style.width = "0";
  if ($("barras")) $("barras").innerHTML = "";
  if ($("k-dist")) $("k-dist").textContent = "—";
  if ($("k-viento")) $("k-viento").textContent = "—";
}

function cerrarSesion() {
  try { sessionStorage.removeItem("simtele_sesion"); } catch (e) {}
  usuarioActual = null;
  mantenimiento = [];
  sensores = [];
  cerrarCuenta();
  salirEdicionMant();
  salirEdicionSensor();
  limpiarPanel();
  $("usuario").hidden = true;
  document.body.classList.add("bloqueado");
  window.scrollTo(0, 0);
  toast("Sesión cerrada", "alerta");
}

// ---------- Edición de cuenta (usuario, contraseña, eliminar) ----------
function crearUICuenta() {
  const css = document.createElement("style");
  css.textContent = `
    .modal{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:1rem;background:rgba(10,20,36,.6)}
    body.bloqueado .modal{display:none}
    .modal-card{width:100%;max-width:420px;max-height:92vh;overflow:auto;background:var(--card);color:var(--txt);border-top:6px solid var(--p);border-radius:16px;padding:1.4rem;box-shadow:0 20px 50px rgba(0,0,0,.35)}
    .modal-card h2{margin-bottom:.6rem}
    .modal-acc{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
    .modal-acc .secundario{margin-left:0}
    .peligro{width:100%;background:#fee2e2;color:var(--err);border:1px solid var(--err)}
    .peligro:hover{background:var(--err);color:#fff;filter:none}
    .modal hr{border:0;border-top:1px solid var(--brd);margin:1.2rem 0 0}
    #toasts{z-index:80}
  `;
  document.head.appendChild(css);

  const modal = document.createElement("div");
  modal.id = "modal-cuenta";
  modal.className = "modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="cuenta-titulo">
      <h2 id="cuenta-titulo">👤 Mi cuenta</h2>
      <p class="ayuda">Para guardar cambios o eliminar la cuenta, escribe tu contraseña actual.</p>
      <form id="form-cuenta" novalidate>
        <label for="cuenta-user">Usuario</label>
        <input type="text" id="cuenta-user" autocomplete="username">
        <label for="cuenta-pass">Contraseña actual</label>
        <input type="password" id="cuenta-pass" autocomplete="current-password">
        <label for="cuenta-nueva">Nueva contraseña (opcional)</label>
        <input type="password" id="cuenta-nueva" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
        <label for="cuenta-nueva2">Repetir nueva contraseña</label>
        <input type="password" id="cuenta-nueva2" autocomplete="new-password">
        <div class="modal-acc">
          <button type="submit" id="cuenta-guardar">Guardar cambios</button>
          <button type="button" id="cuenta-cerrar" class="secundario">Cancelar</button>
        </div>
      </form>
      <p id="msg-cuenta" class="mensaje" role="alert"></p>
      <hr>
      <button type="button" id="cuenta-eliminar" class="peligro">🗑️ Eliminar mi cuenta</button>
    </div>`;
  document.body.appendChild(modal);

  const acc = document.querySelector(".acciones");
  if (acc) {
    const b = document.createElement("button");
    b.type = "button";
    b.id = "btn-cuenta";
    b.className = "ghost";
    b.textContent = "⚙️ Mi cuenta";
    acc.insertBefore(b, $("tema") || null);
  }
}

function abrirCuenta() {
  if (!usuarioActual) return;
  const usuarios = leerUsuarios();
  const u = tiene(usuarios, usuarioActual) ? usuarios[usuarioActual] : null;
  if (!u) return;
  $("cuenta-user").value = u.nombre;
  ["cuenta-pass", "cuenta-nueva", "cuenta-nueva2"].forEach((id) => { $(id).value = ""; });
  limpiarMensaje("msg-cuenta");
  if (usuarioActual === USUARIO_DEMO)
    mostrarMensaje("msg-cuenta", "La cuenta de prueba no se puede modificar. Crea tu propia cuenta.", "alerta");
  $("modal-cuenta").hidden = false;
  $("cuenta-user").focus();
}

function cerrarCuenta() {
  const m = $("modal-cuenta");
  if (m) m.hidden = true;
}

function moverDatos(kViejo, kNuevo) {
  ["mant", "sens"].forEach((tipo) => {
    try {
      const v = localStorage.getItem(claveDatosDe(tipo, kViejo));
      if (v !== null) localStorage.setItem(claveDatosDe(tipo, kNuevo), v);
      localStorage.removeItem(claveDatosDe(tipo, kViejo));
    } catch (e) {}
  });
}

async function procesarCuenta() {
  if (!usuarioActual) return;
  if (usuarioActual === USUARIO_DEMO)
    return mostrarMensaje("msg-cuenta", "La cuenta de prueba no se puede modificar.", "error");

  const usuarios = leerUsuarios();
  const actual = tiene(usuarios, usuarioActual) ? usuarios[usuarioActual] : null;
  if (!actual) return mostrarMensaje("msg-cuenta", "No se encontró la cuenta.", "error");

  const nombre = $("cuenta-user").value.trim();
  const claveActual = $("cuenta-pass").value;
  const nueva = $("cuenta-nueva").value;
  const nueva2 = $("cuenta-nueva2").value;
  const kNuevo = nombre.toLowerCase();

  if (!REGEX_USUARIO.test(nombre))
    return mostrarMensaje("msg-cuenta", "Usuario de 3 a 20 caracteres: letras, números o _.", "error");
  if (claveActual === "")
    return mostrarMensaje("msg-cuenta", "Escribe tu contraseña actual para confirmar.", "error");
  if (!(await claveCorrecta(actual, claveActual)))
    return mostrarMensaje("msg-cuenta", "La contraseña actual es incorrecta.", "error");

  if (nueva !== "" || nueva2 !== "") {
    if (nueva.length < 6)
      return mostrarMensaje("msg-cuenta", "La nueva contraseña debe tener al menos 6 caracteres.", "error");
    if (nueva !== nueva2)
      return mostrarMensaje("msg-cuenta", "Las nuevas contraseñas no coinciden.", "error");
  }

  const renombra = kNuevo !== usuarioActual;
  if (renombra) {
    if (RESERVADOS.includes(kNuevo) || kNuevo === USUARIO_DEMO)
      return mostrarMensaje("msg-cuenta", "Ese nombre de usuario no está permitido.", "error");
    if (tiene(usuarios, kNuevo))
      return mostrarMensaje("msg-cuenta", "Ese usuario ya existe.", "error");
  }

  const cambiaNombre = nombre !== actual.nombre;
  const cambiaClave = nueva !== "";
  if (!renombra && !cambiaNombre && !cambiaClave)
    return mostrarMensaje("msg-cuenta", "No hay cambios para guardar.", "alerta");

  const registro = { nombre: nombre, sal: actual.sal, hash: actual.hash };
  if (cambiaClave) {
    registro.sal = nuevaSal();
    registro.hash = await hashClave(nueva, registro.sal);
  }

  const viejo = usuarioActual;
  if (renombra) delete usuarios[viejo];
  usuarios[kNuevo] = registro;
  if (!guardarUsuarios(usuarios))
    return mostrarMensaje("msg-cuenta", "No se pudieron guardar los cambios (almacenamiento bloqueado).", "error");

  if (renombra) {
    guardar();                  // asegura que los datos actuales estén guardados
    moverDatos(viejo, kNuevo);  // los registros pasan al nuevo usuario
    usuarioActual = kNuevo;
    try { sessionStorage.setItem("simtele_sesion", kNuevo); } catch (e) {}
  }
  actualizarCabecera();
  cerrarCuenta();
  toast("Cuenta actualizada", "ok");
}

async function enviarCuenta(e) {
  e.preventDefault();
  const btn = $("cuenta-guardar");
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    await procesarCuenta();
  } catch (err) {
    console.error(err);
    mostrarMensaje("msg-cuenta", "Ocurrió un error. Intenta de nuevo.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function eliminarCuenta() {
  if (!usuarioActual) return;
  if (usuarioActual === USUARIO_DEMO)
    return mostrarMensaje("msg-cuenta", "La cuenta de prueba no se puede eliminar.", "error");

  const usuarios = leerUsuarios();
  const actual = tiene(usuarios, usuarioActual) ? usuarios[usuarioActual] : null;
  if (!actual) return;

  const clave = $("cuenta-pass").value;
  if (clave === "")
    return mostrarMensaje("msg-cuenta", "Escribe tu contraseña actual para eliminar la cuenta.", "error");
  if (!(await claveCorrecta(actual, clave)))
    return mostrarMensaje("msg-cuenta", "La contraseña actual es incorrecta.", "error");
  if (!confirm("¿Eliminar la cuenta '" + actual.nombre + "' y todos sus registros? No se puede deshacer.")) return;

  const k = usuarioActual;
  delete usuarios[k];
  guardarUsuarios(usuarios);
  ["mant", "sens"].forEach((tipo) => {
    try { localStorage.removeItem(claveDatosDe(tipo, k)); } catch (e) {}
  });
  cerrarSesion();
  toast("Cuenta eliminada", "alerta");
}

// ---------- Módulo 1: Detención ----------
function calcularDetencion(e) {
  e.preventDefault();
  const vTxt = $("velocidad").value, tTxt = $("tiempo").value;

  if (vTxt.trim() === "" || tTxt.trim() === "")
    return mostrarMensaje("msg-detencion", "Completa velocidad y tiempo.", "error");
  const v = parseFloat(vTxt), t = parseFloat(tTxt);
  if (!esNumero(vTxt) || !esNumero(tTxt) || isNaN(v) || isNaN(t))
    return mostrarMensaje("msg-detencion", "Ingresa solo valores numéricos.", "error");
  if (v < 1 || v > 100)
    return mostrarMensaje("msg-detencion", "La velocidad debe estar entre 1 y 100 km/h.", "error");
  if (t < 0.1 || t > 10)
    return mostrarMensaje("msg-detencion", "El tiempo debe estar entre 0.1 y 10 s.", "error");

  const d = Number(((v / 3.6) * t).toFixed(2));
  const supera = d > UMBRAL_DISTANCIA;
  const barra = $("medidor-barra");
  barra.style.width = Math.min((d / (UMBRAL_DISTANCIA * 2)) * 100, 100) + "%";
  barra.style.background = supera ? "var(--warn)" : "var(--ok)";
  $("k-dist").textContent = d;

  mostrarMensaje("msg-detencion",
    supera
      ? `Distancia en reacción: ${d} m. ALERTA (simulación): supera el umbral ficticio de ${UMBRAL_DISTANCIA} m.`
      : `Distancia en reacción: ${d} m. Dentro del umbral ficticio de ${UMBRAL_DISTANCIA} m.`,
    supera ? "alerta" : "ok");
}

// ---------- Módulo 2: Mantenimiento ----------
function renderMantenimiento() {
  const tbody = $("tbody-mant");
  if (!tbody) { actualizarKpis(); return; }
  tbody.innerHTML = "";
  if (mantenimiento.length === 0) filaVacia(tbody, 4, "Aún no hay registros.");

  mantenimiento.forEach(function (r) {
    const tr = document.createElement("tr");
    if (r.id === editandoMant) tr.className = "editando";

    [r.componente, r.horas].forEach(function (dato) {
      const td = document.createElement("td");
      td.textContent = dato;
      tr.appendChild(td);
    });

    const tdEst = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "badge b-" + r.estado;
    badge.textContent = ESTADOS[r.estado] || r.estado;
    tdEst.appendChild(badge);
    tr.appendChild(tdEst);

    const tdAcc = document.createElement("td");
    const acc = document.createElement("div");
    acc.className = "acc";
    acc.appendChild(botonAccion("Editar", "btn-editar", () => editarMantenimiento(r.id)));
    acc.appendChild(botonAccion("Eliminar", "btn-eliminar", () => eliminarMantenimiento(r.id)));
    tdAcc.appendChild(acc);
    tr.appendChild(tdAcc);
    tbody.appendChild(tr);
  });
  actualizarKpis();
}

function guardarMantenimiento(e) {
  e.preventDefault();
  const componente = $("componente").value.trim();
  const horasTxt = $("horas").value;
  const estado = $("estado").value;

  if (componente === "")
    return mostrarMensaje("msg-mant", "El componente no puede estar vacío.", "error");
  if (!esNumero(horasTxt))
    return mostrarMensaje("msg-mant", "Las horas deben ser un número.", "error");
  const horas = parseFloat(horasTxt);
  if (horas < 0 || horas > 100000)
    return mostrarMensaje("msg-mant", "Las horas deben estar entre 0 y 100000.
