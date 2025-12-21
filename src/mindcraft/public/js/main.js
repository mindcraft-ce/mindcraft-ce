const socket = io({ path: window.location.pathname + 'socket.io' })
const agentsDiv = document.getElementById('agents');
const Handlebars = window.Handlebars;
let settingsSpec = {};
let profileData = null;
const agentSettings = {};
const agentLastMessage = {};
const inventoryOpen = {};
let currentAgents = [];

const statusEl = document.getElementById('msStatus');
function updateStatus(connected) {
    if (!statusEl) return;
    if (connected) {
        statusEl.textContent = 'MindServer online';
        statusEl.classList.remove('offline');
        statusEl.classList.add('online');
    } else {
        statusEl.textContent = 'MindServer offline';
        statusEl.classList.remove('online');
        statusEl.classList.add('offline');
    }
}
function subscribeToState() {
    socket.emit('listen-to-agents');
}
// Initial status
updateStatus(false);
socket.on('connect', () => {
    updateStatus(true);
    subscribeToState();
    // Clear all cached settings on reconnect
    Object.keys(agentSettings).forEach(name => delete agentSettings[name]);
});
socket.on('disconnect', () => {
    updateStatus(false);
});
socket.on('connect_error', () => {
    updateStatus(false);
});

fetch('/settings_spec.json')
    .then(r => r.json())
    .then(spec => {
        settingsSpec = spec;
        buildSettingsForm();
    });

function buildSettingsForm() {
    const form = document.getElementById('settingsForm');
    form.innerHTML = '';
    // ensure grid for multi-column layout
    form.style.display = 'grid';
    form.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    form.style.gap = '8px';
    Object.keys(settingsSpec).forEach(key => {
        if (key === 'profile') return; // profile handled via upload
        const cfg = settingsSpec[key];
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-wrapper';
        const label = document.createElement('label');
        label.textContent = key;
        label.title = cfg.description || '';
        let input;
        switch (cfg.type) {
            case 'boolean':
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = cfg.default === true;
                break;
            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.value = cfg.default;
                break;
            default:
                input = document.createElement('input');
                input.type = 'text';
                input.value = typeof cfg.default === 'object' ? JSON.stringify(cfg.default) : cfg.default;
        }
        input.title = cfg.description || '';
        input.id = `setting-${key}`;
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        form.appendChild(wrapper);
    });
}

document.getElementById('uploadProfileBtn').addEventListener('click', () => {
    document.getElementById('profileFileInput').click();
});

document.getElementById('profileFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            profileData = JSON.parse(ev.target.result);
            document.getElementById('submitCreateAgentBtn').disabled = false;
            document.getElementById('profileStatus').textContent = `Profile: ${profileData.name || 'Uploaded'}`;
            document.getElementById('createError').textContent = '';
        } catch (err) {
            document.getElementById('createError').textContent = 'Invalid profile JSON: ' + err.message;
            profileData = null;
            document.getElementById('submitCreateAgentBtn').disabled = true;
            document.getElementById('profileStatus').textContent = 'Profile: Not uploaded';
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('submitCreateAgentBtn').addEventListener('click', () => {
    if (!profileData) return;
    const settings = { profile: profileData };
    Object.keys(settingsSpec).forEach(key => {
        if (key === 'profile') return;
        const input = document.getElementById(`setting-${key}`);
        if (!input) return;
        const type = settingsSpec[key].type;
        let val;
        if (type === 'boolean') val = input.checked;
        else if (type === 'number') val = Number(input.value);
        else if (type === 'array' || type === 'object') {
            try { val = JSON.parse(input.value); }
            catch { val = input.value; }
        } else val = input.value;
        settings[key] = val;
    });
    socket.emit('create-agent', settings, res => {
        if (!res.success) {
            document.getElementById('createError').textContent = res.error || 'Unknown error';
        } else {
            // reset on success
            profileData = null;
            document.getElementById('submitCreateAgentBtn').disabled = true;
            document.getElementById('profileStatus').textContent = 'Profile: Not uploaded';
            document.getElementById('createError').textContent = '';
            hideCreateAgentModal();
        }
    });
});

// Modal open/close logic
const modalBackdrop = document.getElementById('createAgentModal');
document.getElementById('openCreateAgentBtn').addEventListener('click', () => {
    buildSettingsForm();
    modalBackdrop.style.display = 'flex';
});
function hideCreateAgentModal() {
    modalBackdrop.style.display = 'none';
}
document.getElementById('closeCreateAgentBtn').addEventListener('click', hideCreateAgentModal);

socket.on('bot-output', (agentName, message) => {
    agentLastMessage[agentName] = message;
    const messageDiv = document.getElementById(`lastMessage-${agentName}`);
    if (messageDiv) {
        messageDiv.textContent = message;
    }
});

// Subscribe to aggregated state updates (re-sent on each connect)
socket.on('state-update', (states) => {
    window.lastStates = states;
    Object.keys(states || {}).forEach(name => {
        const st = states[name];
        const healthEl = document.getElementById(`health-${name}`);
        if (st && !st.error) {
            const gp = st.gameplay || {};
            if (healthEl && typeof gp.health === 'number') {
                const hMax = typeof gp.healthMax === 'number' ? gp.healthMax : 20;
                healthEl.textContent = `health: ${gp.health}/${hMax}`;
            }
            const posEl = document.getElementById(`pos-${name}`);
            const hunEl = document.getElementById(`hunger-${name}`);
            const bioEl = document.getElementById(`biome-${name}`);
            const modeEl = document.getElementById(`mode-${name}`);
            const itemsEl = document.getElementById(`items-${name}`);
            const equippedEl = document.getElementById(`equipped-${name}`);
            const invGrid = document.getElementById(`inventory-${name}`);
            const actionEl = document.getElementById(`action-${name}`);
            if (posEl && gp.position) {
                const p = gp.position;
                posEl.textContent = `x ${p.x}, y ${p.y}, z ${p.z}`;
            }
            if (hunEl && typeof gp.hunger === 'number') {
                const fMax = typeof gp.hungerMax === 'number' ? gp.hungerMax : 20;
                hunEl.textContent = `hunger: ${gp.hunger}/${fMax}`;
            }
            if (bioEl && gp.biome) bioEl.textContent = `biome: ${gp.biome}`;
            if (modeEl && gp.gamemode) modeEl.textContent = `gamemode: ${gp.gamemode}`;
            if (itemsEl && st.inventory) {
                const used = st.inventory.stacksUsed ?? 0;
                const total = st.inventory.totalSlots ?? 0;
                itemsEl.textContent = `inventory slots: ${used}/${total}`;
            }
            if (equippedEl && st.inventory?.equipment) {
                const e = st.inventory.equipment;
                equippedEl.textContent = `equipped: ${e.mainHand || 'none'}`;
            }
            const armorEl = document.getElementById(`armor-${name}`);
            if (armorEl && st.inventory?.equipment) {
                const e = st.inventory.equipment;
                const armor = [];
                if (e.helmet) armor.push(`head: ${e.helmet}`);
                if (e.chestplate) armor.push(`chest: ${e.chestplate}`);
                if (e.leggings) armor.push(`legs: ${e.leggings}`);
                if (e.boots) armor.push(`feet: ${e.boots}`);
                armorEl.textContent = `armor: ${armor.length ? armor.join(', ') : 'none'}`;
            }
            if (actionEl && st.action) {
                actionEl.textContent = `${st.action.current || 'Idle'}`;
            }
            if (invGrid && st.inventory?.counts) {
                const counts = st.inventory.counts;
                invGrid.innerHTML = Object.keys(counts).length ?
                    Object.entries(counts).map(([k, v]) => `<div class="cell">${k}: ${v}</div>`).join('') :
                    '<div class="cell">(empty)</div>';
            }
        }
    });
});

function fetchAgentSettings(name) {
    return new Promise((resolve) => {
        if (agentSettings[name]) { resolve(agentSettings[name]); return; }
        socket.emit('get-settings', name, res => {
            if (res.settings) {
                agentSettings[name] = res.settings;
                resolve(res.settings);
            } else resolve(null);
        });
    });
}

// Agent settings modal logic
const agentSettingsModal = document.getElementById('agentSettingsModal');
const agentSettingsForm = document.getElementById('agentSettingsForm');
const applyBtn = document.getElementById('applyAgentSettingsBtn');
const discardBtn = document.getElementById('discardAgentSettingsBtn');
const closeAgentSettingsBtn = document.getElementById('closeAgentSettingsBtn');
const agentSettingsTitle = document.getElementById('agentSettingsTitle');
let currentAgentName = null;
let originalAgentSettings = null;

function buildAgentSettingsForm(settings) {
    agentSettingsForm.innerHTML = '';
    agentSettingsForm.style.display = 'grid';
    agentSettingsForm.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    agentSettingsForm.style.gap = '8px';
    Object.keys(settingsSpec).forEach(key => {
        if (key === 'profile') return; // profile not edited here
        const cfg = settingsSpec[key];
        const wrapper = document.createElement('div');
        wrapper.className = 'setting-wrapper';
        const label = document.createElement('label');
        label.textContent = key;
        label.title = cfg.description || '';
        let input;
        switch (cfg.type) {
            case 'boolean':
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = Boolean(settings[key]);
                break;
            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.value = settings[key] ?? cfg.default ?? 0;
                break;
            default:
                input = document.createElement('input');
                input.type = 'text';
                const defVal = settings[key] ?? cfg.default ?? '';
                input.value = typeof defVal === 'object' ? JSON.stringify(defVal) : defVal;
        }
        input.id = `agent-setting-${key}`;
        input.addEventListener('input', onAgentSettingsChanged);
        if (input.type === 'checkbox') input.addEventListener('change', onAgentSettingsChanged);
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        agentSettingsForm.appendChild(wrapper);
    });
    onAgentSettingsChanged();
}

function openAgentSettings(name) {
    currentAgentName = name;
    agentSettingsTitle.textContent = `${name} Settings`;
    fetchAgentSettings(name).then(settings => {
        originalAgentSettings = JSON.parse(JSON.stringify(settings || {}));
        buildAgentSettingsForm(settings || {});
        agentSettingsModal.style.display = 'flex';
    });
}
window.openAgentSettings = openAgentSettings;

function getEditedAgentSettings() {
    const newSettings = { profile: (originalAgentSettings && originalAgentSettings.profile) || {} };
    Object.keys(settingsSpec).forEach(key => {
        if (key === 'profile') return;
        const cfg = settingsSpec[key];
        const input = document.getElementById(`agent-setting-${key}`);
        if (!input) return;
        let val;
        if (cfg.type === 'boolean') val = input.checked;
        else if (cfg.type === 'number') val = Number(input.value);
        else if (cfg.type === 'array' || cfg.type === 'object') {
            try { val = JSON.parse(input.value); }
            catch { val = input.value; }
        } else val = input.value;
        newSettings[key] = val;
    });
    return newSettings;
}

function shallowEqual(a, b) {
    if (!a || !b) return false;
    const keys = Object.keys(settingsSpec).filter(k => k !== 'profile');
    for (const k of keys) {
        const va = a[k];
        const vb = b[k];
        if (typeof va === 'object' || typeof vb === 'object') {
            if (JSON.stringify(va) !== JSON.stringify(vb)) return false;
        } else if (va !== vb) return false;
    }
    return true;
}

function onAgentSettingsChanged() {
    if (!originalAgentSettings) { applyBtn.disabled = true; return; }
    const edited = getEditedAgentSettings();
    applyBtn.disabled = shallowEqual(edited, originalAgentSettings);
}

function closeAgentSettings() {
    agentSettingsModal.style.display = 'none';
    currentAgentName = null;
    originalAgentSettings = null;
}

function updateAgentViewer(name) {
    const agentEl = document.getElementById(`agent-${name}`);
    if (!agentEl) return;

    const settings = agentSettings[name];
    const viewerContainer = agentEl.querySelector('.agent-view-container');
    if (!viewerContainer) return;

    const agentState = currentAgents.find(a => a.name === name);
    const shouldShow = agentState?.in_game && settings?.render_bot_view === true;
    viewerContainer.parentElement.style.display = shouldShow ? '' : 'none';
}

discardBtn.addEventListener('click', () => {
    if (!currentAgentName || !originalAgentSettings) return;
    buildAgentSettingsForm(originalAgentSettings);
});

applyBtn.addEventListener('click', () => {
    if (!currentAgentName) return;
    const edited = getEditedAgentSettings();
    socket.emit('set-agent-settings', currentAgentName, edited);
    // Update local settings immediately
    agentSettings[currentAgentName] = { ...edited, fetched: true };
    updateAgentViewer(currentAgentName);
    closeAgentSettings();
});

closeAgentSettingsBtn.addEventListener('click', closeAgentSettings);


function renderAgentCard(agent) {
    const cfg = agentSettings[agent.name] || {};

    const data = {
        agent: agent,
        cfg: cfg,
        showViewer: agent.in_game && cfg.render_bot_view === true,
        viewerPort: agent.viewerPort,
        lastMessage: agentLastMessage[agent.name] || '',
        invOpen: inventoryOpen[agent.name] === true,
        invStyle: (inventoryOpen[agent.name] === true) ? '' : 'display:none;',
    };
    let html = loadTemplate('agent', data);
    console.log('Rendered agent card HTML:', html);
    return html;
}

async function renderAgents(agents) {
    if (!agents.length) {
        agentsDiv.innerHTML = '<div class="agent">No agents connected</div>';
        return;
    }

    // If agentsDiv is empty, do a full render
    if (!agentsDiv.children.length) {
        agentsDiv.innerHTML = agents.map(agent => renderAgentCard(agent)).join('');
        // Update all viewers after initial render
        setTimeout(() => {
            agents.forEach(a => {
                if (a.in_game) updateAgentViewer(a.name);
            });
        }, 0);
        return;
    }

    // Compare with current agents to find changes
    const prevAgents = currentAgents.reduce((acc, a) => ({ ...acc, [a.name]: a }), {});
    const changedAgents = agents.filter(a => {
        const prev = prevAgents[a.name];
        return !prev || prev.in_game !== a.in_game || prev.viewerPort !== a.viewerPort || prev.socket_connected !== a.socket_connected;
    });

    // Update only changed agents
    changedAgents.forEach(agent => {
        const el = document.getElementById(`agent-${agent.name}`);
        if (el) {
            // Update existing card
            el.outerHTML = renderAgentCard(agent);
            if (agent.in_game) updateAgentViewer(agent.name);
        } else {
            // Add new card
            agentsDiv.insertAdjacentHTML('beforeend', renderAgentCard(agent));
            if (agent.in_game) updateAgentViewer(agent.name);
        }
    });

    // Remove cards for agents that no longer exist
    Array.from(agentsDiv.children).forEach(el => {
        const name = el.id.replace('agent-', '');
        if (!agents.find(a => a.name === name)) {
            el.remove();
            delete inventoryOpen[name];
        }
    });
}

socket.on('agents-status', async (agents) => {
    // Fetch settings for all agents that don't have current settings
    const needSettings = agents.filter(a => !agentSettings[a.name]);
    if (needSettings.length > 0) {
        await Promise.all(needSettings.map(async (a) => {
            const settings = await fetchAgentSettings(a.name);
            if (settings) {
                agentSettings[a.name] = settings;
            }
        }));
    }

    // Compare with current agents to find changes
    const prevAgents = currentAgents.reduce((acc, a) => ({ ...acc, [a.name]: a }), {});
    const changedAgents = agents.filter(a => {
        const prev = prevAgents[a.name];
        return !prev || prev.in_game !== a.in_game || prev.viewerPort !== a.viewerPort || prev.socket_connected !== a.socket_connected;
    });

    // Update current agents list
    currentAgents = agents;

    // If agentsDiv is empty, do a full render
    if (!agentsDiv.children.length) {
        agentsDiv.innerHTML = agents.map(agent => renderAgentCard(agent)).join('');
        // Update all viewers after initial render
        setTimeout(() => {
            agents.forEach(a => {
                if (a.in_game) updateAgentViewer(a.name);
            });
        }, 0);
        return;
    }

    // Update only changed agents
    changedAgents.forEach(agent => {
        const el = document.getElementById(`agent-${agent.name}`);
        if (el) {
            // Update existing card
            el.outerHTML = renderAgentCard(agent);
            if (agent.in_game) updateAgentViewer(agent.name);
        } else {
            // Add new card
            agentsDiv.insertAdjacentHTML('beforeend', renderAgentCard(agent));
            if (agent.in_game) updateAgentViewer(agent.name);
        }
    });

    // Remove cards for agents that no longer exist
    Array.from(agentsDiv.children).forEach(el => {
        const name = el.id.replace('agent-', '');
        if (!agents.find(a => a.name === name)) {
            el.remove();
            delete inventoryOpen[name];
        }
    });
});

function restartAgent(n) { socket.emit('restart-agent', n); }
function disconnectAgent(n) { socket.emit('stop-agent', n); }
function startAgent(n) {
    const btn = document.querySelector(`button[onclick="startAgent('${n}')"]`);
    if (btn) {
        btn.textContent = 'Connecting...';
        btn.disabled = true;
        // Re-enable after 10s if still disabled (agent failed to connect)
        setTimeout(() => {
            const retryBtn = document.querySelector(`button[onclick=\\"startAgent('${n}')\\"]`);
            const agentState = (window.currentAgents || []).find(a => a.name === n);
            const stillWaiting = agentState ? (!agentState.in_game && !agentState.socket_connected) : true;
            if (retryBtn && stillWaiting) {
                retryBtn.disabled = false;
                retryBtn.textContent = 'Connect';
            }
        }, 10000);
    }
    socket.emit('start-agent', n);
}
function stopAgent(n) { socket.emit('stop-agent', n); }
function destroyAgent(n) { socket.emit('destroy-agent', n); }
function disconnectAllAgents() {
    socket.emit('stop-all-agents');
}
function confirmShutdown() {
    if (confirm('Are you sure you want to perform a full shutdown?\nThis will stop all agents and close the server.')) {
        socket.emit('shutdown');
    }
}
function sendMessage(n, m) {
    if (!m || !m.trim()) return;
    socket.emit('send-message', n, { from: 'ADMIN', message: m });
    const input = document.getElementById(`messageInput-${n}`);
    const btn = document.getElementById(`sendBtn-${n}`);
    if (input) input.value = '';
    if (btn) btn.disabled = true;
}
function onMsgInputChange(name) {
    const input = document.getElementById(`messageInput-${name}`);
    const btn = document.getElementById(`sendBtn-${name}`);
    if (btn && input) {
        btn.disabled = !(input.value && input.value.trim().length > 0);
    }
}

function toggleDetails(name) {
    const invSection = document.getElementById(`inventorySection-${name}`);
    if (!invSection) return;
    const visible = invSection.style.display !== 'none';
    const newVisible = !visible;
    invSection.style.display = newVisible ? '' : 'none';
    inventoryOpen[name] = newVisible;
}
/*
function loadTemplate(templateName, data) {
    return new Promise((resolve, reject) => {
        fetch(`/templates/${templateName}.hbs`)
            .then(response => response.text())
            .then(templateSource => {
                const template = Handlebars.compile(templateSource);
                const html = template(data);
                resolve(html);
            })
            .catch(err => reject(err));
    });
}
*/
function loadTemplate(templateName, data) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/templates/${templateName}.hbs`, false); // synchronous
    xhr.send(null);
    if (xhr.status === 200) {
        const templateSource = xhr.responseText;
        const template = Handlebars.compile(templateSource);
        const html = template(data);
        return html;
    } else {
        throw new Error(`Failed to load template ${templateName}: ${xhr.statusText}`);
    }
}

window.toggleDetails = toggleDetails;

Handlebars.registerHelper('ternary', function (condition, valIfTrue, valIfFalse) {
    return condition ? valIfTrue : valIfFalse;
});

// if with two conditions
Handlebars.registerHelper('ifAnd', function (cond1, condState, cond2, cond2State, options) {
    if (cond1 == condState && cond2 == cond2State) {
        return options.fn(this);
    } else {
        return options.inverse(this);
    }
});