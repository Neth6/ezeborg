const UMBRAL_DISTANCIA = 50; // metros (ficticio)
const REGEX_SENSOR = /^SEN-\d{3}$/;
const ESTADOS = { normal: "Normal", revision: "Revisión", urgente: "Urgente" };

let mantenimiento = []; // [{id, componente, horas, estado}]
let sensores = [];      // [{codigo, tipo, lectura}]
let siguienteId = 1;

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
  if (tipo === "error") toast(texto, "error");
}

function guardar() {
  try {
    localStorage.setItem("simtele_mant", JSON.stringify(mantenimiento));
    localStorage.setItem("simtele_sens", JSON.stringify(sensores));
  } catch (e) { /* la página sigue funcionando sin localStorage */ }
}

function cargar() {
  try {
    mantenimiento = JSON.parse(localStorage.getItem("simtele_mant")) || [];
    sensores = JSON.parse(localStorage.getItem("simtele_sens")) || [];
  } catch (e) { mantenimiento = []; sensores = []; }
  siguienteId = mantenimiento.reduce((m, r) => Math.max(m, r.id), 0) + 1;
}

function actualizarKpis() {
  $("k-mant").textContent = mantenimiento.length;
  $("k-urg").textContent = mantenimiento.filter((r) => r.estado === "urgente").length + " urgentes";
  $("k-sens").textContent = sensores.length;
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
    const btn = document.createElement("button");
    btn.textContent = "Eliminar";
    btn.className = "btn-eliminar";
    btn.addEventListener("click", () => eliminarMantenimiento(r.id));
    tdAcc.appendChild(btn);
    tr.appendChild(tdAcc);
    tbody.appendChild(tr);
  });
  actualizarKpis();
}

function agregarMantenimiento(e) {
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

  mantenimiento.push({ id: siguienteId++, componente, horas, estado });
  e.target.reset();
  renderMantenimiento();
  guardar();
  mostrarMensaje("msg-mant", "Registro agregado.", "ok");
  toast("Componente agregado", "ok");
}

function eliminarMantenimiento(id) {
  mantenimiento = mantenimiento.filter((r) => r.id !== id);
  renderMantenimiento();
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
  if (sensores.length === 0) filaVacia(tbody, 3, "Aún no hay sensores válidos.");
  sensores.forEach(function (s) {
    const tr = document.createElement("tr");
    [s.codigo, s.tipo, s.lectura].forEach(function (dato) {
      const td = document.createElement("td");
      td.textContent = dato;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  actualizarKpis();
}

function registrarSensor(e) {
  e.preventDefault();
  const codigo = $("codigo").value.trim();
  const tipo = $("tipo").value;
  const lecturaTxt = $("lectura").value;

  if (codigo === "")
    return mostrarMensaje("msg-sensor", "El código no puede estar vacío.", "error");
  if (!REGEX_SENSOR.test(codigo))
    return mostrarMensaje("msg-sensor", "Código inválido. Formato esperado: SEN-001.", "error");
  if (lecturaTxt.trim() === "")
    return mostrarMensaje("msg-sensor", "La lectura no puede estar vacía.", "error");
  if (!esNumero(lecturaTxt))
    return mostrarMensaje("msg-sensor", "La lectura debe ser numérica.", "error");

  sensores.push({ codigo, tipo, lectura: parseFloat(lecturaTxt) });
  e.target.reset();
  renderSensores();
  guardar();
  mostrarMensaje("msg-sensor", `Sensor ${codigo} registrado.`, "ok");
  toast("Sensor registrado", "ok");
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
  if (!confirm("¿Borrar todos los registros guardados?")) return;
  mantenimiento = []; sensores = [];
  guardar(); renderMantenimiento(); renderSensores();
  toast("Datos reiniciados", "alerta");
}

// ---------- Inicio ----------
document.addEventListener("DOMContentLoaded", function () {
  cargar();
  let oscuro = false;
  try { oscuro = localStorage.getItem("simtele_tema") === "dark"; } catch (e) {}
  aplicarTema(oscuro);

  renderMantenimiento();
  renderSensores();
  activarMenu();

  $("form-detencion").addEventListener("submit", calcularDetencion);
  $("form-mant").addEventListener("submit", agregarMantenimiento);
  $("form-viento").addEventListener("submit", analizarViento);
  $("form-sensor").addEventListener("submit", registrarSensor);
  $("tema").addEventListener("click", () => aplicarTema(document.documentElement.getAttribute("data-theme") !== "dark"));
  $("reset").addEventListener("click", reiniciar);
});