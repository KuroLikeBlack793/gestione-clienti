"use strict";

const STORAGE_KEY = "magazzino_consegne_v1";
let clienti = caricadati();
let ordinamentoAscendente = true;
let clienteInModificaId = null;
let zonaFiltroSelezionata = "TUTTE";

document.addEventListener("DOMContentLoaded", () => {
    render();
    registraServiceWorker();
});

function caricadati() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error("Errore nel caricamento dati", e);
        return [];
    }
}

function salvaDati() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clienti));
}

function mostraToast(messaggio, tipo = "danger") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${tipo}`;
    toast.textContent = messaggio;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.2s ease";
        setTimeout(() => toast.remove(), 200);
    }, 3000);
}

function generaChiave(str) {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function pulisciTesto(str) {
    return str.trim().replace(/\s+/g, " ");
}

function toggleOrdinamento() {
    ordinamentoAscendente = !ordinamentoAscendente;
    render();
}

/* --- MODIFICA CLIENTE --- */

function apriModifica(id) {
    const cliente = clienti.find(c => c.id === id);
    if (!cliente) return;

    clienteInModificaId = id;
    document.getElementById("editNomeCliente").value = cliente.nome;
    document.getElementById("editZonaCliente").value = cliente.zona;

    const modal = document.getElementById("modalEdit");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function chiudiModifica() {
    const modal = document.getElementById("modalEdit");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    clienteInModificaId = null;
    if (document.activeElement) document.activeElement.blur();
}

function handleEditSubmit(event) {
    event.preventDefault();

    if (!clienteInModificaId) return;

    const nomeGrezzo = document.getElementById("editNomeCliente").value;
    const zonaGrezza = document.getElementById("editZonaCliente").value;

    const nomeChiave = generaChiave(nomeGrezzo);
    const zonaChiave = generaChiave(zonaGrezza);

    if (!nomeChiave || !zonaChiave) {
        mostraToast("⚠️ Nome e zona obbligatori!", "warning");
        return;
    }

    const duplicato = clienti.some(c =>
        c.id !== clienteInModificaId &&
        generaChiave(c.nome) === nomeChiave &&
        generaChiave(c.zona) === zonaChiave
    );

    if (duplicato) {
        mostraToast(`⛔ Già presente per "${pulisciTesto(zonaGrezza)}"!`, "danger");
        return;
    }

    clienti = clienti.map(c => {
        if (c.id === clienteInModificaId) {
            return {
                ...c,
                nome: pulisciTesto(nomeGrezzo),
                zona: pulisciTesto(zonaGrezza),
                updatedAt: new Date().toISOString()
            };
        }
        return c;
    });

    salvaDati();
    render();
    chiudiModifica();
    mostraToast("✏️ Cliente aggiornato!", "success");
}

/* --- INSERIMENTO ED ELIMINAZIONE --- */

function handleFormSubmit(event) {
    event.preventDefault();

    const nomeInput = document.getElementById("nomeCliente");
    const zonaInput = document.getElementById("zonaCliente");
    const filtroRicercaInput = document.getElementById("filtroRicerca");

    const nomeGrezzo = nomeInput.value;
    const zonaGrezza = zonaInput.value;

    const nomeChiave = generaChiave(nomeGrezzo);
    const zonaChiave = generaChiave(zonaGrezza);

    if (!nomeChiave && !zonaChiave) {
        mostraToast("⚠️ Inserisci nome cliente e zona!", "warning");
        return;
    }
    if (!nomeChiave) {
        mostraToast("⚠️ Il nome del cliente è obbligatorio!", "warning");
        return;
    }
    if (!zonaChiave) {
        mostraToast("⚠️ La zona di consegna è obbligatoria!", "warning");
        return;
    }

    const giaEsistente = clienti.some(c =>
        generaChiave(c.nome) === nomeChiave &&
        generaChiave(c.zona) === zonaChiave
    );

    if (giaEsistente) {
        mostraToast(`⛔ "${pulisciTesto(nomeGrezzo)}" già inserito in "${pulisciTesto(zonaGrezza)}"!`, "danger");
        return;
    }

    const nuovoCliente = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        nome: pulisciTesto(nomeGrezzo),
        zona: pulisciTesto(zonaGrezza),
        createdAt: new Date().toISOString()
    };

    clienti.push(nuovoCliente);
    salvaDati();

    // Reset del filtro per mostrare subito il nuovo cliente nella lista
    zonaFiltroSelezionata = "TUTTE";
    if (filtroRicercaInput) filtroRicercaInput.value = "";

    render();
    mostraToast(`✅ Cliente salvato!`, "success");

    // Reset campi e chiusura tastiera mobile
    nomeInput.value = "";
    zonaInput.value = "";
    if (document.activeElement) document.activeElement.blur();
}

function eliminaCliente(id) {
    const cliente = clienti.find(c => c.id === id);
    const nome = cliente ? cliente.nome : "il cliente";

    if (confirm(`Rimuovere "${nome}" dalla lista?`)) {
        clienti = clienti.filter(c => c.id !== id);
        salvaDati();
        render();
        mostraToast(`🗑️ "${nome}" rimosso.`, "danger");
    }
}

function filtrarClienti() {
    render();
}

function selezionaFiltroZona(zona) {
    zonaFiltroSelezionata = zona;
    render();
}

/* --- RENDERING LISTA E CHIP --- */

function renderChips() {
    const container = document.getElementById("chipsContainer");
    if (!container) return;

    container.innerHTML = "";

    if (clienti.length === 0) return;

    const zoneUnicheMap = new Map();
    clienti.forEach(c => {
        const chiave = generaChiave(c.zona);
        if (!zoneUnicheMap.has(chiave)) {
            zoneUnicheMap.set(chiave, c.zona);
        }
    });

    const zoneUniche = Array.from(zoneUnicheMap.values()).sort((a, b) => a.localeCompare(b, "it"));

    const chipTutte = document.createElement("button");
    chipTutte.type = "button";
    chipTutte.className = `chip ${zonaFiltroSelezionata === "TUTTE" ? "active" : ""}`;
    chipTutte.textContent = `Tutte (${clienti.length})`;
    chipTutte.onclick = () => selezionaFiltroZona("TUTTE");
    container.appendChild(chipTutte);

    zoneUniche.forEach(zona => {
        const chiaveZona = generaChiave(zona);
        const conteggio = clienti.filter(c => generaChiave(c.zona) === chiaveZona).length;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `chip ${zonaFiltroSelezionata === chiaveZona ? "active" : ""}`;
        chip.textContent = `${zona} (${conteggio})`;
        chip.onclick = () => selezionaFiltroZona(chiaveZona);
        container.appendChild(chip);
    });
}

function render() {
    const listaElem = document.getElementById("listaClienti");
    const emptyStateElem = document.getElementById("emptyState");
    const counterElem = document.getElementById("counter");
    const btnSort = document.getElementById("btnSort");
    const filtroRicercaElem = document.getElementById("filtroRicerca");
    const filtroChiave = filtroRicercaElem ? generaChiave(filtroRicercaElem.value) : "";

    renderChips();
    listaElem.innerHTML = "";

    if (btnSort) {
        btnSort.textContent = ordinamentoAscendente ? "A ➔ Z" : "Z ➔ A";
    }

    let filtrati = clienti.filter(c =>
        generaChiave(c.nome).includes(filtroChiave) ||
        generaChiave(c.zona).includes(filtroChiave)
    );

    if (zonaFiltroSelezionata !== "TUTTE") {
        filtrati = filtrati.filter(c => generaChiave(c.zona) === zonaFiltroSelezionata);
    }

    filtrati.sort((a, b) => {
        const confronto = a.nome.localeCompare(b.nome, "it", { sensitivity: "base" });
        return ordinamentoAscendente ? confronto : -confronto;
    });

    counterElem.textContent = `${filtrati.length} clienti`;

    if (filtrati.length === 0) {
        emptyStateElem.style.display = "block";
    } else {
        emptyStateElem.style.display = "none";

        filtrati.forEach(c => {
            const li = document.createElement("li");
            li.className = "cliente-item";
            li.innerHTML = `
        <div class="cliente-info-clickable" onclick="apriModifica('${c.id}')" title="Modifica ${escapeHtml(c.nome)}">
          <div>
            <div class="cliente-nome">${escapeHtml(c.nome)}</div>
            <div class="cliente-zona">📍 ${escapeHtml(c.zona)}</div>
          </div>
          <span class="edit-icon" aria-hidden="true">✏️</span>
        </div>
        <button class="btn btn-danger" onclick="eliminaCliente('${c.id}')" aria-label="Elimina ${escapeHtml(c.nome)}">Elimina</button>
      `;
            listaElem.appendChild(li);
        });
    }
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
}

/* --- ESPORTAZIONE E BACKUP --- */

function esportaCSV() {
    if (clienti.length === 0) {
        mostraToast("⚠️ Nessun cliente presente da esportare!", "warning");
        return;
    }

    let csvContent = "\uFEFF";
    csvContent += "Cliente;Zona;Data Inserimento\n";

    clienti.forEach(c => {
        const dataOra = c.createdAt ? new Date(c.createdAt).toLocaleString("it-IT") : "-";
        const nomeSanificato = `"${c.nome.replace(/"/g, '""')}"`;
        const zonaSanificata = `"${c.zona.replace(/"/g, '""')}"`;
        csvContent += `${nomeSanificato};${zonaSanificata};"${dataOra}"\n`;
    });

    scaricaFile(csvContent, `consegne_${dataOggiFormattata()}.csv`, "text/csv;charset=utf-8;");
    mostraToast("📊 File CSV generato!", "success");
}

function esportaJSON() {
    if (clienti.length === 0) {
        mostraToast("⚠️ Nessun dato presente per il backup!", "warning");
        return;
    }

    const jsonContent = JSON.stringify(clienti, null, 2);
    scaricaFile(jsonContent, `backup_consegne_${dataOggiFormattata()}.json`, "application/json");
    mostraToast("💾 Backup JSON scaricato!", "success");
}

function importaJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const datiImportati = JSON.parse(e.target.result);
            if (!Array.isArray(datiImportati)) throw new Error("Formato non valido");

            const validi = datiImportati.filter(c => c && c.nome && c.zona);
            if (validi.length === 0) {
                mostraToast("⛔ Nessun cliente valido trovato nel file JSON!", "danger");
                return;
            }

            if (confirm(`Ripristinare ${validi.length} clienti? I dati locali attuali verranno sostituiti.`)) {
                clienti = validi;
                salvaDati();
                render();
                mostraToast(`📥 Ripristinati ${validi.length} clienti!`, "success");
            }
        } catch (err) {
            console.error("Errore lettura JSON", err);
            mostraToast("⛔ Impossibile leggere il file di backup!", "danger");
        } finally {
            event.target.value = "";
        }
    };

    reader.readAsText(file);
}

function scaricaFile(contenuto, nomeFile, tipoMime) {
    const blob = new Blob([contenuto], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function dataOggiFormattata() {
    const d = new Date();
    const anno = d.getFullYear();
    const mese = String(d.getMonth() + 1).padStart(2, "0");
    const giorno = String(d.getDate()).padStart(2, "0");
    return `${anno}-${mese}-${giorno}`;
}

function registraServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch(err => {
            console.warn("Service Worker non registrato", err);
        });
    }
}