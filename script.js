// SIMTELE-WEB - Sistema educativo de monitoreo
const UMBRAL_DISTANCIA=50;
const REGEX_SENSOR=/^SEN-\d{3}$/;
const REGEX_USUARIO=/^[A-Za-z0-9_]{3,20}$/;
const ESTADOS={normal:"Normal",revision:"Revisión",urgente:"Urgente"};
const $=id=>document.getElementById(id);
let usuarioActual=null,modoRegistro=false,mantenimiento=[],sensores=[];
let siguienteId=1,siguienteSensor=1,editandoMant=null,editandoSensor=null;

function toast(texto,tipo="ok"){
  const t=document.createElement("div");t.className="toast "+tipo;t.textContent=texto;
  $("toasts").appendChild(t);setTimeout(()=>t.remove(),3000);
}
function mostrarMensaje(id,texto,tipo){
  const el=$(id);el.textContent=texto;el.className="mensaje "+tipo;
  if(tipo==="error"&&id!=="msg-auth")toast(texto,"error");
}
function limpiarMensaje(id){$(id).textContent="";$(id).className="mensaje";}
function esNumero(t){return String(t).trim()!==""&&Number.isFinite(Number(t));}
function validarClave(c){return c.length>=8&&/[A-Za-z]/.test(c)&&/\d/.test(c)&&/[^A-Za-z0-9]/.test(c);}
function botonAccion(texto,clase,fn){
  const b=document.createElement("button");b.type="button";b.textContent=texto;b.className=clase;b.addEventListener("click",fn);return b;
}
function filaVacia(tbody,columnas,texto){
  const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=columnas;td.className="vacio";td.textContent=texto;tr.appendChild(td);tbody.appendChild(tr);
}

// Usuarios y datos locales
function leerUsuarios(){try{return JSON.parse(localStorage.getItem("simtele_usuarios"))||{};}catch{return {};}}
function guardarUsuarios(u){localStorage.setItem("simtele_usuarios",JSON.stringify(u));}
function claveDatos(tipo,usuario=usuarioActual){return "simtele_"+tipo+"_"+usuario;}
function guardar(){
  if(!usuarioActual)return;
  try{
    localStorage.setItem(claveDatos("mant"),JSON.stringify(mantenimiento));
    localStorage.setItem(claveDatos("sens"),JSON.stringify(sensores));
  }catch{toast("No se pudieron guardar los datos.","error");}
}
function cargar(){
  try{
    mantenimiento=JSON.parse(localStorage.getItem(claveDatos("mant")))||[];
    sensores=JSON.parse(localStorage.getItem(claveDatos("sens")))||[];
  }catch{mantenimiento=[];sensores=[];}
  let mm=0,ms=0;
  mantenimiento.forEach(r=>{if(!r.id)r.id=++mm;mm=Math.max(mm,r.id);});
  sensores.forEach(s=>{if(!s.id)s.id=++ms;ms=Math.max(ms,s.id);});
  siguienteId=mm+1;siguienteSensor=ms+1;
}
function moverDatosUsuario(origen,destino){
  ["mant","sens"].forEach(tipo=>{
    const v=localStorage.getItem(claveDatos(tipo,origen));
    if(v!==null){localStorage.setItem(claveDatos(tipo,destino),v);localStorage.removeItem(claveDatos(tipo,origen));}
  });
}

// Hash de contraseña: SHA-256 cuando Web Crypto está disponible.
// El modo de respaldo es solo demostrativo; no usar para producción.
function nuevaSal(){
  const bytes=new Uint8Array(16);
  if(window.crypto&&crypto.getRandomValues){crypto.getRandomValues(bytes);return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
  return Math.random().toString(36).slice(2)+Date.now();
}
async function hashClave(clave,sal){
  const texto=sal+":"+clave;
  if(window.crypto&&crypto.subtle){
    const buffer=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  let h=5381;for(let i=0;i<texto.length;i++)h=((h<<5)+h+texto.charCodeAt(i))|0;
  return "respaldo-"+(h>>>0).toString(16);
}
async function sembrarAdmin(){
  const u=leerUsuarios();if(u.admin)return;
  const sal=nuevaSal();u.admin={nombre:"admin",sal,hash:await hashClave("Admin123!",sal),rol:"admin"};guardarUsuarios(u);
}

// Autenticación
function cambiarModo(registro){
  modoRegistro=registro;$("tab-login").classList.toggle("activo",!registro);$("tab-registro").classList.toggle("activo",registro);
  $("campo-pass2").hidden=!registro;$("auth-submit").textContent=registro?"Crear cuenta":"Entrar";
  $("auth-pass").autocomplete=registro?"new-password":"current-password";limpiarMensaje("msg-auth");
}
async function enviarAuth(e){
  e.preventDefault();
  const nombre=$("auth-user").value.trim(),clave=$("auth-pass").value,usuarios=leerUsuarios(),k=nombre.toLowerCase();
  if(!nombre||!clave)return mostrarMensaje("msg-auth","Completa usuario y contraseña.","error");
  if(modoRegistro){
    if(!REGEX_USUARIO.test(nombre))return mostrarMensaje("msg-auth","El usuario debe tener entre 3 y 20 caracteres. Usa letras, números o _.","error");
    if(!validarClave(clave))return mostrarMensaje("msg-auth","La contraseña necesita 8 caracteres, letras, números y un carácter especial.","error");
    if(clave!==$("auth-pass2").value)return mostrarMensaje("msg-auth","Las contraseñas no coinciden.","error");
    if(usuarios[k])return mostrarMensaje("msg-auth","Ese usuario ya existe.","error");
    const sal=nuevaSal();usuarios[k]={nombre,sal,hash:await hashClave(clave,sal),rol:"usuario"};guardarUsuarios(usuarios);entrar(k);toast("Cuenta creada correctamente");
  }else{
    const u=usuarios[k];
    if(!u||u.hash!==await hashClave(clave,u.sal))return mostrarMensaje("msg-auth","Usuario o contraseña incorrectos.","error");
    entrar(k);
  }
}
function entrar(k,silencioso=false){
  const u=leerUsuarios()[k];if(!u)return;
  usuarioActual=k;sessionStorage.setItem("simtele_sesion",k);
  $("usuario").textContent=(u.rol==="admin"?"🛡️ ":"👤 ")+u.nombre;$("usuario").hidden=false;
  $("link-admin").hidden=u.rol!=="admin";$("administracion").hidden=u.rol!=="admin";
  cargar();renderMantenimiento();renderSensores();
  $("perfil-user").value=u.nombre;$("perfil-pass").value="";$("perfil-pass2").value="";
  document.body.classList.remove("bloqueado");$("form-auth").reset();cambiarModo(false);
  if(u.rol==="admin")renderUsuarios();window.scrollTo(0,0);
  if(!silencioso)toast("Bienvenido, "+u.nombre);
}
function cerrarSesion(){
  sessionStorage.removeItem("simtele_sesion");usuarioActual=null;mantenimiento=[];sensores=[];
  salirEdicionMant();salirEdicionSensor();$("usuario").hidden=true;$("link-admin").hidden=true;$("administracion").hidden=true;
  $("form-auth").reset();document.body.classList.add("bloqueado");window.scrollTo(0,0);toast("Sesión cerrada","alerta");
}

// Perfil del usuario
async function actualizarPerfil(e){
  e.preventDefault();
  const nombre=$("perfil-user").value.trim(),pass=$("perfil-pass").value,pass2=$("perfil-pass2").value,usuarios=leerUsuarios(),u=usuarios[usuarioActual];
  if(!REGEX_USUARIO.test(nombre))return mostrarMensaje("msg-perfil","El usuario debe tener entre 3 y 20 caracteres.","error");
  if(pass&&!validarClave(pass))return mostrarMensaje("msg-perfil","La contraseña necesita 8 caracteres, letras, números y un carácter especial.","error");
  if(pass&&pass!==pass2)return mostrarMensaje("msg-perfil","Las contraseñas no coinciden.","error");
  const nuevaKey=nombre.toLowerCase(),antiguaKey=usuarioActual;
  if(nuevaKey!==antiguaKey&&usuarios[nuevaKey])return mostrarMensaje("msg-perfil","Ese usuario ya está ocupado.","error");
  if(pass){u.sal=nuevaSal();u.hash=await hashClave(pass,u.sal);}
  u.nombre=nombre;
  if(nuevaKey!==antiguaKey){delete usuarios[antiguaKey];usuarios[nuevaKey]=u;moverDatosUsuario(antiguaKey,nuevaKey);usuarioActual=nuevaKey;sessionStorage.setItem("simtele_sesion",nuevaKey);}
  guardarUsuarios(usuarios);$("usuario").textContent=(u.rol==="admin"?"🛡️ ":"👤 ")+u.nombre;
  $("perfil-user").value=u.nombre;$("perfil-pass").value="";$("perfil-pass2").value="";
  mostrarMensaje("msg-perfil","Tu cuenta se actualizó correctamente.","ok");toast("Perfil actualizado");
}

// Administración de usuarios
function renderUsuarios(){
  const tbody=$("tbody-usuarios");tbody.innerHTML="";const lista=Object.entries(leerUsuarios());
  if(!lista.length)return filaVacia(tbody,3,"No hay usuarios.");
  lista.forEach(([key,u])=>{
    const tr=document.createElement("tr"),a=document.createElement("td"),b=document.createElement("td"),c=document.createElement("td"),acciones=document.createElement("div");
    a.textContent=u.nombre;b.textContent=u.rol==="admin"?"Administrador":"Usuario";acciones.className="acc";
    acciones.appendChild(botonAccion("Editar","btn-editar",()=>editarUsuarioAdmin(key)));
    if(u.rol!=="admin")acciones.appendChild(botonAccion("Eliminar","btn-eliminar",()=>eliminarUsuarioAdmin(key)));
    c.appendChild(acciones);tr.append(a,b,c);tbody.appendChild(tr);
  });
}
function editarUsuarioAdmin(key){
  const u=leerUsuarios()[key];if(!u)return;
  $("admin-user-original").value=key;$("admin-user-nuevo").value=u.nombre;$("admin-pass-nueva").value="";
  $("editor-usuario").hidden=false;limpiarMensaje("msg-admin");
  $("editor-usuario").scrollIntoView({behavior:"smooth",block:"center"});
}
async function guardarUsuarioAdmin(e){
  e.preventDefault();
  const original=$("admin-user-original").value,nombre=$("admin-user-nuevo").value.trim(),clave=$("admin-pass-nueva").value,usuarios=leerUsuarios();
  if(!usuarios[original])return mostrarMensaje("msg-admin","El usuario ya no existe.","error");
  if(!REGEX_USUARIO.test(nombre))return mostrarMensaje("msg-admin","Nombre inválido. Usa entre 3 y 20 caracteres.","error");
  const nuevaKey=nombre.toLowerCase();
  if(nuevaKey!==original&&usuarios[nuevaKey])return mostrarMensaje("msg-admin","Ese nombre ya está ocupado.","error");
  if(clave&&!validarClave(clave))return mostrarMensaje("msg-admin","La nueva contraseña necesita letras, números y caracteres especiales (mínimo 8).","error");
  const u=usuarios[original];u.nombre=nombre;
  if(clave){u.sal=nuevaSal();u.hash=await hashClave(clave,u.sal);}
  if(nuevaKey!==original){delete usuarios[original];usuarios[nuevaKey]=u;moverDatosUsuario(original,nuevaKey);if(usuarioActual===original){usuarioActual=nuevaKey;sessionStorage.setItem("simtele_sesion",nuevaKey);}}
  guardarUsuarios(usuarios);$("editor-usuario").hidden=true;renderUsuarios();
  if(usuarioActual===nuevaKey){$("usuario").textContent="🛡️ "+nombre;$("perfil-user").value=nombre;}
  mostrarMensaje("msg-admin","Usuario actualizado correctamente.","ok");toast("Usuario actualizado");
}
function eliminarUsuarioAdmin(key){
  const usuarios=leerUsuarios(),u=usuarios[key];if(!u||u.rol==="admin")return;
  if(!confirm("¿Eliminar la cuenta de "+u.nombre+" y todos sus registros?"))return;
  delete usuarios[key];guardarUsuarios(usuarios);localStorage.removeItem(claveDatos("mant",key));localStorage.removeItem(claveDatos("sens",key));
  $("editor-usuario").hidden=true;renderUsuarios();toast("Cuenta eliminada","alerta");
}

// Detención
function calcularDetencion(e){
  e.preventDefault();const vt=$("velocidad").value,tt=$("tiempo").value;
  if(!esNumero(vt)||!esNumero(tt))return mostrarMensaje("msg-detencion","Completa los campos con valores numéricos.","error");
  const v=Number(vt),t=Number(tt);
  if(v<1||v>100)return mostrarMensaje("msg-detencion","La velocidad debe estar entre 1 y 100 km/h.","error");
  if(t<.1||t>10)return mostrarMensaje("msg-detencion","El tiempo debe estar entre 0.1 y 10 segundos.","error");
  const d=Number(((v/3.6)*t).toFixed(2)),supera=d>UMBRAL_DISTANCIA;
  $("medidor-barra").style.width=Math.min(d/(UMBRAL_DISTANCIA*2)*100,100)+"%";
  $("medidor-barra").style.background=supera?"var(--warn)":"var(--ok)";$("k-dist").textContent=d;
  mostrarMensaje("msg-detencion",supera?`Distancia: ${d} m. Supera el umbral ficticio de ${UMBRAL_DISTANCIA} m.`:`Distancia: ${d} m. Dentro del umbral ficticio.`,supera?"alerta":"ok");
}

// Mantenimiento
function renderMantenimiento(){
  const tbody=$("tbody-mant");tbody.innerHTML="";
  if(!mantenimiento.length)filaVacia(tbody,4,"Aún no hay registros.");
  mantenimiento.forEach(r=>{
    const tr=document.createElement("tr");if(r.id===editandoMant)tr.className="editando";
    const a=document.createElement("td"),b=document.createElement("td"),c=document.createElement("td"),d=document.createElement("td"),badge=document.createElement("span"),acc=document.createElement("div");
    a.textContent=r.componente;b.textContent=r.horas;badge.className="badge b-"+r.estado;badge.textContent=ESTADOS[r.estado]||r.estado;c.appendChild(badge);
    acc.className="acc";acc.append(botonAccion("Editar","btn-editar",()=>editarMantenimiento(r.id)),botonAccion("Eliminar","btn-eliminar",()=>eliminarMantenimiento(r.id)));d.appendChild(acc);
    tr.append(a,b,c,d);tbody.appendChild(tr);
  });actualizarKpis();
}
function guardarMantenimiento(e){
  e.preventDefault();const componente=$("componente").value.trim(),ht=$("horas").value,estado=$("estado").value;
  if(!componente)return mostrarMensaje("msg-mant","El componente no puede estar vacío.","error");
  if(!esNumero(ht))return mostrarMensaje("msg-mant","Las horas deben ser numéricas.","error");
  const horas=Number(ht);if(horas<0||horas>100000)return mostrarMensaje("msg-mant","Las horas deben estar entre 0 y 100000.","error");
  if(editandoMant!==null){
    const r=mantenimiento.find(x=>x.id===editandoMant);if(r)Object.assign(r,{componente,horas,estado});
    editandoMant=null;$("form-mant").reset();restaurarBotonMant();renderMantenimiento();guardar();mostrarMensaje("msg-mant","Registro actualizado.","ok");toast("Cambios guardados");
  }else{
    mantenimiento.push({id:siguienteId++,componente,horas,estado});$("form-mant").reset();renderMantenimiento();guardar();mostrarMensaje("msg-mant","Registro agregado.","ok");toast("Componente agregado");
  }
}
function editarMantenimiento(id){
  const r=mantenimiento.find(x=>x.id===id);if(!r)return;editandoMant=id;
  $("componente").value=r.componente;$("horas").value=r.horas;$("estado").value=r.estado;
  $("btn-mant").textContent="Guardar cambios";$("cancel-mant").hidden=false;$("modo-mant").textContent="✏️ Editando: "+r.componente;$("modo-mant").hidden=false;
  limpiarMensaje("msg-mant");renderMantenimiento();$("form-mant").scrollIntoView({behavior:"smooth",block:"center"});
}
function restaurarBotonMant(){$("btn-mant").textContent="Agregar registro";$("cancel-mant").hidden=true;$("modo-mant").hidden=true;}
function salirEdicionMant(){editandoMant=null;if($("form-mant")){$("form-mant").reset();restaurarBotonMant();}if($("tbody-mant"))renderMantenimiento();}
function eliminarMantenimiento(id){
  if(!confirm("¿Eliminar este registro?"))return;mantenimiento=mantenimiento.filter(r=>r.id!==id);
  if(editandoMant===id)salirEdicionMant();else renderMantenimiento();guardar();mostrarMensaje("msg-mant","Registro eliminado.","ok");
}

// Viento
function clasificarViento(p){return p<20?"Calma":p<40?"Moderado":"Fuerte";}
function dibujarBarras(valores,max){
  const cont=$("barras");cont.innerHTML="";
  valores.forEach(v=>{const b=document.createElement("div");b.className="barra"+(v===max?" max":"");b.style.height=Math.max(v/max*100,4)+"%";const n=document.createElement("b");n.textContent=v;b.appendChild(n);cont.appendChild(b);});
}
function analizarViento(e){
  e.preventDefault();const campos=document.querySelectorAll(".viento"),valores=[];
  for(let i=0;i<campos.length;i++){
    if(!esNumero(campos[i].value))return mostrarMensaje("msg-viento",`La medición ${i+1} debe ser numérica.`,"error");
    const n=Number(campos[i].value);if(n<0||n>200)return mostrarMensaje("msg-viento",`La medición ${i+1} debe estar entre 0 y 200.`,"error");valores.push(n);
  }
  const prom=valores.reduce((a,b)=>a+b,0)/valores.length,max=Math.max(...valores),clase=clasificarViento(prom);
  dibujarBarras(valores,max||1);$("k-viento").textContent=prom.toFixed(2);
  mostrarMensaje("msg-viento",`Promedio: ${prom.toFixed(2)} km/h · Máximo: ${max} km/h · Clasificación simulada: ${clase}`,clase==="Fuerte"?"alerta":"ok");
}

// Sensores
function renderSensores(){
  const tbody=$("tbody-sensor");tbody.innerHTML="";if(!sensores.length)filaVacia(tbody,4,"Aún no hay sensores registrados.");
  sensores.forEach(s=>{
    const tr=document.createElement("tr");if(s.id===editandoSensor)tr.className="editando";
    const a=document.createElement("td"),b=document.createElement("td"),c=document.createElement("td"),d=document.createElement("td"),acc=document.createElement("div");
    a.textContent=s.codigo;b.textContent=s.tipo;c.textContent=s.lectura;acc.className="acc";
    acc.append(botonAccion("Editar","btn-editar",()=>editarSensor(s.id)),botonAccion("Eliminar","btn-eliminar",()=>eliminarSensor(s.id)));d.appendChild(acc);
    tr.append(a,b,c,d);tbody.appendChild(tr);
  });actualizarKpis();
}
function guardarSensor(e){
  e.preventDefault();const codigo=$("codigo").value.trim().toUpperCase(),tipo=$("tipo").value,lt=$("lectura").value;
  if(!REGEX_SENSOR.test(codigo))return mostrarMensaje("msg-sensor","Código inválido. Usa el formato SEN-001.","error");
  if(sensores.some(s=>s.codigo===codigo&&s.id!==editandoSensor))return mostrarMensaje("msg-sensor","Ese código ya está registrado.","error");
  if(!esNumero(lt))return mostrarMensaje("msg-sensor","La lectura debe ser numérica.","error");
  const lectura=Number(lt);
  if(editandoSensor!==null){
    const s=sensores.find(x=>x.id===editandoSensor);if(s)Object.assign(s,{codigo,tipo,lectura});
    editandoSensor=null;$("form-sensor").reset();restaurarBotonSensor();renderSensores();guardar();mostrarMensaje("msg-sensor",`Sensor ${codigo} actualizado.`,"ok");toast("Sensor actualizado");
  }else{
    sensores.push({id:siguienteSensor++,codigo,tipo,lectura});$("form-sensor").reset();renderSensores();guardar();mostrarMensaje("msg-sensor",`Sensor ${codigo} registrado.`,"ok");toast("Sensor registrado");
  }
}
function editarSensor(id){
  const s=sensores.find(x=>x.id===id);if(!s)return;editandoSensor=id;
  $("codigo").value=s.codigo;$("tipo").value=s.tipo;$("lectura").value=s.lectura;
  $("btn-sensor").textContent="Guardar cambios";$("cancel-sensor").hidden=false;$("modo-sensor").textContent="✏️ Editando: "+s.codigo;$("modo-sensor").hidden=false;
  limpiarMensaje("msg-sensor");renderSensores();$("form-sensor").scrollIntoView({behavior:"smooth",block:"center"});
}
function restaurarBotonSensor(){$("btn-sensor").textContent="Registrar sensor";$("cancel-sensor").hidden=true;$("modo-sensor").hidden=true;}
function salirEdicionSensor(){editandoSensor=null;if($("form-sensor")){$("form-sensor").reset();restaurarBotonSensor();}if($("tbody-sensor"))renderSensores();}
function eliminarSensor(id){
  if(!confirm("¿Eliminar este sensor?"))return;sensores=sensores.filter(s=>s.id!==id);
  if(editandoSensor===id)salirEdicionSensor();else renderSensores();guardar();mostrarMensaje("msg-sensor","Sensor eliminado.","ok");
}

// Indicadores, tema y reinicio
function actualizarKpis(){
  $("k-mant").textContent=mantenimiento.length;$("k-urg").textContent=mantenimiento.filter(r=>r.estado==="urgente").length+" urgentes";$("k-sens").textContent=sensores.length;
}
function aplicarTema(oscuro){
  document.documentElement.setAttribute("data-theme",oscuro?"dark":"light");$("tema").textContent=oscuro?"☀️ Modo claro":"🌙 Modo oscuro";
  localStorage.setItem("simtele_tema",oscuro?"dark":"light");
}
function activarMenu(){
  if(!("IntersectionObserver"in window))return;
  const enlaces=document.querySelectorAll("#menu a");
  const obs=new IntersectionObserver(entradas=>entradas.forEach(en=>{
    if(en.isIntersecting)enlaces.forEach(a=>a.classList.toggle("activo",a.getAttribute("href")==="#"+en.target.id));
  }),{rootMargin:"-40% 0px -55% 0px"});
  document.querySelectorAll("main section").forEach(s=>obs.observe(s));
}
function reiniciar(){
  if(!confirm("¿Borrar todos tus registros guardados?"))return;
  mantenimiento=[];sensores=[];guardar();salirEdicionMant();salirEdicionSensor();
  $("k-dist").textContent="—";$("k-viento").textContent="—";$("medidor-barra").style.width="0";$("barras").innerHTML="";
  limpiarMensaje("msg-detencion");limpiarMensaje("msg-viento");$("form-detencion").reset();$("form-viento").reset();toast("Datos reiniciados","alerta");
}
function configurarVerPassword(){
  document.querySelectorAll(".ver-pass").forEach(b=>b.addEventListener("click",()=>{
    const campo=$(b.dataset.target);if(!campo)return;const mostrar=campo.type==="password";campo.type=mostrar?"text":"password";b.textContent=mostrar?"Ocultar":"Ver";
  }));
}

// Arranque
document.addEventListener("DOMContentLoaded",async()=>{
  let oscuro=false;try{oscuro=localStorage.getItem("simtele_tema")==="dark";}catch{}
  aplicarTema(oscuro);await sembrarAdmin();
  $("form-auth").addEventListener("submit",enviarAuth);
  $("tab-login").addEventListener("click",()=>cambiarModo(false));
  $("tab-registro").addEventListener("click",()=>cambiarModo(true));
  $("logout").addEventListener("click",cerrarSesion);
  $("form-perfil").addEventListener("submit",actualizarPerfil);
  $("form-admin-user").addEventListener("submit",guardarUsuarioAdmin);
  $("cancel-admin").addEventListener("click",()=>{$("editor-usuario").hidden=true;$("form-admin-user").reset();});
  $("form-detencion").addEventListener("submit",calcularDetencion);
  $("form-mant").addEventListener("submit",guardarMantenimiento);
  $("form-viento").addEventListener("submit",analizarViento);
  $("form-sensor").addEventListener("submit",guardarSensor);
  $("cancel-mant").addEventListener("click",()=>{salirEdicionMant();limpiarMensaje("msg-mant");});
  $("cancel-sensor").addEventListener("click",()=>{salirEdicionSensor();limpiarMensaje("msg-sensor");});
  $("tema").addEventListener("click",()=>aplicarTema(document.documentElement.getAttribute("data-theme")!=="dark"));
  $("reset").addEventListener("click",reiniciar);configurarVerPassword();activarMenu();
  let k=null;try{k=sessionStorage.getItem("simtele_sesion");}catch{}
  if(k&&leerUsuarios()[k])entrar(k,true);
});
