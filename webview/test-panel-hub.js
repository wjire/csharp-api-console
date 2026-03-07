const vscode = acquireVsCodeApi();

const state = {
    data: {
        currentPanels: [],
        favorites: []
    }
};

const listRoot = document.getElementById('listRoot');

window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type !== 'state') {
        return;
    }

    state.data = message.data || { currentPanels: [], favorites: [] };
    render();
});

function render() {
    const items = state.data.currentPanels;

    if (items.length === 0) {
        listRoot.innerHTML = '<div class="empty">No panels to show.</div>';
        return;
    }

    listRoot.innerHTML = items.map(renderCard).join('');

    for (const el of listRoot.querySelectorAll('.card[data-panel-id]')) {
        el.addEventListener('click', () => {
            const panelId = el.dataset.panelId || '';
            if (!panelId) {
                return;
            }
            vscode.postMessage({ type: 'revealPanel', data: { panelId } });
        });
    }
}

function renderCard(item) {
    const panelId = item.id || item.panelId || '';
    const activeClass = item.isActive ? 'is-active' : '';
    const method = String(item.method || '').toUpperCase();
    const methodClass = `method method-${method || 'ANY'}`;

    return `
        <article class="card ${activeClass}" data-panel-id="${escapeHtml(panelId)}">
            <div class="card-head">
                <div class="${escapeHtml(methodClass)}">${escapeHtml(method || 'ANY')}</div>
                <div class="title" title="${escapeHtml(item.displayName)}">${escapeHtml(item.displayName)}</div>
            </div>
            <div class="route" title="${escapeHtml(item.route || '')}">${escapeHtml(item.route || '')}</div>
        </article>
    `;
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

vscode.postMessage({ type: 'ready' });
