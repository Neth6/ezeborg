const UMBRAL_DISTANCIA = 50; // metros (ficticio)
const REGEX_SENSOR = /^SEN-\d{3}$/;
const REGEX_USUARIO = /^[A-Za-z0-9_]{3,20}$/;
const ESTADOS = { normal: "Normal", revision: "Revisión", urgente: "Urgente" };

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

function toast(texto, tipo) {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.textContent = texto;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function mostrarMensaje(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto;
  el.className = "mensaje " + tipo;
  if (tipo === "error" && id !== "msg-auth") toast(texto, "error");
}

function limpiarMensaje(id) {
  $(id).textContent = "";
  $(id).className = "mensaje";
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
function claveDatos(tipo) { return "simtele_" + tipo + "_" + usuarioActual; }

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

  let n = mantenimiento.reduce((m, r) => Math.max(m, r.id || 0), 0);
  mantenimiento.forEach((r) => { if (!r.id) r.id = ++n; });
  siguienteId = n + 1;

  let s = sensores.reduce((m, r) => Math.max(m, r.id || 0), 0);
  sensores.forEach((r) => { if (!r.id) r.id = ++s; });
  siguienteSensor = s + 1;
}

function actualizarKpis() {
  $("k-mant").textContent = mantenimiento.length;
  $("k-urg").textContent = mantenimiento.filter((r) => r.estado === "urgente").length + " urgentes";
  $("k-sens").textContent = sensores.length;
}

// ---------- Autenticación (simulada en el navegador) ----------
function leerUsuarios() {
  try { return JSON.parse(localStorage.getItem("simtele_usuarios")) || {}; }
  catch (e) { return {}; }
}

function guardarUsuarios(u) {
  try { localStorage.setItem("simtele_usuarios", JSON.stringify(u)); } catch (e) {}
}

function nuevaSal() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// SHA-256 con sal. Si el navegador no lo permite, usa un respaldo simple (solo didáctico).
async function hashClave(clave, sal) {
  const texto = sal + ":" + clave;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return "d" + (h >>> 0).toString(16);
}

async function sembrarDemo() {
  const usuarios = leerUsuarios();
  if (usuarios.demo) return;
  const sal = nuevaSal();
  usuarios.demo = { nombre: "demo", sal: sal, hash: await hashClave("demo123", sal) };
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

async function enviarAuth(e) {
  e.preventDefault();
  const usuario = $("auth-user").value.trim();
  const clave = $("auth-pass").value;
  const usuarios = leerUsuarios();
  const k = usuario.toLowerCase();

  if (usuario === "" || clave === "")
    return mostrarMensaje("msg-auth", "Completa usuario y contraseña.", "error");

  if (modoRegistro) {
    if (!REGEX_USUARIO.test(usuario))
      return mostrarMensaje("msg-auth", "Usuario de 3 a 20 caracteres: letras, números o _.", "error");
    if (clave.length < 6)
      return mostrarMensaje("msg-auth", "La contraseña debe tener al menos 6 caracteres.", "error");
    if (clave !== $("auth-pass2").value)
      return mostrarMensaje("msg-auth", "Las contraseñas no coinciden.", "error");
    if (usuarios[k])
      return mostrarMensaje("msg-auth", "Ese usuario ya existe.", "error");

    const sal = nuevaSal();
    usuarios[k] = { nombre: usuario, sal: sal, hash: await hashClave(clave, sal) };
    guardarUsuarios(usuarios);
    entrar(k, false);
    toast("Cuenta creada", "ok");
  } else {
    const u = usuarios[k];
    if (!u || u.hash !== await hashClave(clave, u.sal))
      return mostrarMensaje("msg-auth", "Usuario o contraseña incorrectos.", "error");
    entrar(k, false);
  }
}

function entrar(k, silencioso) {
  usuarioActual = k;
  try { sessionStorage.setItem("simtele_sesion", k); } catch (e) {}
  const u = leerUsuarios()[k];
  $("usuario").textContent = "👤 " + (u ? u.nombre : k);
  $("usuario").hidden = false;

  cargar();
  renderMantenimiento();
  renderSensores();
  document.body.classList.remove("bloqueado");
  $("form-auth").reset();
  cambiarModo(false);
  window.scrollTo(0, 0);
  if (!silencioso) toast("Bienvenido, " + (u ? u.nombre : k), "ok");
}

function limpiarPanel() {
  ["form-detencion", "form-viento"].forEach((id) => $(id).reset());
  ["msg-detencion", "msg-mant", "msg-viento", "msg-sensor"].forEach(limpiarMensaje);
  $("medidor-barra").style.width = "0";
  $("barras").innerHTML = "";
  $("k-dist").textContent = "—";
  $("k-viento").textContent = "—";
}

function cerrarSesion() {
  try { sessionStorage.removeItem("simtele_sesion"); } catch (e) {}
  usuarioActual = null;
  mantenimiento = [];
  sensores = [];
  salirEdicionMant();
  salirEdicionSensor();
  limpiarPanel();
  $("usuario").hidden = true;
  document.body.classList.add("bloqueado");
  window.scrollTo(0, 0);
  toast("Sesión cerrada", "alerta");
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
    return mostrarMensaje("msg-mant", "Las horas deben estar entre 0 y 100000.", "error");

  if (editandoMant !== null) {
    const r = mantenimiento.find((x) => x.id === editandoMant);
    if (r) { r.componente = componente; r.horas = horas; r.estado = estado; }
    salirEdicionMant();
    guardar();
    mostrarMensaje("msg-mant", "Registro actualizado.", "ok");
    toast("Cambios guardados", "ok");
  } else {
    mantenimiento.push({ id: siguienteId++, componente, horas, estado });
    $("form-mant").reset();
    renderMantenimiento();
    guardar();
    mostrarMensaje("msg-mant", "Registro agregado.", "ok");
    toast("Componente agregado", "ok");
  }
}

function editarMantenimiento(id) {
  const r = mantenimiento.find((x) => x.id === id);
  if (!r) return;
  editandoMant = id;
  $("componente").value = r.componente;
  $("horas").value = r.horas;
  $("estado").value = r.estado;
  $("btn-mant").textContent = "Guardar cambios";
  $("cancel-mant").hidden = false;
  $("modo-mant").textContent = "✏️ Editando: " + r.componente;
  $("modo-mant").hidden = false;
  limpiarMensaje("msg-mant");
  renderMantenimiento();
  $("form-mant").scrollIntoView({ behavior: "smooth", block: "center" });
  $("componente").focus();
}

function salirEdicionMant() {
  editandoMant = null;
  $("form-mant").reset();
  $("btn-mant").textContent = "Agregar registro";
  $("cancel-mant").hidden = true;
  $("modo-mant").hidden = true;
  renderMantenimiento();
}

function eliminarMantenimiento(id) {
  if (!confirm("¿Eliminar este registro?")) return;
  mantenimiento = mantenimiento.filter((r) => r.id !== id);
  if (editandoMant === id) salirEdicionMant(); else renderMantenimiento();
  guardar();
  mostrarMensaje("msg-mant", "Registro eliminado.", "ok");
}

// ---------- Módulo 3: Viento ----------
function clasificarViento(prom) {
  if (prom < 20) return "Calma";
  if (prom < 40) return "Moderado";
  return "Fuerte";
}

function dibujarBarras(valores, max) {
  const cont = $("barras");
  cont.innerHTML = "";
  valores.forEach(function (v) {
    const b = document.createElement("div");
    b.className = "barra" + (v === max ? " max" : "");
    b.style.height = Math.max((v / max) * 100, 4) + "%";
    const num = document.createElement("b");
    num.textContent = v;
    b.appendChild(num);
    cont.appendChild(b);
  });
}

function analizarViento(e) {
  e.preventDefault();
  const campos = document.querySelectorAll(".viento");
  const valores = [];

  for (let i = 0; i < campos.length; i++) {
    const txt = campos[i].value;
    if (txt.trim() === "")
      return mostrarMensaje("msg-viento", `Completa las 5 mediciones (falta la ${i + 1}).`, "error");
    if (!esNumero(txt))
      return mostrarMensaje("msg-viento", `La medición ${i + 1} no es numérica.`, "error");
    const n = parseFloat(txt);
    if (n < 0 || n > 200)
      return mostrarMensaje("msg-viento", `La medición ${i + 1} debe estar entre 0 y 200.`, "error");
    valores.push(n);
  }

  let suma = 0, max = valores[0];
  valores.forEach(function (v) { suma += v; if (v > max) max = v; });
  const prom = suma / valores.length;
  const clase = clasificarViento(prom);

  dibujarBarras(valores, max || 1);
  $("k-viento").textContent = prom;
  mostrarMensaje("msg-viento",
    `Promedio: ${prom} km/h · Máximo: ${max} km/h · Clasificación (simulada): ${clase}`,
    clase === "Fuerte" ? "alerta" : "ok");
}

// ---------- Módulo 4: Sensores ----------
function renderSensores() {
  const tbody = $("tbody-sensor");
  tbody.innerHTML = "";
  if (sensores.length === 0) filaVacia(tbody, 4, "Aún no hay sensores válidos.");

  sensores.forEach(function (s) {
    const tr = document.createElement("tr");
    if (s.id === editandoSensor) tr.className = "editando";

    [s.codigo, s.tipo, s.lectura].forEach(function (dato) {
      const td = document.createElement("td");
      td.textContent = dato;
      tr.appendChild(td);
    });

    const tdAcc = document.createElement("td");
    const acc = document.createElement("div");
    acc.className = "acc";
    acc.appendChild(botonAccion("Editar", "btn-editar", () => editarSensor(s.id)));
    acc.appendChild(botonAccion("Eliminar", "btn-eliminar", () => eliminarSensor(s.id)));
    tdAcc.appendChild(acc);
    tr.appendChild(tdAcc);
    tbody.appendChild(tr);
  });
  actualizarKpis();
}

function guardarSensor(e) {
  e.preventDefault();
  const codigo = $("codigo").value.trim();
  const tipo = $("tipo").value;
  const lecturaTxt = $("lectura").value;

  if (codigo === "")
    return mostrarMensaje("msg-sensor", "El código no puede estar vacío.", "error");
  if (!REGEX_SENSOR.test(codigo))
    return mostrarMensaje("msg-sensor", "Código inválido. Formato esperado: SEN-001.", "error");
  if (sensores.some((s) => s.codigo === codigo && s.id !== editandoSensor))
    return mostrarMensaje("msg-sensor", "Ese código de sensor ya está registrado.", "error");
  if (lecturaTxt.trim() === "")
    return mostrarMensaje("msg-sensor", "La lectura no puede estar vacía.", "error");
  if (!esNumero(lecturaTxt))
    return mostrarMensaje("msg-sensor", "La lectura debe ser numérica.", "error");
  const lectura = parseFloat(lecturaTxt);

  if (editandoSensor !== null) {
    const s = sensores.find((x) => x.id === editandoSensor);
    if (s) { s.codigo = codigo; s.tipo = tipo; s.lectura = lectura; }
    salirEdicionSensor();
    guardar();
    mostrarMensaje("msg-sensor", `Sensor ${codigo} actualizado.`, "ok");
    toast("Cambios guardados", "ok");
  } else {
    sensores.push({ id: siguienteSensor++, codigo, tipo, lectura });
    $("form-sensor").reset();
    renderSensores();
    guardar();
    mostrarMensaje("msg-sensor", `Sensor ${codigo} registrado.`, "ok");
    toast("Sensor registrado", "ok");
  }
}

function editarSensor(id) {
  const s = sensores.find((x) => x.id === id);
  if (!s) return;
  editandoSensor = id;
  $("codigo").value = s.codigo;
  $("tipo").value = s.tipo;
  $("lectura").value = s.lectura;
  $("btn-sensor").textContent = "Guardar cambios";
  $("cancel-sensor").hidden = false;
  $("modo-sensor").textContent = "✏️ Editando: " + s.codigo;
  $("modo-sensor").hidden = false;
  limpiarMensaje("msg-sensor");
  renderSensores();
  $("form-sensor").scrollIntoView({ behavior: "smooth", block: "center" });
  $("codigo").focus();
}

function salirEdicionSensor() {
  editandoSensor = null;
  $("form-sensor").reset();
  $("btn-sensor").textContent = "Registrar sensor";
  $("cancel-sensor").hidden = true;
  $("modo-sensor").hidden = true;
  renderSensores();
}

function eliminarSensor(id) {
  if (!confirm("¿Eliminar este sensor?")) return;
  sensores = sensores.filter((s) => s.id !== id);
  if (editandoSensor === id) salirEdicionSensor(); else renderSensores();
  guardar();
  mostrarMensaje("msg-sensor", "Sensor eliminado.", "ok");
}

// ---------- Interfaz: tema, menú activo, reinicio ----------
function aplicarTema(oscuro) {
  document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
  $("tema").textContent = oscuro ? "☀️ Modo claro" : "🌙 Modo oscuro";
  try { localStorage.setItem("simtele_tema", oscuro ? "dark" : "light"); } catch (e) {}
}

function activarMenu() {
  const enlaces = document.querySelectorAll("#menu a");
  const obs = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (en) {
      if (en.isIntersecting) {
        enlaces.forEach((a) => a.classList.toggle("activo", a.getAttribute("href") === "#" + en.target.id));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  document.querySelectorAll("main section").forEach((s) => obs.observe(s));
}

function reiniciar() {
  if (!confirm("¿Borrar todos tus registros guardados?")) return;
  mantenimiento = [];
  sensores = [];
  guardar();
  salirEdicionMant();
  salirEdicionSensor();
  toast("Datos reiniciados", "alerta");
}

// ---------- Inicio ----------
document.addEventListener("DOMContentLoaded", async function () {
  let oscuro = false;
  try { oscuro = localStorage.getItem("simtele_tema") === "dark"; } catch (e) {}
  aplicarTema(oscuro);

  renderMantenimiento();
  renderSensores();
  activarMenu();

  $("form-auth").addEventListener("submit", enviarAuth);
  $("tab-login").addEventListener("click", () => cambiarModo(false));
  $("tab-registro").addEventListener("click", () => cambiarModo(true));
  $("logout").addEventListener("click", cerrarSesion);

  $("form-detencion").addEventListener("submit", calcularDetencion);
  $("form-mant").addEventListener("submit", guardarMantenimiento);
  $("form-viento").addEventListener("submit", analizarViento);
  $("form-sensor").addEventListener("submit", guardarSensor);
  $("cancel-mant").addEventListener("click", () => { salirEdicionMant(); limpiarMensaje("msg-mant"); });
  $("cancel-sensor").addEventListener("click", () => { salirEdicionSensor(); limpiarMensaje("msg-sensor"); });

  $("tema").addEventListener("click", () => aplicarTema(document.documentElement.getAttribute("data-theme") !== "dark"));
  $("reset").addEventListener("click", reiniciar);

  await sembrarDemo();

  // Restaurar sesión si la pestaña sigue abierta
  let k = null;
  try { k = sessionStorage.getItem("simtele_sesion"); } catch (e) {}
  if (k && leerUsuarios()[k]) entrar(k, true);
});
