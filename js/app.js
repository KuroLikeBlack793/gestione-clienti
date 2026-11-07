/**
 * @file app.js
 * @description Modulo principale per la gestione del Registro Clienti (PWA).
 * Segue l'architettura a responsabilità separate (StorageService, ClientRepository, UIManager).
 */

"use strict";

/**
 * Utility per la sanificazione dei dati e delle stringhe.
 */
class StringUtils {
    /**
     * Rimuove diacritici, spazi extra e converte in minuscolo per ricerche univoche.
     * @param {string} str 
     * @returns {string}
     */
    static normalizeKey(str) {
        if (!str) return "";
        return str
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]/g, "");
    }

    /**
     * Pulisce gli spazi vuoti multipli e le estremità della stringa.
     * @param {string} str 
     * @returns {string}
     */
    static sanitizeText(str) {
        return (str || "").trim().replace(/\s+/g, " ");
    }

    /**
     * Esegue l'escape dei caratteri HTML per prevenire vulnerabilità XSS.
     * @param {string} str 
     * @returns {string}
     */
    static escapeHtml(str) {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return (str || "").replace(/[&<>"']/g, (m) => map[m]);
    }
}

/**
 * Servizio di persistenza locale tramite Web Storage API.
 */
class StorageService {
    constructor(storageKey = "magazzino_consegne_v1") {
        this.storageKey = storageKey;
    }

    /**
     * Recupera l'elenco dei clienti da LocalStorage.
     * @returns {Array<Object>}
     */
    loadClients() {
        try {
            const rawData = localStorage.getItem(this.storageKey);
            return rawData ? JSON.parse(rawData) : [];
        } catch (error) {
            console.error("StorageService - Errore durante il caricamento dati:", error);
            return [];
        }
    }

    /**
     * Salva l'elenco dei clienti in LocalStorage.
     * @param {Array<Object>} clients 
     * @returns {boolean}
     */
    saveClients(clients) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(clients));
            return true;
        } catch (error) {
            console.error("StorageService - Errore durante il salvataggio dati:", error);
            return false;
        }
    }
}

/**
 * Gestore delle notifiche temporanee (Toast UI).
 */
class NotificationService {
    constructor(containerId = "toastContainer") {
        this.container = document.getElementById(containerId);
    }

    /**
     * Mostra un messaggio Toast fluttuante.
     * @param {string} message 
     * @param {"success"|"danger"|"warning"} type 
     * @param {number} duration 
     */
    show(message, type = "danger", duration = 3000) {
        if (!this.container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.2s ease";
            setTimeout(() => toast.remove(), 200);
        }, duration);
    }
}

/**
 * Repository locale per la gestione della business logic dei clienti (CRUD, filtri, sorting).
 */
class ClientRepository {
    constructor(storageService) {
        this.storageService = storageService;
        this.clients = this.storageService.loadClients();
        this.isAscending = true;
        this.activeZoneFilter = "TUTTE";
        this.searchQuery = "";
    }

    getAll() {
        return this.clients;
    }

    toggleSortOrder() {
        this.isAscending = !this.isAscending;
        return this.isAscending;
    }

    setActiveZoneFilter(zoneKey) {
        this.activeZoneFilter = zoneKey;
    }

    setSearchQuery(query) {
        this.searchQuery = StringUtils.normalizeKey(query);
    }

    /**
     * Verifica l'esistenza di un duplicato univoco (Nome + Zona).
     * @param {string} name 
     * @param {string} zone 
     * @param {string|null} excludeId 
     * @returns {boolean}
     */
    isDuplicate(name, zone, excludeId = null) {
        const nameKey = StringUtils.normalizeKey(name);
        const zoneKey = StringUtils.normalizeKey(zone);

        return this.clients.some((c) => {
            if (excludeId && c.id === excludeId) return false;
            return (
                StringUtils.normalizeKey(c.nome) === nameKey &&
                StringUtils.normalizeKey(c.zona) === zoneKey
            );
        });
    }

    /**
     * Inserisce un nuovo cliente nel repository.
     * @param {string} name 
     * @param {string} zone 
     * @returns {Object}
     */
    addClient(name, zone) {
        const newClient = {
            id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(),
            nome: StringUtils.sanitizeText(name),
            zona: StringUtils.sanitizeText(zone),
            createdAt: new Date().toISOString()
        };

        this.clients.push(newClient);
        this.storageService.saveClients(this.clients);
        return newClient;
    }

    /**
     * Aggiorna un cliente esistente.
     * @param {string} id 
     * @param {string} name 
     * @param {string} zone 
     * @returns {boolean}
     */
    updateClient(id, name, zone) {
        let updated = false;
        this.clients = this.clients.map((c) => {
            if (c.id === id) {
                updated = true;
                return {
                    ...c,
                    nome: StringUtils.sanitizeText(name),
                    zona: StringUtils.sanitizeText(zone),
                    updatedAt: new Date().toISOString()
                };
            }
            return c;
        });

        if (updated) {
            this.storageService.saveClients(this.clients);
        }
        return updated;
    }

    /**
     * Rimuove un cliente dal repository.
     * @param {string} id 
     * @returns {boolean}
     */
    deleteClient(id) {
        const initialLength = this.clients.length;
        this.clients = this.clients.filter((c) => c.id !== id);
        const removed = this.clients.length < initialLength;

        if (removed) {
            this.storageService.saveClients(this.clients);
        }
        return removed;
    }

    /**
     * Sostituisce l'intera lista clienti (es. ripristino da backup JSON).
     * @param {Array<Object>} newClients 
     */
    replaceDataset(newClients) {
        this.clients = newClients;
        this.storageService.saveClients(this.clients);
    }

    /**
     * Restituisce i clienti filtrati e ordinati in base alle impostazioni correnti.
     * @returns {Array<Object>}
     */
    getFilteredAndSortedClients() {
        let result = this.clients.filter((c) => {
            const matchesQuery =
                StringUtils.normalizeKey(c.nome).includes(this.searchQuery) ||
                StringUtils.normalizeKey(c.zona).includes(this.searchQuery);

            const matchesZone =
                this.activeZoneFilter === "TUTTE" ||
                StringUtils.normalizeKey(c.zona) === this.activeZoneFilter;

            return matchesQuery && matchesZone;
        });

        result.sort((a, b) => {
            const cmp = a.nome.localeCompare(b.nome, "it", { sensitivity: "base" });
            return this.isAscending ? cmp : -cmp;
        });

        return result;
    }
}

/**
 * Gestore dell'interfaccia utente, del rendering del DOM e dell'Event Delegation.
 */
class UIManager {
    constructor(repository, notificationService) {
        this.repo = repository;
        this.notify = notificationService;
        this.currentEditId = null;

        this.cacheDomElements();
    }

    cacheDomElements() {
        this.dom = {
            clienteForm: document.getElementById("clienteForm"),
            inputNome: document.getElementById("nomeCliente"),
            inputZona: document.getElementById("zonaCliente"),
            filtroRicerca: document.getElementById("filtroRicerca"),
            chipsContainer: document.getElementById("chipsContainer"),
            listaClienti: document.getElementById("listaClienti"),
            emptyState: document.getElementById("emptyState"),
            counter: document.getElementById("counter"),
            btnSort: document.getElementById("btnSort"),
            modalEdit: document.getElementById("modalEdit"),
            editForm: document.getElementById("editForm"),
            editNome: document.getElementById("editNomeCliente"),
            editZona: document.getElementById("editZonaCliente"),
            btnCancelEdit: document.getElementById("btnCancelEdit"),
            btnCloseModal: document.getElementById("btnCloseModal"),
            btnExportCSV: document.getElementById("btnExportCSV"),
            btnExportJSON: document.getElementById("btnExportJSON"),
            importJsonInput: document.getElementById("importJsonInput")
        };
    }

    init() {
        this.bindEvents();
        this.render();
    }

    bindEvents() {
        // Form Inserimento Nuovo Cliente
        this.dom.clienteForm.addEventListener("submit", (e) => this.handleCreateSubmit(e));

        // Form Modifica Cliente (Modal)
        this.dom.editForm.addEventListener("submit", (e) => this.handleEditSubmit(e));
        this.dom.btnCancelEdit.addEventListener("click", () => this.closeModal());
        this.dom.btnCloseModal.addEventListener("click", () => this.closeModal());

        // Ricerca e Ordinamento
        this.dom.filtroRicerca.addEventListener("input", (e) => {
            this.repo.setSearchQuery(e.target.value);
            this.render();
        });

        this.dom.btnSort.addEventListener("click", () => {
            const isAsc = this.repo.toggleSortOrder();
            this.dom.btnSort.textContent = isAsc ? "A ➔ Z" : "Z ➔ A";
            this.render();
        });

        // Event Delegation per la Lista Clienti (Modifica ed Eliminazione)
        this.dom.listaClienti.addEventListener("click", (e) => {
            const deleteBtn = e.target.closest(".btn-danger");
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                this.handleDeleteClient(id);
                return;
            }

            const clickableArea = e.target.closest(".cliente-info-clickable");
            if (clickableArea) {
                const id = clickableArea.dataset.id;
                this.openModal(id);
            }
        });

        // Event Delegation per i Chips delle Zone
        this.dom.chipsContainer.addEventListener("click", (e) => {
            const chipBtn = e.target.closest(".chip");
            if (chipBtn) {
                const zoneKey = chipBtn.dataset.zoneKey;
                this.repo.setActiveZoneFilter(zoneKey);
                this.render();
            }
        });

        // Eventi di Backup & Export
        this.dom.btnExportCSV.addEventListener("click", () => this.exportCSV());
        this.dom.btnExportJSON.addEventListener("click", () => this.exportJSON());
        this.dom.importJsonInput.addEventListener("change", (e) => this.importJSON(e));
    }

    handleCreateSubmit(e) {
        e.preventDefault();

        const rawName = this.dom.inputNome.value;
        const rawZone = this.dom.inputZona.value;

        if (!StringUtils.sanitizeText(rawName) || !StringUtils.sanitizeText(rawZone)) {
            this.notify.show("⚠️ Compilare sia il nome che la zona!", "warning");
            return;
        }

        if (this.repo.isDuplicate(rawName, rawZone)) {
            this.notify.show(`⛔ Cliente già presente nella zona "${StringUtils.sanitizeText(rawZone)}"!`, "danger");
            return;
        }

        this.repo.addClient(rawName, rawZone);

        // Reset dei filtri per rendere visibile il nuovo inserimento
        this.repo.setActiveZoneFilter("TUTTE");
        this.repo.setSearchQuery("");
        this.dom.filtroRicerca.value = "";

        this.dom.inputNome.value = "";
        this.dom.inputZona.value = "";
        
        if (document.activeElement) {
            document.activeElement.blur();
        }

        this.render();
        this.notify.show("✅ Cliente salvato con successo!", "success");
    }

    handleEditSubmit(e) {
        e.preventDefault();

        if (!this.currentEditId) return;

        const rawName = this.dom.editNome.value;
        const rawZone = this.dom.editZona.value;

        if (!StringUtils.sanitizeText(rawName) || !StringUtils.sanitizeText(rawZone)) {
            this.notify.show("⚠️ Compilare sia il nome che la zona!", "warning");
            return;
        }

        if (this.repo.isDuplicate(rawName, rawZone, this.currentEditId)) {
            this.notify.show(`⛔ Cliente già presente nella zona "${StringUtils.sanitizeText(rawZone)}"!`, "danger");
            return;
        }

        this.repo.updateClient(this.currentEditId, rawName, rawZone);
        this.closeModal();
        this.render();
        this.notify.show("✏️ Modifiche salvate!", "success");
    }

    handleDeleteClient(id) {
        const client = this.repo.getAll().find((c) => c.id === id);
        const name = client ? client.nome : "il cliente";

        if (confirm(`Rimuovere definitivamente "${name}"?`)) {
            this.repo.deleteClient(id);
            this.render();
            this.notify.show(`🗑️ "${name}" rimosso.`, "danger");
        }
    }

    openModal(id) {
        const client = this.repo.getAll().find((c) => c.id === id);
        if (!client) return;

        this.currentEditId = id;
        this.dom.editNome.value = client.nome;
        this.dom.editZona.value = client.zona;

        this.dom.modalEdit.classList.add("active");
        this.dom.modalEdit.setAttribute("aria-hidden", "false");
    }

    closeModal() {
        this.dom.modalEdit.classList.remove("active");
        this.dom.modalEdit.setAttribute("aria-hidden", "true");
        this.currentEditId = null;

        if (document.activeElement) {
            document.activeElement.blur();
        }
    }

    renderChips() {
        const allClients = this.repo.getAll();
        this.dom.chipsContainer.innerHTML = "";

        if (allClients.length === 0) return;

        const zoneMap = new Map();
        allClients.forEach((c) => {
            const key = StringUtils.normalizeKey(c.zona);
            if (!zoneMap.has(key)) {
                zoneMap.set(key, c.zona);
            }
        });

        const sortedZones = Array.from(zoneMap.entries()).sort((a, b) =>
            a[1].localeCompare(b[1], "it")
        );

        const fragment = document.createDocumentFragment();

        // Chip "Tutte"
        const chipAll = document.createElement("button");
        chipAll.type = "button";
        chipAll.className = `chip ${this.repo.activeZoneFilter === "TUTTE" ? "active" : ""}`;
        chipAll.dataset.zoneKey = "TUTTE";
        chipAll.textContent = `Tutte (${allClients.length})`;
        fragment.appendChild(chipAll);

        // Chip singole zone
        sortedZones.forEach(([key, name]) => {
            const count = allClients.filter((c) => StringUtils.normalizeKey(c.zona) === key).length;
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = `chip ${this.repo.activeZoneFilter === key ? "active" : ""}`;
            chip.dataset.zoneKey = key;
            chip.textContent = `${name} (${count})`;
            fragment.appendChild(chip);
        });

        this.dom.chipsContainer.appendChild(fragment);
    }

    render() {
        const clientsToDisplay = this.repo.getFilteredAndSortedClients();
        this.renderChips();

        this.dom.listaClienti.innerHTML = "";
        this.dom.counter.textContent = `${clientsToDisplay.length} clienti`;

        if (clientsToDisplay.length === 0) {
            this.dom.emptyState.style.display = "block";
            return;
        }

        this.dom.emptyState.style.display = "none";
        const fragment = document.createDocumentFragment();

        clientsToDisplay.forEach((client) => {
            const li = document.createElement("li");
            li.className = "cliente-item";
            li.innerHTML = `
                <div class="cliente-info-clickable" data-id="${client.id}" title="Modifica ${StringUtils.escapeHtml(client.nome)}">
                    <div>
                        <div class="cliente-nome">${StringUtils.escapeHtml(client.nome)}</div>
                        <div class="cliente-zona">📍 ${StringUtils.escapeHtml(client.zona)}</div>
                    </div>
                    <span class="edit-icon" aria-hidden="true">✏️</span>
                </div>
                <button type="button" class="btn btn-danger" data-id="${client.id}" aria-label="Elimina ${StringUtils.escapeHtml(client.nome)}">Elimina</button>
            `;
            fragment.appendChild(li);
        });

        this.dom.listaClienti.appendChild(fragment);
    }

    exportCSV() {
        const clients = this.repo.getAll();
        if (clients.length === 0) {
            this.notify.show("⚠️ Nessun cliente presente da esportare!", "warning");
            return;
        }

        let csvContent = "\uFEFFCliente;Zona;Data Inserimento\n";
        clients.forEach((c) => {
            const dateStr = c.createdAt ? new Date(c.createdAt).toLocaleString("it-IT") : "-";
            const name = `"${c.nome.replace(/"/g, '""')}"`;
            const zone = `"${c.zona.replace(/"/g, '""')}"`;
            csvContent += `${name};${zone};"${dateStr}"\n`;
        });

        this.downloadFile(csvContent, `clienti_${this.getFormattedDate()}.csv`, "text/csv;charset=utf-8;");
        this.notify.show("📊 File CSV generato!", "success");
    }

    exportJSON() {
        const clients = this.repo.getAll();
        if (clients.length === 0) {
            this.notify.show("⚠️ Nessun dato presente per il backup!", "warning");
            return;
        }

        const jsonContent = JSON.stringify(clients, null, 2);
        this.downloadFile(jsonContent, `backup_clienti_${this.getFormattedDate()}.json`, "application/json");
        this.notify.show("💾 Backup JSON scaricato!", "success");
    }

    importJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!Array.isArray(parsed)) throw new Error("Formato non valido");

                const validClients = parsed.filter((c) => c && c.nome && c.zona);
                if (validClients.length === 0) {
                    this.notify.show("⛔ Nessun cliente valido trovato nel file JSON!", "danger");
                    return;
                }

                if (confirm(`Ripristinare ${validClients.length} clienti? I dati locali attuali verranno sovrascritti.`)) {
                    this.repo.replaceDataset(validClients);
                    this.render();
                    this.notify.show(`📥 Ripristinati ${validClients.length} clienti!`, "success");
                }
            } catch (err) {
                console.error("Errore lettura JSON:", err);
                this.notify.show("⛔ Impossibile leggere il file di backup!", "danger");
            } finally {
                event.target.value = "";
            }
        };

        reader.readAsText(file);
    }

    downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    getFormattedDate() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
}

/**
 * Inizializzazione globale dell'applicazione e del Service Worker PWA.
 */
document.addEventListener("DOMContentLoaded", () => {
    const storageService = new StorageService();
    const notificationService = new NotificationService();
    const repository = new ClientRepository(storageService);
    const uiManager = new UIManager(repository, notificationService);

    uiManager.init();
    registerServiceWorker();
});

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./sw.js").catch((err) => {
            console.warn("Service Worker non registrato:", err);
        });
    }
}