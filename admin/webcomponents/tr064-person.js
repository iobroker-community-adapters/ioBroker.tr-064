import{createRoot as e,jsx as t,jsxs as n}from"../../../lib/esm/react-19.js";var r=`iob-dialog-close`;function i(e){return!!e.form}var a=[`header`,`staticText`,`divider`];function o(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function s(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!a.includes(r.type)&&(t[n]=r.type);return t}function c(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function l(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=c(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return c(t)}}function u(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=l(i,t[r]);e!==void 0&&(n[r]=e)}return n}var d=`"Roboto", "Helvetica", "Arial", sans-serif`,f=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:d,fontSize:14,borderRadius:4}),p=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:d,fontSize:14,borderRadius:4}),m=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],h=[`fontSize`,`borderRadius`];function g(e){return{...e===`dark`?p:f}}function _(e){if(!e||typeof e!=`object`)return g(typeof e==`string`?e:`light`);let t=e,n=g(typeof t.type==`string`?t.type:`light`);for(let e of m){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of h){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function v(e,t){return e.type===t.type&&m.every(n=>e[n]===t[n])&&h.every(n=>e[n]===t[n])}function y(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function b(e){let t={};for(let n of m)t[y(n)]=e[n];for(let n of h)t[y(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var x={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},S=`
dialog {
    box-sizing: border-box;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: calc(var(--iob-border-radius) * 2);
    background: var(--iob-paper);
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
/* as the dialogs of MUI: a dark paper gets lighter the higher it lies */
dialog.dark { background-image: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.16)); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog:focus { outline: none; }
form { display: flex; flex-direction: column; height: 100%; max-height: inherit; margin: 0; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 8px 12px 16px; font-size: 1.15em; font-weight: 500; }
header span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
button { font: inherit; padding: 6px 16px; border-radius: var(--iob-border-radius); border: 1px solid var(--iob-primary); background: transparent; color: var(--iob-primary); cursor: pointer; }
button.primary { background: var(--iob-primary); color: var(--iob-primary-contrast); }
button.close { border: 0; padding: 2px 8px; font-size: 1.4em; line-height: 1; color: var(--iob-text-secondary); }
label { display: flex; flex-direction: column; gap: 4px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, select, textarea { font: inherit; accent-color: var(--iob-primary); }
.help { color: var(--iob-text-secondary); font-size: 0.85em; }
h3 { margin: 4px 0 0; font-size: 1em; }
p { margin: 0; }
hr { width: 100%; border: 0; border-top: 1px solid var(--iob-divider); margin: 0; }
[hidden] { display: none !important; }
`;function C(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function w(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function T(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function E(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:C(n.hidden),disabled:C(n.disabled)},s=o(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=o(n.text,i)||s,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=o(n.text,i)||s,a;case`divider`:return a.box=e.createElement(`hr`),a}let c=e.createElement(`label`);a.box=c;let l=e.createElement(`span`);if(l.textContent=s||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,c.className=`check`,c.append(t,l),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=o(r.label,i),t.append(n)}let s=(n.options||[]).findIndex(e=>String(e.value)===w(r));t.selectedIndex=s===-1?0:s,c.append(l,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=w(r),c.append(l,t),a.input=t}else{let t=e.createElement(`input`),i=w(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),l.append(`: `,n)}c.append(l,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=o(n.help,i),c.append(t)}return a}function D(e,t={}){let n=t.lang||`en`,a=document,c=e=>x[e][n]||x[e].en||e,l=a.createElement(`div`);l.setAttribute(`data-iob-dialog`,``);let d=l.attachShadow({mode:`open`}),f=a.createElement(`style`);f.textContent=S;let p=a.createElement(`dialog`),m=_(t.theme);p.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(b(m)))p.style.setProperty(e,t);e.width&&(p.style.width=`${e.width}px`),e.height&&(p.style.height=`${e.height}px`);let h=a.createElement(`form`),g=a.createElement(`header`),v=a.createElement(`span`);v.textContent=o(e.title,n);let y=a.createElement(`button`);y.type=`button`,y.className=`close`,y.title=c(`close`),y.setAttribute(`aria-label`,c(`close`)),y.textContent=`×`,g.append(v,y);let C=a.createElement(`div`);return C.className=`body`,h.append(g,C),p.append(h),d.append(f,p),new Promise(t=>{let f=!1,m=e=>{f||(f=!0,p.open&&p.close(),l.remove(),t(e))};if(y.addEventListener(`click`,()=>m(null)),p.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),i(e)){let t={},r=[];for(let[t,i]of Object.entries(e.form.items||{})){let o=e.data?.[t]??i.default,s=E(a,t,i,o,n);r.push(s),C.append(s.box)}let i=()=>{for(let e of r)e.input&&(t[e.name]=T(e));return t},l=()=>{let e=i();for(let t of r)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,l),h.addEventListener(`change`,l),l();let d=r.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);d?.input&&(d.input.autofocus=!0);let f=a.createElement(`footer`),p=a.createElement(`button`);p.type=`button`,p.textContent=o(e.cancel,n)||c(`cancel`),p.addEventListener(`click`,()=>m(null));let g=a.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=o(e.ok,n)||c(`ok`),f.append(p,g),h.append(f),h.addEventListener(`submit`,()=>m(u(s(e.form),i())))}else C.append(e.element),p.addEventListener(r,e=>m(e.detail??null));a.body.append(l),p.showModal(),d.activeElement&&d.activeElement!==y||(p.tabIndex=-1,p.focus())})}function O(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var ee=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],te=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=_(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=_(e);v(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of ee)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return o(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await D(e,{lang:this.systemLang,theme:this.#n});return i(e)?t&&typeof t==`object`?u(s(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(b(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?O(this.getStateIds(this.#t)):[],n=e?O(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function ne(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}var k={present:`present`,lastArrival:`lastArrival`,lastDeparture:`lastDeparture`,presentSince:`presentSince`,absentSince:`absentSince`,presentToday:`presentToday`,absentToday:`absentToday`,devices:`devices`,history:`history`},A=/^(history|sql|influxdb)\.\d+$/;function j(e){if(typeof e!=`string`||!e)return[];try{let t=JSON.parse(e);return Array.isArray(t)?t.filter(e=>e&&typeof e.ts==`number`).map(e=>({ts:e.ts,present:!!e.present})).sort((e,t)=>t.ts-e.ts):[]}catch{return[]}}function M(e){let t=e?.common?.custom;if(t)return Object.keys(t).find(e=>A.test(e)&&t[e]?.enabled)}async function N(e,t,n={}){let r=Math.max(1,n.count||20),i=Math.max(1,n.days||7),a=`${t}.${k.present}`;try{let t=e.getHistory?M(await e.getObject(a)):void 0;if(t&&e.getHistory){let n=Date.now(),o=await e.getHistory(a,{instance:t,start:n-i*24*36e5,end:n,aggregate:`none`,ack:!0,from:!1,q:!1,addId:!1,returnNewestEntries:!0,count:r*4}),s=Array.isArray(o)?o:[],c=[];if(s.filter(e=>e&&typeof e.ts==`number`&&e.val!==null&&e.val!==void 0).sort((e,t)=>e.ts-t.ts).forEach(e=>{let t=e.val===!0||e.val===`true`||e.val===1||e.val===`1`;c.length&&c[c.length-1].present===t||c.push({ts:e.ts,present:t})}),c.length)return{events:c.reverse().slice(0,r),source:`history`,instance:t}}}catch(e){console.warn(`Cannot read the history of ${a}: ${String(e)}`)}try{let n=j((await e.getState(`${t}.${k.history}`))?.val).slice(0,r);return{events:n,source:n.length?`adapter`:`none`}}catch{return{events:[],source:`none`}}}function P(e){return e===`zh-cn`?`zh-CN`:e||`en`}function F(e,t){let n=Math.max(0,Math.floor(e/6e4)),r=[[Math.floor(n/1440),`day`],[Math.floor(n%1440/60),`hour`],[n%60,`minute`]],i=r.findIndex(([e])=>e>0);return(i===-1?[r[2]]:r.slice(i,i+2).filter(([e])=>e>0)).map(([e,n])=>{try{return new Intl.NumberFormat(P(t),{style:`unit`,unit:n,unitDisplay:n===`day`?`long`:`short`}).format(e)}catch{return`${e} ${n===`day`?`d`:n===`hour`?`h`:`min`}`}}).join(` `)}function I(e,t){if(!e)return`—`;let n=new Date(e),r=/* @__PURE__ */ new Date,i=P(t),a=n.toLocaleTimeString(i,{hour:`2-digit`,minute:`2-digit`}),o=new Date(r.getFullYear(),r.getMonth(),r.getDate()).getTime();if(e>=o)return a;if(e>=o-864e5)try{return`${new Intl.RelativeTimeFormat(i,{numeric:`auto`}).format(-1,`day`)} ${a}`}catch{}let s=n.getFullYear()===r.getFullYear();return`${n.toLocaleDateString(i,{day:`2-digit`,month:`2-digit`,...s?{}:{year:`numeric`}})} ${a}`}function L(e){if(e!=null)return typeof e==`string`?e===`true`||e===`1`||e===`on`:!!e}function R(e){if(e==null||e===``)return;let t=Number(e);return Number.isFinite(t)?t:void 0}function z(e){return e==null?``:String(e).trim()}var B=`
:host {
    display: block;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
}
*, *::before, *::after {
    box-sizing: border-box;
}
.mount {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    container-type: size;
    -webkit-tap-highlight-color: transparent;
}
.dialog-content {
    font-family: var(--iob-font-family, inherit);
    color: var(--iob-text, inherit);
}
.muted { color: color-mix(in srgb, currentColor 64%, transparent); }
.faint { color: color-mix(in srgb, currentColor 38%, transparent); }
.ellipsis {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.icon {
    display: inline-block;
    flex: 0 0 auto;
    width: 1em;
    height: 1em;
    fill: currentColor;
}
.hint {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    text-align: center;
    font-size: clamp(11px, 6cqmin, 14px);
    line-height: 1.35;
    color: color-mix(in srgb, currentColor 64%, transparent);
    overflow: hidden;
}
.hint .icon { font-size: clamp(20px, 16cqmin, 36px); opacity: 0.7; }
.spinner {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--iob-primary, currentColor) 22%, transparent);
    border-top-color: var(--iob-primary, currentColor);
    animation: tr064-spin 0.9s linear infinite;
}
@keyframes tr064-spin {
    to { transform: rotate(360deg); }
}
.alert {
    padding: 8px 12px;
    border-radius: var(--iob-border-radius, 4px);
    border-left: 3px solid var(--iob-warning, #ed6c02);
    background: color-mix(in srgb, var(--iob-warning, #ed6c02) 14%, transparent);
    font-size: 13px;
    line-height: 1.4;
}
.alert.info {
    border-left-color: var(--iob-info, #0288d1);
    background: color-mix(in srgb, var(--iob-info, #0288d1) 14%, transparent);
}
.alert.error {
    border-left-color: var(--iob-error, #d32f2f);
    background: color-mix(in srgb, var(--iob-error, #d32f2f) 14%, transparent);
}
button {
    font: inherit;
    color: inherit;
}
.icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 5px;
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 18px;
    cursor: pointer;
}
.icon-button:hover:not(:disabled) { background: color-mix(in srgb, currentColor 10%, transparent); }
.icon-button:disabled { opacity: 0.4; cursor: default; }
.text-button {
    padding: 6px 14px;
    border: 0;
    border-radius: var(--iob-border-radius, 4px);
    background: var(--iob-primary, #3399cc);
    color: var(--iob-primary-contrast, #fff);
    font-weight: 600;
    cursor: pointer;
}
.text-button.secondary {
    background: color-mix(in srgb, currentColor 10%, transparent);
    color: inherit;
}
:focus-visible {
    outline: 2px solid var(--iob-primary, currentColor);
    outline-offset: 1px;
}
.clickable { cursor: pointer; }
.edit .clickable { cursor: default; }
`,V={en:{tr064_startInstance:`Start the instance to see the mesh topology`,tr064_notConnected:`The instance is not connected to the FRITZ!Box yet`,tr064_notSupported:`The FRITZ!Box does not deliver a mesh topology`,tr064_timeout:`The instance did not answer`,tr064_error:`Error: %s`,vis_present:`present`,vis_away:`away`,vis_person:`Person`,vis_history:`History`,vis_export_excel:`Export for Excel (CSV)`,vis_date:`Date`,vis_time:`Time`,vis_event:`Event`,vis_duration_minutes:`Duration (min)`,vis_arrived:`Arrived`,vis_departed:`Left`,vis_present_today:`Present today`,vis_absent_today:`Away today`,vis_devices:`Devices`,vis_for_duration:`for %s`,vis_select_person:`Select a person in the settings of the widget`,vis_person_not_found:`Person "%s" not found`,vis_no_history:`No entries yet`},de:{tr064_startInstance:`Starte die Instanz, um die Mesh-Topologie zu sehen`,tr064_notConnected:`Die Instanz ist noch nicht mit der FRITZ!Box verbunden`,tr064_notSupported:`Die FRITZ!Box liefert keine Mesh-Topologie`,tr064_timeout:`Die Instanz hat nicht geantwortet`,tr064_error:`Fehler: %s`,vis_present:`anwesend`,vis_away:`abwesend`,vis_person:`Person`,vis_history:`Verlauf`,vis_export_excel:`Export für Excel (CSV)`,vis_date:`Datum`,vis_time:`Uhrzeit`,vis_event:`Ereignis`,vis_duration_minutes:`Dauer (min)`,vis_arrived:`Gekommen`,vis_departed:`Gegangen`,vis_present_today:`Heute anwesend`,vis_absent_today:`Heute abwesend`,vis_devices:`Geräte`,vis_for_duration:`seit %s`,vis_select_person:`Person in den Einstellungen des Widgets auswählen`,vis_person_not_found:`Person "%s" nicht gefunden`,vis_no_history:`Noch keine Einträge`},ru:{tr064_startInstance:`Запустите экземпляр, чтобы увидеть топологию mesh-сети`,tr064_notConnected:`Экземпляр ещё не подключён к FRITZ!Box`,tr064_notSupported:`FRITZ!Box не предоставляет топологию mesh-сети`,tr064_timeout:`Экземпляр не ответил`,tr064_error:`Ошибка: %s`,vis_present:`дома`,vis_away:`нет дома`,vis_person:`Персона`,vis_history:`История`,vis_export_excel:`Экспорт для Excel (CSV)`,vis_date:`Дата`,vis_time:`Время`,vis_event:`Событие`,vis_duration_minutes:`Длительность (мин)`,vis_arrived:`Пришёл`,vis_departed:`Ушёл`,vis_present_today:`Сегодня дома`,vis_absent_today:`Сегодня нет дома`,vis_devices:`Устройства`,vis_for_duration:`уже %s`,vis_select_person:`Выберите персону в настройках виджета`,vis_person_not_found:`Персона «%s» не найдена`,vis_no_history:`Записей пока нет`},pt:{tr064_startInstance:`Inicie a instância para ver a topologia mesh`,tr064_notConnected:`A instância ainda não está conectada ao FRITZ!Box`,tr064_notSupported:`O FRITZ!Box não fornece uma topologia mesh`,tr064_timeout:`A instância não respondeu`,tr064_error:`Erro: %s`,vis_present:`presente`,vis_away:`ausente`,vis_person:`Pessoa`,vis_history:`Histórico`,vis_export_excel:`Exportar para Excel (CSV)`,vis_date:`Data`,vis_time:`Hora`,vis_event:`Evento`,vis_duration_minutes:`Duração (min)`,vis_arrived:`Chegou`,vis_departed:`Saiu`,vis_present_today:`Presente hoje`,vis_absent_today:`Ausente hoje`,vis_devices:`Dispositivos`,vis_for_duration:`há %s`,vis_select_person:`Selecione uma pessoa nas configurações do widget`,vis_person_not_found:`Pessoa "%s" não encontrada`,vis_no_history:`Ainda sem entradas`},nl:{tr064_startInstance:`Start de instantie om de mesh-topologie te zien`,tr064_notConnected:`De instantie is nog niet met de FRITZ!Box verbonden`,tr064_notSupported:`De FRITZ!Box levert geen mesh-topologie`,tr064_timeout:`De instantie heeft niet geantwoord`,tr064_error:`Fout: %s`,vis_present:`aanwezig`,vis_away:`afwezig`,vis_person:`Persoon`,vis_history:`Geschiedenis`,vis_export_excel:`Exporteren voor Excel (CSV)`,vis_date:`Datum`,vis_time:`Tijd`,vis_event:`Gebeurtenis`,vis_duration_minutes:`Duur (min)`,vis_arrived:`Aangekomen`,vis_departed:`Vertrokken`,vis_present_today:`Vandaag aanwezig`,vis_absent_today:`Vandaag afwezig`,vis_devices:`Apparaten`,vis_for_duration:`sinds %s`,vis_select_person:`Selecteer een persoon in de instellingen van de widget`,vis_person_not_found:`Persoon "%s" niet gevonden`,vis_no_history:`Nog geen items`},fr:{tr064_startInstance:`Démarrez l'instance pour voir la topologie mesh`,tr064_notConnected:`L'instance n'est pas encore connectée à la FRITZ!Box`,tr064_notSupported:`La FRITZ!Box ne fournit pas de topologie mesh`,tr064_timeout:`L'instance n'a pas répondu`,tr064_error:`Erreur : %s`,vis_present:`présent`,vis_away:`absent`,vis_person:`Personne`,vis_history:`Historique`,vis_export_excel:`Exporter pour Excel (CSV)`,vis_date:`Date`,vis_time:`Heure`,vis_event:`Événement`,vis_duration_minutes:`Durée (min)`,vis_arrived:`Arrivé`,vis_departed:`Parti`,vis_present_today:`Présent aujourd'hui`,vis_absent_today:`Absent aujourd'hui`,vis_devices:`Appareils`,vis_for_duration:`depuis %s`,vis_select_person:`Sélectionnez une personne dans les réglages du widget`,vis_person_not_found:`Personne « %s » introuvable`,vis_no_history:`Pas encore d'entrées`},it:{tr064_startInstance:`Avvia l'istanza per vedere la topologia mesh`,tr064_notConnected:`L'istanza non è ancora connessa al FRITZ!Box`,tr064_notSupported:`Il FRITZ!Box non fornisce una topologia mesh`,tr064_timeout:`L'istanza non ha risposto`,tr064_error:`Errore: %s`,vis_present:`presente`,vis_away:`assente`,vis_person:`Persona`,vis_history:`Cronologia`,vis_export_excel:`Esporta per Excel (CSV)`,vis_date:`Data`,vis_time:`Ora`,vis_event:`Evento`,vis_duration_minutes:`Durata (min)`,vis_arrived:`Arrivato`,vis_departed:`Uscito`,vis_present_today:`Presente oggi`,vis_absent_today:`Assente oggi`,vis_devices:`Dispositivi`,vis_for_duration:`da %s`,vis_select_person:`Seleziona una persona nelle impostazioni del widget`,vis_person_not_found:`Persona "%s" non trovata`,vis_no_history:`Ancora nessuna voce`},es:{tr064_startInstance:`Inicie la instancia para ver la topología mesh`,tr064_notConnected:`La instancia aún no está conectada al FRITZ!Box`,tr064_notSupported:`El FRITZ!Box no proporciona una topología mesh`,tr064_timeout:`La instancia no respondió`,tr064_error:`Error: %s`,vis_present:`presente`,vis_away:`ausente`,vis_person:`Persona`,vis_history:`Historial`,vis_export_excel:`Exportar para Excel (CSV)`,vis_date:`Fecha`,vis_time:`Hora`,vis_event:`Evento`,vis_duration_minutes:`Duración (min)`,vis_arrived:`Llegó`,vis_departed:`Se fue`,vis_present_today:`Presente hoy`,vis_absent_today:`Ausente hoy`,vis_devices:`Dispositivos`,vis_for_duration:`desde hace %s`,vis_select_person:`Seleccione una persona en la configuración del widget`,vis_person_not_found:`Persona "%s" no encontrada`,vis_no_history:`Aún no hay entradas`},pl:{tr064_startInstance:`Uruchom instancję, aby zobaczyć topologię mesh`,tr064_notConnected:`Instancja nie jest jeszcze połączona z FRITZ!Box`,tr064_notSupported:`FRITZ!Box nie udostępnia topologii mesh`,tr064_timeout:`Instancja nie odpowiedziała`,tr064_error:`Błąd: %s`,vis_present:`obecny`,vis_away:`nieobecny`,vis_person:`Osoba`,vis_history:`Historia`,vis_export_excel:`Eksport do Excela (CSV)`,vis_date:`Data`,vis_time:`Godzina`,vis_event:`Zdarzenie`,vis_duration_minutes:`Czas trwania (min)`,vis_arrived:`Przyszedł`,vis_departed:`Wyszedł`,vis_present_today:`Obecny dziś`,vis_absent_today:`Nieobecny dziś`,vis_devices:`Urządzenia`,vis_for_duration:`od %s`,vis_select_person:`Wybierz osobę w ustawieniach widżetu`,vis_person_not_found:`Nie znaleziono osoby „%s”`,vis_no_history:`Brak wpisów`},uk:{tr064_startInstance:`Запустіть екземпляр, щоб побачити топологію mesh-мережі`,tr064_notConnected:`Екземпляр ще не підключено до FRITZ!Box`,tr064_notSupported:`FRITZ!Box не надає топологію mesh-мережі`,tr064_timeout:`Екземпляр не відповів`,tr064_error:`Помилка: %s`,vis_present:`вдома`,vis_away:`немає вдома`,vis_person:`Особа`,vis_history:`Історія`,vis_export_excel:`Експорт для Excel (CSV)`,vis_date:`Дата`,vis_time:`Час`,vis_event:`Подія`,vis_duration_minutes:`Тривалість (хв)`,vis_arrived:`Прийшов`,vis_departed:`Пішов`,vis_present_today:`Сьогодні вдома`,vis_absent_today:`Сьогодні немає вдома`,vis_devices:`Пристрої`,vis_for_duration:`вже %s`,vis_select_person:`Виберіть особу в налаштуваннях віджета`,vis_person_not_found:`Особу «%s» не знайдено`,vis_no_history:`Записів ще немає`},"zh-cn":{tr064_startInstance:`启动实例以查看 Mesh 拓扑`,tr064_notConnected:`实例尚未连接到 FRITZ!Box`,tr064_notSupported:`FRITZ!Box 未提供 Mesh 拓扑`,tr064_timeout:`实例没有响应`,tr064_error:`错误：%s`,vis_present:`在家`,vis_away:`离开`,vis_person:`人员`,vis_history:`历史`,vis_export_excel:`导出到 Excel (CSV)`,vis_date:`日期`,vis_time:`时间`,vis_event:`事件`,vis_duration_minutes:`时长 (分钟)`,vis_arrived:`到达`,vis_departed:`离开`,vis_present_today:`今日在场`,vis_absent_today:`今日离开`,vis_devices:`设备`,vis_for_duration:`已 %s`,vis_select_person:`请在小部件设置中选择一个人`,vis_person_not_found:`未找到人员“%s”`,vis_no_history:`暂无条目`}};function H(e,t,...n){let r=V[e]?.[t]||V.en?.[t]||t;for(let e of n)r=r.replace(`%s`,String(e));return r}function U(e){return(t,...n)=>H(e,t,...n)}var W=class extends te{#e;#t=null;#n=/* @__PURE__ */ new Set;#r=!1;constructor(e){super();let t=this.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=`${B}\n${e}`,this.#e=document.createElement(`div`),this.#e.className=`mount`,t.append(n,this.#e)}get t(){return U(this.systemLang)}render(){this.isConnected&&(this.#e.className=`mount ${this.theme.type}${this.editMode?` edit`:``}`,this.#t||=e(this.#e),this.#t.render(this.draw()),this.#n.forEach(e=>e()))}requestDraw(){this.#r||(this.#r=!0,queueMicrotask(()=>{this.#r=!1,this.render()}))}disconnectedCallback(){super.disconnectedCallback(),queueMicrotask(()=>{!this.isConnected&&this.#t&&(this.#t.unmount(),this.#t=null)})}resubscribe(){this.settings={...this.settings}}async showElementDialog(t,n,i){let a=document.createElement(`div`);for(let[e,t]of Object.entries(b(this.theme)))a.style.setProperty(e,t);let o=a.attachShadow({mode:`open`}),s=document.createElement(`style`);s.textContent=`${B}\n${i.css||``}`;let c=document.createElement(`div`);c.className=`dialog-content ${this.theme.type}`,o.append(s,c);let l=e(c),u=e=>{c.dispatchEvent(new CustomEvent(r,{detail:e??null,bubbles:!0,composed:!0}))},d=()=>l.render(i.draw(u));this.#n.add(d),d();try{return await this.openDialog({title:t,element:a,width:n})}finally{this.#n.delete(d),l.unmount()}}},G={fritzbox:{tag:`iob-tr064-fritzbox`,file:`tr064-fritzbox`},mesh:{tag:`iob-tr064-mesh`,file:`tr064-mesh`},presence:{tag:`iob-tr064-presence`,file:`tr064-presence`},person:{tag:`iob-tr064-person`,file:`tr064-person`},"guest-wlan":{tag:`iob-tr064-guest-wlan`,file:`tr064-guest-wlan`}},K={Router:`m20.2 5.9.8-.8C19.6 3.7 17.8 3 16 3s-3.6.7-5 2.1l.8.8C13 4.8 14.5 4.2 16 4.2s3 .6 4.2 1.7m-.9.8c-.9-.9-2.1-1.4-3.3-1.4s-2.4.5-3.3 1.4l.8.8c.7-.7 1.6-1 2.5-1s1.8.3 2.5 1zM19 13h-2V9h-2v4H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2M8 18H6v-2h2zm3.5 0h-2v-2h2zm3.5 0h-2v-2h2z`,ArrowDownward:`m20 12-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8z`,ArrowUpward:`m4 12 1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8z`,PhoneInTalk:`M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1zM19 12h2c0-4.97-4.03-9-9-9v2c3.87 0 7 3.13 7 7zm-4 0h2c0-2.76-2.24-5-5-5v2c1.66 0 3 1.34 3 3z`,PhoneMissed:`M6.5 5.5 12 11l7-7-1-1-6 6-4.5-4.5H11V3H5v6h1.5zm17.21 11.17C20.66 13.78 16.54 12 12 12S3.34 13.78.29 16.67c-.18.18-.29.43-.29.71s.11.53.29.71l2.48 2.48c.18.18.43.29.71.29.27 0 .52-.11.7-.28.79-.74 1.69-1.36 2.66-1.85.33-.16.56-.5.56-.9v-3.1c1.45-.48 3-.73 4.6-.73s3.15.25 4.6.72v3.1c0 .39.23.74.56.9.98.49 1.87 1.12 2.67 1.85.18.18.43.28.7.28.28 0 .53-.11.71-.29l2.48-2.48c.18-.18.29-.43.29-.71s-.12-.52-.3-.7`,Public:`M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39`,Voicemail:`M18.5 6C15.46 6 13 8.46 13 11.5c0 1.33.47 2.55 1.26 3.5H9.74c.79-.95 1.26-2.17 1.26-3.5C11 8.46 8.54 6 5.5 6S0 8.46 0 11.5 2.46 17 5.5 17h13c3.04 0 5.5-2.46 5.5-5.5S21.54 6 18.5 6m-13 9C3.57 15 2 13.43 2 11.5S3.57 8 5.5 8 9 9.57 9 11.5 7.43 15 5.5 15m13 0c-1.93 0-3.5-1.57-3.5-3.5S16.57 8 18.5 8 22 9.57 22 11.5 20.43 15 18.5 15`,Wifi:`m1 9 2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9m8 8 3 3 3-3c-1.65-1.66-4.34-1.66-6 0m-4-4 2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13`,WifiOff:`M22.99 9C19.15 5.16 13.8 3.76 8.84 4.78l2.52 2.52c3.47-.17 6.99 1.05 9.63 3.7zm-4 4c-1.29-1.29-2.84-2.13-4.49-2.56l3.53 3.53zM2 3.05 5.07 6.1C3.6 6.82 2.22 7.78 1 9l1.99 2c1.24-1.24 2.67-2.16 4.2-2.77l2.24 2.24C7.81 10.89 6.27 11.73 5 13v.01L6.99 15c1.36-1.36 3.14-2.04 4.92-2.06L18.98 20l1.27-1.26L3.29 1.79zM9 17l3 3 3-3c-1.65-1.66-4.34-1.66-6 0`,Close:`M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z`,Person:`M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4`,PersonOff:`M8.65 5.82C9.36 4.72 10.6 4 12 4c2.21 0 4 1.79 4 4 0 1.4-.72 2.64-1.82 3.35zM20 17.17c-.02-1.1-.63-2.11-1.61-2.62-.54-.28-1.13-.54-1.77-.76zm1.19 4.02L2.81 2.81 1.39 4.22l8.89 8.89c-1.81.23-3.39.79-4.67 1.45-1 .51-1.61 1.54-1.61 2.66V20h13.17l2.61 2.61z`,FileDownload:`M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z`,Lock:`M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2m-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2m3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1z`,QrCode2:`M15 21h-2v-2h2zm-2-7h-2v5h2zm8-2h-2v4h2zm-2-2h-2v2h2zM7 12H5v2h2zm-2-2H3v2h2zm7-5h2V3h-2zm-7.5-.5v3h3v-3zM9 9H3V3h6zm-4.5 7.5v3h3v-3zM9 21H3v-6h6zm7.5-16.5v3h3v-3zM21 9h-6V3h6zm-2 10v-3h-4v2h2v3h4v-2zm-2-7h-4v2h4zm-4-2H7v2h2v2h2v-2h2zm1-1V7h-2V5h-2v4zM6.75 5.25h-1.5v1.5h1.5zm0 12h-1.5v1.5h1.5zm12-12h-1.5v1.5h1.5z`,BackspaceOutlined:`M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 16H7.07L2.4 12l4.66-7H22zm-11.59-2L14 13.41 17.59 17 19 15.59 15.41 12 19 8.41 17.59 7 14 10.59 10.41 7 9 8.41 12.59 12 9 15.59z`,AccountTree:`M22 11V3h-7v3H9V3H2v8h7V8h2v10h4v3h7v-8h-7v3h-2V8h2v3z`,TableRows:`M21 8H3V4h18zm0 2H3v4h18zm0 6H3v4h18z`,Edit:`M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z`,Refresh:`M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z`,AcUnit:`M22 11h-4.17l3.24-3.24-1.41-1.42L15 11h-2V9l4.66-4.66-1.42-1.41L13 6.17V2h-2v4.17L7.76 2.93 6.34 4.34 11 9v2H9L4.34 6.34 2.93 7.76 6.17 11H2v2h4.17l-3.24 3.24 1.41 1.42L9 13h2v2l-4.66 4.66 1.42 1.41L11 17.83V22h2v-4.17l3.24 3.24 1.42-1.41L13 15v-2h2l4.66 4.66 1.41-1.42L17.83 13H22z`,Blinds:`M20 19V3H4v16H2v2h20v-2zM16 9h2v2h-2zm-2 2H6V9h8zm4-4h-2V5h2zm-4-2v2H6V5zM6 19v-6h8v1.82c-.45.32-.75.84-.75 1.43 0 .97.78 1.75 1.75 1.75s1.75-.78 1.75-1.75c0-.59-.3-1.12-.75-1.43V13h2v6z`,Computer:`M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2zM4 6h16v10H4z`,DeveloperBoard:`M22 9V7h-2V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2v-2h-2V9zm-4 10H4V5h14zM6 13h5v4H6zm6-6h4v3h-4zM6 7h5v5H6zm6 4h4v6h-4z`,DevicesOther:`M3 6h18V4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4v-2H3zm10 6H9v1.78c-.61.55-1 1.33-1 2.22s.39 1.67 1 2.22V20h4v-1.78c.61-.55 1-1.34 1-2.22s-.39-1.67-1-2.22zm-2 5.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5M22 8h-6c-.5 0-1 .5-1 1v10c0 .5.5 1 1 1h6c.5 0 1-.5 1-1V9c0-.5-.5-1-1-1m-1 10h-4v-8h4z`,Doorbell:`M12 3 4 9v12h16V9zm0 14.5c-.55 0-1-.45-1-1h2c0 .55-.45 1-1 1m4-1.5H8v-1h1v-2.34c0-1.54.82-2.82 2.25-3.16v-.25c0-.41.34-.75.75-.75s.75.34.75.75v.25c1.44.34 2.25 1.62 2.25 3.16V15h1z`,Lan:`M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3z`,Lightbulb:`M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7`,Monitor:`M20 3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h3l-1 1v2h12v-2l-1-1h3c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m0 13H4V5h16z`,Phone:`M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02z`,Power:`M16.01 7 16 3h-2v4h-4V3H8v4h-.01C7 6.99 6 7.99 6 8.99v5.49L9.5 18v3h5v-3l3.5-3.51v-5.5c0-1-1-2-1.99-1.99`,Print:`M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3m-3 11H8v-5h8zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-1-9H6v4h12z`,Sensors:`M7.76 16.24C6.67 15.16 6 13.66 6 12s.67-3.16 1.76-4.24l1.42 1.42C8.45 9.9 8 10.9 8 12s.45 2.1 1.17 2.83zm8.48 0C17.33 15.16 18 13.66 18 12s-.67-3.16-1.76-4.24l-1.42 1.42C15.55 9.9 16 10.9 16 12s-.45 2.1-1.17 2.83zM12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m8 2c0 2.21-.9 4.21-2.35 5.65l1.42 1.42C20.88 17.26 22 14.76 22 12s-1.12-5.26-2.93-7.07l-1.42 1.42C19.1 7.79 20 9.79 20 12M6.35 6.35 4.93 4.93C3.12 6.74 2 9.24 2 12s1.12 5.26 2.93 7.07l1.42-1.42C4.9 16.21 4 14.21 4 12s.9-4.21 2.35-5.65`,Smartphone:`M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99M17 19H7V5h10z`,SmartToy:`M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3M7.5 11.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S9.83 13 9 13s-1.5-.67-1.5-1.5M16 17H8v-2h8zm-1-4c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13`,Speaker:`M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 1.99 2 1.99L17 22c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-5 2c1.1 0 2 .9 2 2s-.9 2-2 2c-1.11 0-2-.9-2-2s.89-2 2-2m0 16c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3`,SportsEsports:`m21.58 16.09-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91M11 11H9v2H8v-2H6v-1h2V8h1v2h2zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1`,Storage:`M2 20h20v-4H2zm2-3h2v2H4zM2 4v4h20V4zm4 3H4V5h2zm-4 7h20v-4H2zm2-3h2v2H4z`,Tablet:`M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 1.99-.9 1.99-2L23 6c0-1.1-.9-2-2-2m-2 14H5V6h14z`,Thermostat:`M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4m-4-2V5c0-.55.45-1 1-1s1 .45 1 1v1h-1v1h1v2h-1v1h1v1z`,TouchApp:`M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74m9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74c-3.6-.76-3.54-.75-3.67-.75-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38`,Tv:`M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2m0 14H3V5h18z`,Videocam:`M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11z`,Watch:`M20 12c0-2.54-1.19-4.81-3.04-6.27L16 0H8l-.95 5.73C5.19 7.19 4 9.45 4 12s1.19 4.81 3.05 6.27L8 24h8l.96-5.73C18.81 16.81 20 14.54 20 12M6 12c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6-6-2.69-6-6`};function q(e){return/* @__PURE__ */ t(`svg`,{className:e.className?`icon ${e.className}`:`icon`,viewBox:`0 0 24 24`,"aria-hidden":`true`,focusable:`false`,children:/* @__PURE__ */ t(`path`,{d:K[e.name]})})}function J(e){return/* @__PURE__ */ n(`div`,{className:`hint`,role:`status`,children:[e.icon?/* @__PURE__ */ t(q,{name:e.icon}):null,/* @__PURE__ */ t(`div`,{children:e.text})]})}function re(e,t){let n=t?e[t]?.val:void 0;return n===null?void 0:n}function ie(e,t){if(!e)return``;if(typeof e==`string`)return e;let n=e;return n[t]||n.en||Object.values(n).find(Boolean)||``}function Y(e,t,n,r){let i=typeof e==`number`?e:typeof e==`string`?parseInt(e,10):NaN;return Number.isFinite(i)?Math.min(r,Math.max(n,Math.round(i))):t}function X(e){return typeof e==`string`||typeof e==`number`?String(e).trim():``}var ae=1e4,oe=/^(tr-064\.\d+\.presence\.persons\.[^.]+)(?:\.|$)/,Z=`
.person { height: 100%; min-height: 0; padding: clamp(4px, 3cqmin, 12px); }
.v { display: none; height: 100%; min-height: 0; min-width: 0; }
.v-full { display: flex; flex-direction: column; gap: 12px; }
@container (max-width: 199.98px) {
    .v-full { display: none; }
    .v-compact { display: flex; }
}
@container (min-width: 200px) and (max-height: 99.98px) {
    .v-full { display: none; }
    .v-row { display: flex; }
}
.avatar {
    position: relative;
    flex: 0 0 auto;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color);
    background: color-mix(in srgb, var(--color) 15%, transparent);
    transition: box-shadow 0.3s, background-color 0.3s;
}
.avatar.photo {
    background: transparent;
    box-shadow: 0 0 0 2px var(--iob-paper), 0 0 0 4px var(--color);
}
.avatar > .icon { width: 58%; height: 58%; }
.avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; transition: filter 0.3s, opacity 0.3s; }
.avatar img.gray { filter: grayscale(1); opacity: 0.6; }
.name { font-weight: 600; line-height: 1.3; }
.state { display: flex; align-items: center; gap: 6px; min-width: 0; line-height: 1.3; font-weight: 600; color: var(--color); }
.state .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--color); }
.state .dot.present { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color) 18%, transparent); }
.state.hint { font-weight: 400; color: color-mix(in srgb, currentColor 64%, transparent); }
.state.hint span { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.duration { font-size: 12px; line-height: 1.35; }

/* compact */
.v-compact { flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
.v-compact .avatar { --size: clamp(28px, min(60cqi, 100cqh - 70px), 140px); margin-bottom: 4px; }
.v-compact .name { font-size: 15px; width: 100%; }
.v-compact .state { font-size: 13px; justify-content: center; width: 100%; }
.v-compact .duration { width: 100%; display: none; }
@container (min-height: 130px) {
    .v-compact .duration { display: block; }
}

/* row */
.v-row { align-items: center; gap: 12px; }
.v-row .avatar { --size: clamp(32px, 100cqh - 8px, 72px); }
.v-row .texts { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.v-row .name { font-size: 15px; }
.v-row .state { font-size: 13px; }
.v-row .duration, .v-row .times { display: none; }
@container (min-height: 54px) {
    .v-row .duration { display: block; }
}
@container (min-width: 300px) and (min-height: 44px) {
    .v-row .times { display: grid; }
}
.times { flex: 0 0 auto; grid-template-columns: auto auto; column-gap: 8px; row-gap: 2px; font-size: 12px; line-height: 1.35; }
.times .value { color: var(--iob-text); font-weight: 600; text-align: right; }

/* full */
.header { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; min-width: 0; }
.header .avatar { --size: 52px; }
.header .texts { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.header .name { font-size: 16px; }
.header .state { font-size: 13px; }
@container (min-width: 320px) and (min-height: 200px) {
    .header .avatar { --size: 64px; }
    .header .name { font-size: 18px; }
    .header .state { font-size: 14px; }
}
.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.details { flex: 0 0 auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.detail {
    min-width: 0;
    min-height: 40px;
    padding: 4px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, currentColor 5%, transparent);
    display: flex;
    flex-direction: column;
    justify-content: center;
}
.detail.wide { grid-column: 1 / -1; }
.detail .label { font-size: 11px; line-height: 1.3; }
.detail .value { font-size: 14px; font-weight: 600; line-height: 1.3; }
.detail.wide .value { white-space: normal; overflow-wrap: anywhere; }
.history { flex: 0 0 auto; display: flex; flex-direction: column; }
.history-dialog { padding: 0 4px 12px; max-height: 70vh; overflow-y: auto; }
.history-dialog .history { display: flex; }
@container (max-height: 179.98px) {
    .history { display: none; }
}
.history-head {
    height: 22px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent);
}
.history-head .source { margin-left: auto; font-size: 11px; font-weight: 400; }
.history-head .icon-button { font-size: 16px; padding: 2px; }
.history-empty { font-size: 12px; padding: 6px 0; }
.event { height: 28px; display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 13px; }
.event .dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--color); }
.event .what { flex: 0 1 auto; font-weight: 600; }
.event .long { flex: 0 1 auto; font-size: 12px; }
.event .when { flex: 0 0 auto; margin-left: auto; font-size: 12px; font-variant-numeric: tabular-nums; }
`;function Q(e){return String(e).padStart(2,`0`)}function se(e,t){let n=String(e);return n.includes(t)||/["\r\n]/.test(n)?`"${n.replace(/"/g,`""`)}"`:n}function $(e){return e}var ce=class e extends W{#e=null;#t=``;#n=null;#r=0;#i=``;#a=null;constructor(){super(Z)}connectedCallback(){super.connectedCallback(),this.#a||=setInterval(()=>this.requestDraw(),6e4)}disconnectedCallback(){this.#a&&=(clearInterval(this.#a),null),this.#n&&=(clearTimeout(this.#n),null),this.#t=``,super.disconnectedCallback()}static#o(e){return X(e.person).match(oe)?.[1]||null}getObjectIds(t){return[e.#o(t)]}getStateIds(t){let n=e.#o(t);return n?Object.values(k).map(e=>`${n}.${e}`):[]}get#s(){return e.#o(this.settings)}#c(e){let t=this.#s;return t?re(this.states,`${t}.${k[e]}`):void 0}#l(){return{count:Y(this.settings.historyCount,10,1,100),days:Y(this.settings.historyDays,7,1,365)}}#u(e){if(this.settings.showHistory===!1||!this.socket){this.#e=null,this.#t=``;return}let t=this.#l(),n=`${e}|${t.count}|${t.days}`,r=`${String(this.#c(`present`))}|${String(this.#c(`history`))}`;n===this.#t?r!==this.#i&&(this.#i=r,this.#n&&clearTimeout(this.#n),this.#n=setTimeout(()=>{this.#n=null,this.#d(e,t)},1e3)):(this.#t=n,this.#e=null,this.#i=r,this.#d(e,t))}async#d(e,t){let n=this.socket;if(!n)return;let r=++this.#r,i=await N(n,e,t);r===this.#r&&(this.#e=i,this.requestDraw())}#f=async()=>{let e=this.#s,t=this.socket;if(!e||!t||this.editMode)return;let n=this.t,r=await N(t,e,{count:ae,days:this.#l().days}),i=this.systemLang,a=i===`en`||i===`zh-cn`?`,`:`;`,o=L(this.#c(`present`)),s=[...r.events].reverse(),c=[[n(`vis_date`),n(`vis_time`),n(`vis_event`),n(`vis_duration_minutes`)],...s.map((e,t)=>{let r=t<s.length-1?s[t+1].ts:e.present===o?Date.now():0,i=new Date(e.ts);return[`${i.getFullYear()}-${Q(i.getMonth()+1)}-${Q(i.getDate())}`,`${Q(i.getHours())}:${Q(i.getMinutes())}:${Q(i.getSeconds())}`,n(e.present?`vis_arrived`:`vis_departed`),r>e.ts?Math.round((r-e.ts)/6e4):``]})].map(e=>e.map(e=>se(e,a)).join(a)).join(`\r
`),l=/* @__PURE__ */ new Date,u=`${this.#p().replace(/[\\/:*?"<>|]+/g,`_`)}_${l.getFullYear()}-${Q(l.getMonth()+1)}-${Q(l.getDate())}.csv`,d=URL.createObjectURL(new Blob([`﻿${c}\r\n`],{type:`text/csv;charset=utf-8`})),f=document.createElement(`a`);f.href=d,f.download=u,document.body.appendChild(f),f.click(),f.remove(),setTimeout(()=>URL.revokeObjectURL(d),1e3)};#p(){let e=this.#s;if(!e)return``;let t=this.objects[e];return(t?.native||{}).person||ie(t?.common?.name,this.systemLang)||e.split(`.`).pop()||``}#m(e){return e===void 0?`color-mix(in srgb, currentColor 38%, transparent)`:X(e?this.settings.presentColor:this.settings.absentColor)||(e?`var(--iob-success)`:`color-mix(in srgb, currentColor 64%, transparent)`)}#h(e){return e===void 0?`…`:X(e?this.settings.presentText:this.settings.absentText)||this.t(e?`vis_present`:`vis_away`)}#g(e){if(e===void 0)return 0;let t=Date.now(),n=R(this.#c(e?`lastArrival`:`lastDeparture`));if(n&&n<=t)return t-n;let r=R(this.#c(e?`presentSince`:`absentSince`));return r?r*6e4:0}#_(){let e=this.settings,t=this.systemLang,n=this.t,r=e=>I(R(this.#c(e))||0,t),i=e=>{let n=R(this.#c(e));return n===void 0?`—`:F(n*6e4,t)},a=[];return e.showArrival!==!1&&a.push({key:`arrival`,label:n(`vis_arrived`),value:r(`lastArrival`)}),e.showDeparture!==!1&&a.push({key:`departure`,label:n(`vis_departed`),value:r(`lastDeparture`)}),e.showToday&&(a.push({key:`presentToday`,label:n(`vis_present_today`),value:i(`presentToday`)}),a.push({key:`absentToday`,label:n(`vis_absent_today`),value:i(`absentToday`)})),e.showDevices&&a.push({key:`devices`,label:n(`vis_devices`),value:z(this.#c(`devices`))||`—`,wide:!0}),a}#v(e){let n=X(this.settings.image),r=e===!1&&this.settings.grayAbsent!==!1;return/* @__PURE__ */ t(`span`,{className:`avatar${n?` photo`:``}`,style:$({"--color":this.#m(e)}),children:n?/* @__PURE__ */ t(`img`,{src:n,alt:``,className:r?`gray`:void 0}):/* @__PURE__ */ t(q,{name:e===!1?`PersonOff`:`Person`})})}#y(e,r){return/* @__PURE__ */ n(`div`,{className:`state${r?` hint`:``}`,style:$({"--color":this.#m(e)}),children:[r?null:/* @__PURE__ */ t(`span`,{className:`dot${e?` present`:``}`}),/* @__PURE__ */ t(`span`,{className:r?void 0:`ellipsis`,children:r||this.#h(e)})]})}#b(e){let n=this.#g(e);return this.settings.showDuration===!1||!n?null:/* @__PURE__ */ t(`div`,{className:`duration muted ellipsis`,children:this.t(`vis_for_duration`,F(n,this.systemLang))})}#x(e){if(this.settings.showHistory===!1)return null;let r=this.#e,i=r?.events||[],a=this.systemLang,o=this.t,s;return s=r?i.length?i.map((r,s)=>{let c=s?i[s-1].ts:r.present===e?Date.now():0;return/* @__PURE__ */ n(`div`,{className:`event`,style:$({"--color":this.#m(r.present)}),children:[/* @__PURE__ */ t(`span`,{className:`dot`}),/* @__PURE__ */ t(`span`,{className:`what ellipsis`,children:o(r.present?`vis_arrived`:`vis_departed`)}),c>r.ts?/* @__PURE__ */ t(`span`,{className:`long muted ellipsis`,children:F(c-r.ts,a)}):null,/* @__PURE__ */ t(`span`,{className:`when muted`,children:I(r.ts,a)})]},`${r.ts}_${s}`)}):/* @__PURE__ */ t(`div`,{className:`history-empty muted`,children:o(`vis_no_history`)}):/* @__PURE__ */ t(`div`,{className:`history-empty muted`,children:`…`}),/* @__PURE__ */ n(`div`,{className:`history`,children:[/* @__PURE__ */ n(`div`,{className:`history-head muted`,children:[/* @__PURE__ */ t(`span`,{className:`ellipsis`,children:o(`vis_history`)}),r?.source===`history`&&r.instance?/* @__PURE__ */ t(`span`,{className:`source faint`,children:r.instance}):null,this.settings.showExport!==!1&&i.length?/* @__PURE__ */ t(`button`,{type:`button`,className:`icon-button`,title:o(`vis_export_excel`),"aria-label":o(`vis_export_excel`),disabled:this.editMode,onClick:()=>void this.#f(),children:/* @__PURE__ */ t(q,{name:`FileDownload`})}):null]}),s]})}get#S(){return!this.editMode&&this.settings.showHistory!==!1&&!!this.#s}#C=()=>{if(!this.#S)return;let e=X(this.settings.nameText)||this.#p();this.showElementDialog(e?`${e} – ${this.t(`vis_history`)}`:this.t(`vis_history`),420,{css:Z,draw:()=>/* @__PURE__ */ t(`div`,{className:`history-dialog`,children:this.#x(L(this.#c(`present`)))})})};#w=e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.#C())};draw(){let e=this.#s;if(!e)return/* @__PURE__ */ t(J,{icon:`Person`,text:this.t(`vis_select_person`)});this.#u(e);let r=L(this.#c(`present`)),i=this.objects[e]!==null,a=this.#p(),o=``;i?r===void 0&&(o=`…`):o=this.t(`vis_person_not_found`,a);let s=this.settings.showName===!1?null:/* @__PURE__ */ t(`div`,{className:`name ellipsis`,children:X(this.settings.nameText)||a||this.t(`vis_person`)}),c=this.#_(),l=c.filter(e=>e.key===`arrival`||e.key===`departure`),u=this.#S,d=u?{role:`button`,tabIndex:0,title:this.t(`vis_history`),onClick:this.#C,onKeyDown:this.#w}:{};return/* @__PURE__ */ n(`div`,{className:`person`,children:[/* @__PURE__ */ n(`div`,{...d,className:`v v-compact${u?` clickable`:``}`,children:[this.#v(r),s,this.#y(r,o),this.#b(r)]}),/* @__PURE__ */ n(`div`,{...d,className:`v v-row${u?` clickable`:``}`,children:[this.#v(r),/* @__PURE__ */ n(`div`,{className:`texts`,children:[s,this.#y(r,o),this.#b(r)]}),l.length?/* @__PURE__ */ t(`div`,{className:`times muted`,children:l.map(e=>[/* @__PURE__ */ t(`span`,{children:e.label},`${e.key}-label`),/* @__PURE__ */ t(`span`,{className:`value`,children:e.value},`${e.key}-value`)])}):null]}),/* @__PURE__ */ n(`div`,{className:`v v-full`,children:[/* @__PURE__ */ n(`div`,{...d,className:`header${u?` clickable`:``}`,children:[this.#v(r),/* @__PURE__ */ n(`div`,{className:`texts`,children:[s,this.#y(r,o),this.#b(r)]})]}),/* @__PURE__ */ n(`div`,{className:`body`,children:[c.length?/* @__PURE__ */ t(`div`,{className:`details`,children:c.map(e=>/* @__PURE__ */ n(`div`,{className:`detail${e.wide?` wide`:``}`,children:[/* @__PURE__ */ t(`div`,{className:`label muted ellipsis`,children:e.label}),/* @__PURE__ */ t(`div`,{className:`value ellipsis`,children:e.value})]},e.key))}):null,this.#x(r)]})]})]})}};ne(G.person.tag,ce);