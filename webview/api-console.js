(() => {
    // 获取 VS Code API
    const vscode = acquireVsCodeApi();

    // 国际化文本
    let i18nTexts = {};

    // 获取国际化文本的辅助函数
    function t(key) {
        return i18nTexts[key] || key;
    }

    // 全局变量存储当前 API 端点信息
    let currentApiEndpoint = null;
    let savedBaseUrls = []; // 存储用户保存的 base URLs
    let defaultBaseUrl = ''; // 默认的 base URL (来自 launchSettings.json)
    let currentBodyMode = 'json';
    let currentDebugState = 'idle';
    let largeResponseThresholdBytes = 1024 * 1024;
    let maxRenderLineNumbers = 2000;
    let jsonIndentSpaces = 2;
    let latestResponseText = '';
    let hasUserEditedRequest = false;
    let suppressRequestDirtyTracking = false;
    let queryQuickApplyTimer = null;
    let queryRowsSyncTimer = null;
    let suppressQueryQuickInputAutoApply = false;
    let restoredBinaryBodyBase64 = '';
    let restoredBinaryContentType = '';
    let restoredBinaryFileName = '';
    let isMockAllLoading = false;
    let activeBaseUrlOptionIndex = -1;
    let panelSplitRatio = 0.5;
    const PANEL_STACK_THRESHOLD = 980;

    function markRequestDirty() {
        if (!suppressRequestDirtyTracking) {
            hasUserEditedRequest = true;
        }

        updateRequestTabBadges();
    }

    function setRequestTabBadge(tabName, hasData) {
        const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (!tab) {
            return;
        }

        if (hasData) {
            tab.setAttribute('data-badge', '1');
            tab.classList.add('has-badge');
            return;
        }

        tab.removeAttribute('data-badge');
        tab.classList.remove('has-badge');
    }

    function hasBodyData() {
        const bodyText = (document.getElementById('bodyEditor')?.value || '').trim();
        if (bodyText.length > 0) {
            return true;
        }

        if (restoredBinaryBodyBase64 || restoredBinaryFileName) {
            return true;
        }

        const binaryFileInput = document.getElementById('binaryFileInput');
        if (binaryFileInput?.files?.length) {
            return true;
        }

        const formRows = Array.from(document.querySelectorAll('#formDataList .formdata-row'));
        return formRows.some((row) => {
            const key = (row.querySelector('.formdata-key')?.value || '').trim();
            const textValue = (row.querySelector('.formdata-value-input')?.value || '').trim();
            const fileInput = row.querySelector('.formdata-file-input');
            const hasFile = !!(fileInput?.files?.length) || !!(row.dataset.valueBase64 || '').trim();
            return key.length > 0 || textValue.length > 0 || hasFile;
        });
    }

    function hasAuthData() {
        return (document.getElementById('tokenInput')?.value || '').trim().length > 0;
    }

    function hasHeadersData() {
        const rows = Array.from(document.querySelectorAll('#headersList .param-row'));
        return rows.some((row) => {
            const inputs = row.querySelectorAll('.param-input');
            const key = (inputs[0]?.value || '').trim();
            return key.length > 0;
        });
    }

    function hasQueryData() {
        const rows = Array.from(document.querySelectorAll('#queryList .param-row'));
        return rows.some((row) => {
            const inputs = row.querySelectorAll('.param-input');
            const key = (inputs[0]?.value || '').trim();
            return key.length > 0;
        });
    }

    function updateRequestTabBadges() {
        setRequestTabBadge('body', hasBodyData());
        setRequestTabBadge('auth', hasAuthData());
        setRequestTabBadge('headers', hasHeadersData());
        setRequestTabBadge('query', hasQueryData());
    }

    function withSuppressedDirtyTracking(callback) {
        suppressRequestDirtyTracking = true;
        try {
            callback();
        } finally {
            suppressRequestDirtyTracking = false;
        }
    }

    function applyPanelSplitRatio() {
        const mainContent = document.querySelector('.main-content');
        const leftPanel = document.querySelector('.left-panel');
        const rightPanel = document.querySelector('.right-panel');
        if (!mainContent || !leftPanel || !rightPanel) {
            return;
        }

        const shouldStack = mainContent.clientWidth < PANEL_STACK_THRESHOLD;
        mainContent.classList.toggle('stacked', shouldStack);

        if (shouldStack) {
            leftPanel.style.flex = '';
            rightPanel.style.flex = '';
            leftPanel.style.width = '';
            rightPanel.style.width = '';
            return;
        }

        const splitterWidth = 8;
        const containerWidth = mainContent.clientWidth;
        const availableWidth = Math.max(containerWidth - splitterWidth, 0);
        const minPanelWidth = 360;

        let leftWidth = minPanelWidth;
        let rightWidth = minPanelWidth;

        if (availableWidth >= minPanelWidth * 2) {
            const minRatio = Math.min(0.45, minPanelWidth / availableWidth);
            const maxRatio = Math.max(0.55, 1 - (minPanelWidth / availableWidth));
            const safeMinRatio = Math.max(0.15, Math.min(minRatio, 0.5));
            const safeMaxRatio = Math.min(0.85, Math.max(maxRatio, 0.5));

            panelSplitRatio = Math.max(safeMinRatio, Math.min(safeMaxRatio, panelSplitRatio));

            leftWidth = Math.round(availableWidth * panelSplitRatio);
            rightWidth = Math.max(availableWidth - leftWidth, minPanelWidth);
        }

        leftPanel.style.flex = '0 0 auto';
        rightPanel.style.flex = '0 0 auto';
        leftPanel.style.width = `${leftWidth}px`;
        rightPanel.style.width = `${rightWidth}px`;
    }

    function initializePanelSplitter() {
        const mainContent = document.querySelector('.main-content');
        const splitter = document.getElementById('panelSplitter');
        if (!mainContent || !splitter) {
            return;
        }

        let dragging = false;

        const handlePointerMove = (event) => {
            if (!dragging) {
                return;
            }

            const rect = mainContent.getBoundingClientRect();
            const splitterWidth = 8;
            const availableWidth = Math.max(rect.width - splitterWidth, 0);
            if (availableWidth <= 0) {
                return;
            }

            const rawLeftWidth = event.clientX - rect.left;
            const minPanelWidth = 320;
            const clampedLeft = Math.max(minPanelWidth, Math.min(rawLeftWidth, availableWidth - minPanelWidth));
            panelSplitRatio = clampedLeft / availableWidth;
            applyPanelSplitRatio();
        };

        const stopDragging = () => {
            if (!dragging) {
                return;
            }

            dragging = false;
            splitter.classList.remove('dragging');
            document.body.style.userSelect = '';
            document.removeEventListener('pointermove', handlePointerMove);
            document.removeEventListener('pointerup', stopDragging);
        };

        splitter.addEventListener('pointerdown', (event) => {
            if (mainContent.classList.contains('stacked')) {
                return;
            }

            event.preventDefault();
            dragging = true;
            splitter.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.addEventListener('pointermove', handlePointerMove);
            document.addEventListener('pointerup', stopDragging);
        });

        window.addEventListener('resize', applyPanelSplitRatio);

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => applyPanelSplitRatio());
            observer.observe(mainContent);
        }

        applyPanelSplitRatio();
    }

    function getBodyModePanelId(mode) {
        if (mode === 'formdata') {
            return 'bodyModeFormData';
        }
        return `bodyMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
    }

    function activateBodyMode(mode) {
        currentBodyMode = mode;

        document.querySelectorAll('.body-mode-tab').forEach(t => t.classList.remove('active'));
        const selectedTab = document.querySelector(`.body-mode-tab[data-body-mode="${mode}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
        }

        document.querySelectorAll('.body-mode-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(getBodyModePanelId(mode));
        if (panel) {
            panel.classList.add('active');
        }

        const formatJsonBtn = document.getElementById('formatJsonBtn');
        if (formatJsonBtn) {
            formatJsonBtn.style.display = mode === 'json' ? 'inline-block' : 'none';
        }
    }

    // 通知扩展 WebView 已准备好
    vscode.postMessage({ type: 'webviewReady' });
    // 注意：不再主动请求 baseUrls，后端会在初始化完成后主动发送

    initializePanelSplitter();

    // 响应体全选功能
    const responseBodyWrapper = document.getElementById('responseBodyWrapper');
    const bodyPanel = document.getElementById('bodyPanel');

    if (responseBodyWrapper && bodyPanel) {
        // 点击响应面板任何地方都聚焦到代码内容
        bodyPanel.addEventListener('click', (e) => {
            responseBodyWrapper.focus();
        });

        // 监听 Ctrl+A / Cmd+A
        responseBodyWrapper.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                e.stopPropagation();
                const selection = window.getSelection();
                const range = document.createRange();
                const codeElement = document.getElementById('responseBody');
                if (codeElement && codeElement.textContent) {
                    range.selectNodeContents(codeElement);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        });
    }

    // === Base URL Management ===

    function normalizeBaseUrl(baseUrl) {
        const trimmed = typeof baseUrl === 'string' ? baseUrl.trim() : '';
        if (!trimmed) {
            return '';
        }

        return trimmed.replace(/\/+$/, '');
    }

    function normalizeBaseUrlKey(baseUrl) {
        return normalizeBaseUrl(baseUrl).toLowerCase();
    }

    function getMergedBaseUrls() {
        const merged = [];
        const keys = new Set();

        const pushUnique = (value) => {
            const normalized = normalizeBaseUrl(value);
            if (!normalized) {
                return;
            }

            const key = normalizeBaseUrlKey(normalized);
            if (keys.has(key)) {
                return;
            }

            keys.add(key);
            merged.push(normalized);
        };

        pushUnique(defaultBaseUrl);
        savedBaseUrls.forEach(pushUnique);

        return merged;
    }

    function getNormalizedSavedBaseUrls() {
        const unique = [];
        const keys = new Set();

        savedBaseUrls.forEach((value) => {
            const normalized = normalizeBaseUrl(value);
            if (!normalized) {
                return;
            }

            const key = normalizeBaseUrlKey(normalized);
            if (keys.has(key)) {
                return;
            }

            keys.add(key);
            unique.push(normalized);
        });

        return unique;
    }

    function getBaseUrlDropdownElements() {
        return {
            input: document.getElementById('baseUrlInput'),
            dropdown: document.getElementById('baseUrlDropdown')
        };
    }

    function getRenderedBaseUrlOptions() {
        const { dropdown } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return [];
        }

        return Array.from(dropdown.querySelectorAll('.base-url-dropdown-option'));
    }

    function closeBaseUrlDropdown() {
        const { dropdown } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return;
        }

        dropdown.classList.remove('show');
        activeBaseUrlOptionIndex = -1;
    }

    function updateActiveBaseUrlOption() {
        const options = getRenderedBaseUrlOptions();
        options.forEach((option, index) => {
            option.classList.toggle('active', index === activeBaseUrlOptionIndex);
        });

        if (activeBaseUrlOptionIndex < 0 || activeBaseUrlOptionIndex >= options.length) {
            return;
        }

        options[activeBaseUrlOptionIndex].scrollIntoView({ block: 'nearest' });
    }

    function selectBaseUrlOption(baseUrl) {
        setCurrentBaseUrl(baseUrl);
        closeBaseUrlDropdown();
        hasUserEditedRequest = false;
        requestRequestStateForCurrentBaseUrl();
    }

    function removeSavedBaseUrl(baseUrl) {
        const normalizedKey = normalizeBaseUrlKey(baseUrl);
        if (!normalizedKey) {
            return;
        }

        const nextSavedBaseUrls = savedBaseUrls.filter(item => normalizeBaseUrlKey(item) !== normalizedKey);
        if (nextSavedBaseUrls.length === savedBaseUrls.length) {
            return;
        }

        const currentKey = normalizeBaseUrlKey(getCurrentBaseUrl());
        savedBaseUrls = nextSavedBaseUrls;

        vscode.postMessage({
            type: 'saveBaseUrls',
            data: savedBaseUrls
        });

        renderBaseUrls();
        openBaseUrlDropdown();

        if (currentKey === normalizedKey) {
            const fallbackBaseUrl = getMergedBaseUrls()[0] || '';
            setCurrentBaseUrl(fallbackBaseUrl);
            requestRequestStateForCurrentBaseUrl();
        }
    }

    function renderBaseUrlDropdownOptions() {
        const { dropdown } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return;
        }

        const mergedUrls = getMergedBaseUrls();
        dropdown.innerHTML = '';

        mergedUrls.forEach((url) => {
            const option = document.createElement('div');
            option.className = 'base-url-dropdown-option';
            option.dataset.value = url;

            const isDefaultOption = normalizeBaseUrlKey(url) === normalizeBaseUrlKey(defaultBaseUrl);

            const label = document.createElement('span');
            label.className = 'base-url-dropdown-label';
            label.textContent = url;

            option.appendChild(label);
            if (!isDefaultOption) {
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'base-url-dropdown-delete';
                deleteBtn.textContent = t('remove') || 'Delete';
                deleteBtn.title = t('remove') || 'Delete';
                deleteBtn.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
                deleteBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeSavedBaseUrl(url);
                });
                option.appendChild(deleteBtn);
            }
            option.addEventListener('mousedown', (event) => {
                event.preventDefault();
            });
            option.addEventListener('click', () => {
                selectBaseUrlOption(url);
            });
            dropdown.appendChild(option);
        });

        activeBaseUrlOptionIndex = -1;
    }

    function openBaseUrlDropdown() {
        const { dropdown } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return;
        }

        renderBaseUrlDropdownOptions();
        if (!dropdown.children.length) {
            closeBaseUrlDropdown();
            return;
        }

        dropdown.classList.add('show');
    }

    // Load and render base URLs in the combo box
    function renderBaseUrls() {
        const { input } = getBaseUrlDropdownElements();
        if (!input) {
            return;
        }

        const mergedUrls = getMergedBaseUrls();
        renderBaseUrlDropdownOptions();

        const currentValue = normalizeBaseUrl(input.value);
        if (currentValue) {
            input.value = currentValue;
            return;
        }

        if (mergedUrls.length > 0) {
            input.value = mergedUrls[0];
        } else {
            input.value = '';
        }
    }

    // Escape HTML helper
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Show toast notification
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

        toast.innerHTML = `
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${message}</span>
            `;

        container.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, 3000);
    }

    function formatJsonBodyIfPossible(bodyText) {
        if (!bodyText || typeof bodyText !== 'string') {
            return '';
        }

        const trimmed = bodyText.trim();
        if (!trimmed) {
            return '';
        }

        try {
            const parsed = JSON.parse(trimmed);
            return JSON.stringify(parsed, null, jsonIndentSpaces);
        } catch {
            return bodyText;
        }
    }

    function syncBodyEditorHighlightScroll() {
        const bodyEditor = document.getElementById('bodyEditor');
        const highlightLayer = document.querySelector('.json-editor-highlight');
        if (!bodyEditor || !highlightLayer) {
            return;
        }

        highlightLayer.scrollTop = bodyEditor.scrollTop;
        highlightLayer.scrollLeft = bodyEditor.scrollLeft;
    }

    function updateBodyEditorHighlight() {
        const bodyEditor = document.getElementById('bodyEditor');
        const highlightCode = document.getElementById('bodyEditorHighlight');
        if (!bodyEditor || !highlightCode) {
            return;
        }

        const rawText = bodyEditor.value || '';
        if (!rawText) {
            highlightCode.innerHTML = '';
            return;
        }

        highlightCode.innerHTML = highlightJSON(rawText);
        syncBodyEditorHighlightScroll();
    }

    function updateJsonValidityIndicator() {
        const bodyEditor = document.getElementById('bodyEditor');
        const indicator = document.getElementById('jsonValidityBadge');
        if (!bodyEditor || !indicator) {
            return;
        }

        const rawText = bodyEditor.value || '';
        const trimmed = rawText.trim();

        if (!trimmed) {
            indicator.textContent = '';
            indicator.className = 'json-validity-badge';
            return;
        }

        try {
            JSON.parse(trimmed);
            indicator.textContent = '';
            indicator.className = 'json-validity-badge';
        } catch {
            indicator.textContent = t('bodyMode.invalidJson') || 'Invalid JSON';
            indicator.className = 'json-validity-badge invalid';
        }
    }

    function updateBodyEditorVisualState() {
        updateBodyEditorHighlight();
        updateJsonValidityIndicator();
    }

    function formatJsonEditorContent() {
        const bodyEditor = document.getElementById('bodyEditor');
        if (!bodyEditor) {
            return;
        }

        const bodyText = bodyEditor.value;
        if (!bodyText || !bodyText.trim()) {
            return;
        }

        try {
            const parsed = JSON.parse(bodyText);
            bodyEditor.value = JSON.stringify(parsed, null, jsonIndentSpaces);
            updateBodyEditorVisualState();
        } catch {
            showToast(t('error.invalidJson') || 'Invalid JSON format', 'error');
        }
    }

    // Get current selected base URL
    function getCurrentBaseUrl() {
        const input = document.getElementById('baseUrlInput');
        if (!input) {
            return '';
        }

        return normalizeBaseUrl(input.value);
    }

    function setCurrentBaseUrl(baseUrl) {
        const input = document.getElementById('baseUrlInput');
        if (!input) {
            return;
        }

        const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
        if (!normalizedBaseUrl) {
            return;
        }

        input.value = normalizedBaseUrl;
    }

    function requestRequestStateForCurrentBaseUrl() {
        const baseUrl = getCurrentBaseUrl().trim();
        if (!baseUrl) {
            return;
        }

        vscode.postMessage({
            type: 'requestRequestState',
            data: {
                baseUrl
            }
        });

        vscode.postMessage({
            type: 'requestSharedAuth',
            data: {
                baseUrl
            }
        });
    }

    function saveSharedAuthForCurrentBaseUrl() {
        const baseUrl = getCurrentBaseUrl().trim();
        if (!baseUrl) {
            return;
        }

        const tokenInput = document.getElementById('tokenInput');
        const token = tokenInput ? tokenInput.value : '';

        vscode.postMessage({
            type: 'saveSharedAuth',
            data: {
                baseUrl,
                token
            }
        });
    }

    function ensureCurrentBaseUrlSaved(baseUrl) {
        const normalized = normalizeBaseUrl(baseUrl);
        if (!normalized) {
            return;
        }

        const normalizedKey = normalizeBaseUrlKey(normalized);
        const existsInSaved = savedBaseUrls.some(item => normalizeBaseUrlKey(item) === normalizedKey);
        const isDefault = normalizeBaseUrlKey(defaultBaseUrl) === normalizedKey;
        if (existsInSaved || isDefault) {
            return;
        }

        savedBaseUrls = [...savedBaseUrls, normalized];
        vscode.postMessage({
            type: 'saveBaseUrls',
            data: savedBaseUrls
        });
        renderBaseUrls();
    }

    function normalizeBearerTokenForHeader(token) {
        const trimmedToken = typeof token === 'string' ? token.trim() : '';
        if (!trimmedToken) {
            return '';
        }

        return trimmedToken.toLowerCase().startsWith('bearer ')
            ? trimmedToken
            : `Bearer ${trimmedToken}`;
    }

    function buildRestoredHeaders(headers, token) {
        const tokenHeader = normalizeBearerTokenForHeader(token);
        return Object.entries(headers || {}).filter(([key, value]) => {
            if (!tokenHeader) {
                return true;
            }

            const isAuthorization = String(key || '').trim().toLowerCase() === 'authorization';
            if (!isAuthorization) {
                return true;
            }

            return String(value ?? '').trim() !== tokenHeader;
        });
    }

    function parseQueryEntries(query) {
        const rawQuery = typeof query === 'string' ? query.trim() : '';
        if (!rawQuery) {
            return [];
        }

        let cleanQuery = rawQuery;
        const queryStartIndex = cleanQuery.indexOf('?');
        if (queryStartIndex >= 0) {
            cleanQuery = cleanQuery.substring(queryStartIndex + 1);
        }
        if (cleanQuery.startsWith('?')) {
            cleanQuery = cleanQuery.substring(1);
        }
        const hashIndex = cleanQuery.indexOf('#');
        if (hashIndex >= 0) {
            cleanQuery = cleanQuery.substring(0, hashIndex);
        }

        if (!cleanQuery.trim()) {
            return [];
        }

        try {
            const params = new URLSearchParams(cleanQuery);
            const entries = [];
            params.forEach((value, key) => {
                entries.push({ key, value });
            });
            return entries;
        } catch {
            return [];
        }
    }

    function collectQueryEntriesFromRows() {
        const entries = [];
        document.querySelectorAll('#queryList .param-row').forEach(row => {
            const inputs = row.querySelectorAll('.param-input');
            const key = (inputs[0]?.value || '').trim();
            const value = (inputs[1]?.value || '').trim();
            if (key) {
                entries.push({ key, value });
            }
        });
        return entries;
    }

    function buildQueryStringFromEntries(entries) {
        if (!Array.isArray(entries) || entries.length === 0) {
            return '';
        }

        return entries
            .map(entry => `${entry.key}=${entry.value}`)
            .join('&');
    }

    function toReadableQueryString(query) {
        const entries = parseQueryEntries(query);
        return buildQueryStringFromEntries(entries);
    }

    function setQueryQuickInputValue(nextValue) {
        const queryQuickInput = document.getElementById('queryQuickInput');
        if (!queryQuickInput) {
            return;
        }

        const normalizedValue = typeof nextValue === 'string' ? nextValue : '';
        if (queryQuickInput.value === normalizedValue) {
            return;
        }

        suppressQueryQuickInputAutoApply = true;
        queryQuickInput.value = normalizedValue;
        suppressQueryQuickInputAutoApply = false;
    }

    function syncQueryQuickInputFromRows() {
        const queryEntries = collectQueryEntriesFromRows();
        setQueryQuickInputValue(buildQueryStringFromEntries(queryEntries));
    }

    function clearQueryRowsSyncTimer() {
        if (queryRowsSyncTimer !== null) {
            clearTimeout(queryRowsSyncTimer);
            queryRowsSyncTimer = null;
        }
    }

    function scheduleQueryQuickSyncFromRows() {
        clearQueryRowsSyncTimer();
        queryRowsSyncTimer = setTimeout(() => {
            queryRowsSyncTimer = null;
            syncQueryQuickInputFromRows();
        }, 180);
    }

    function renderQueryRowsFromEntries(entries) {
        const queryList = document.getElementById('queryList');
        if (!queryList) {
            return;
        }

        queryList.innerHTML = '';
        entries.forEach(({ key, value }) => {
            addQueryRow(key, value);
        });
    }

    function mergeQueryEntriesKeepingManual(existingEntries, mockEntries) {
        const mergedEntries = Array.isArray(existingEntries)
            ? existingEntries.map(item => ({
                key: typeof item?.key === 'string' ? item.key : '',
                value: typeof item?.value === 'string' ? item.value : String(item?.value ?? '')
            }))
            : [];

        const normalizeKey = (key) => String(key || '').trim().toLowerCase();

        mockEntries.forEach((mockEntry) => {
            const mockKey = typeof mockEntry?.key === 'string' ? mockEntry.key.trim() : '';
            if (!mockKey) {
                return;
            }

            const mockKeyNormalized = normalizeKey(mockKey);
            const matchedIndex = mergedEntries.findIndex(item => normalizeKey(item.key) === mockKeyNormalized);

            if (matchedIndex >= 0) {
                // Keep user-provided value for existing key; only add missing keys from mock.
                return;
            }

            const mockValue = typeof mockEntry?.value === 'string'
                ? mockEntry.value
                : String(mockEntry?.value ?? '');

            mergedEntries.push({
                key: mockKey,
                value: mockValue
            });
        });

        return mergedEntries.filter(item => String(item.key || '').trim().length > 0);
    }

    function collectFormDataEntriesFromRows() {
        const rows = document.querySelectorAll('#formDataList .formdata-row');
        const entries = [];

        rows.forEach((row) => {
            const key = row.querySelector('.formdata-key')?.value?.trim();
            if (!key) {
                return;
            }

            const value = row.querySelector('.formdata-value-input')?.value ?? '';
            entries.push({
                key,
                value: String(value),
                type: 'text',
                enabled: row.querySelector('.formdata-enabled')?.checked !== false
            });
        });

        return entries;
    }

    function mergeFormDataEntriesKeepingManual(existingEntries, mockEntries) {
        const mergedEntries = Array.isArray(existingEntries)
            ? existingEntries.map(item => ({
                key: typeof item?.key === 'string' ? item.key : '',
                value: typeof item?.value === 'string' ? item.value : String(item?.value ?? ''),
                type: 'text',
                enabled: item?.enabled !== false
            }))
            : [];

        const normalizeKey = (key) => String(key || '').trim().toLowerCase();

        mockEntries.forEach((mockEntry) => {
            const mockKey = typeof mockEntry?.key === 'string' ? mockEntry.key.trim() : '';
            if (!mockKey) {
                return;
            }

            const mockValue = typeof mockEntry?.value === 'string'
                ? mockEntry.value
                : String(mockEntry?.value ?? '');
            const mockKeyNormalized = normalizeKey(mockKey);
            const matchedIndex = mergedEntries.findIndex(item => normalizeKey(item.key) === mockKeyNormalized);

            if (matchedIndex >= 0) {
                mergedEntries[matchedIndex] = {
                    ...mergedEntries[matchedIndex],
                    key: mergedEntries[matchedIndex].key,
                    value: mockValue,
                    type: 'text',
                    enabled: true
                };
                return;
            }

            mergedEntries.push({
                key: mockKey,
                value: mockValue,
                type: 'text',
                enabled: true
            });
        });

        return mergedEntries.filter(item => String(item.key || '').trim().length > 0);
    }

    function renderFormDataRowsFromEntries(entries) {
        const formDataList = document.getElementById('formDataList');
        if (!formDataList) {
            return;
        }

        formDataList.innerHTML = '';
        entries.forEach((entry) => {
            addFormDataRow({
                key: entry.key,
                value: entry.value,
                type: 'text',
                enabled: entry.enabled !== false
            });
        });

        ensureFormDataHasAtLeastOneRow();
    }

    function applyQueryQuickInput(options = {}) {
        const quickInput = document.getElementById('queryQuickInput');
        if (!quickInput) {
            return;
        }

        const shouldNotifyOnEmpty = options.notifyOnEmpty !== false;
        const shouldMarkDirty = options.markDirty !== false;
        const entries = parseQueryEntries(quickInput.value || '');
        renderQueryRowsFromEntries(entries);
        if (shouldMarkDirty) {
            hasUserEditedRequest = entries.length > 0;
        }

        if (!entries.length && shouldNotifyOnEmpty) {
            showToast(t('query.parseFailed') || 'No valid query parameters found', 'info');
        }
    }

    function clearQueryQuickApplyTimer() {
        if (queryQuickApplyTimer !== null) {
            clearTimeout(queryQuickApplyTimer);
            queryQuickApplyTimer = null;
        }
    }

    function scheduleQueryQuickAutoApply() {
        clearQueryQuickApplyTimer();
        queryQuickApplyTimer = setTimeout(() => {
            queryQuickApplyTimer = null;
            applyQueryQuickInput({ notifyOnEmpty: false, markDirty: true });
        }, 260);
    }

    function applyRequestState(state) {
        if (!state || typeof state !== 'object') {
            updateRequestTabBadges();
            return;
        }

        withSuppressedDirtyTracking(() => {
            if (typeof state.baseUrl === 'string' && state.baseUrl.trim()) {
                setCurrentBaseUrl(state.baseUrl);
            }

            const headersList = document.getElementById('headersList');
            if (headersList) {
                headersList.innerHTML = '';
                buildRestoredHeaders(state.headers, '').forEach(([key, value]) => {
                    addHeaderRow(key, String(value ?? ''));
                });
            }

            const queryList = document.getElementById('queryList');
            if (queryList) {
                renderQueryRowsFromEntries(parseQueryEntries(state.query));
            }
            setQueryQuickInputValue(toReadableQueryString(state.query));

            restoredBinaryBodyBase64 = typeof state.binaryBodyBase64 === 'string' ? state.binaryBodyBase64 : '';
            restoredBinaryContentType = typeof state.binaryContentType === 'string' ? state.binaryContentType : '';
            restoredBinaryFileName = typeof state.binaryFileName === 'string' ? state.binaryFileName : '';

            if (state.bodyMode === 'formdata') {
                const formDataList = document.getElementById('formDataList');
                if (formDataList) {
                    formDataList.innerHTML = '';
                }
                const fields = Array.isArray(state.formDataFields) && state.formDataFields.length > 0
                    ? state.formDataFields
                    : [{}];
                fields.forEach(field => addFormDataRow(field));
                activateBodyMode('formdata');
            } else if (state.bodyMode === 'binary') {
                activateBodyMode('binary');
                updateBinaryFileNameDisplay();
            } else {
                const bodyEditor = document.getElementById('bodyEditor');
                if (bodyEditor) {
                    bodyEditor.value = typeof state.body === 'string' ? state.body : '';
                    updateBodyEditorVisualState();
                }
                activateBodyMode('json');
            }

            if (state.response) {
                displayResponse(state.response);
            }
        });

        hasUserEditedRequest = false;
        updateRequestTabBadges();
    }

    document.getElementById('baseUrlInput')?.addEventListener('change', () => {
        hasUserEditedRequest = false;
        requestRequestStateForCurrentBaseUrl();
    });
    document.getElementById('tokenInput')?.addEventListener('input', () => {
        saveSharedAuthForCurrentBaseUrl();
        updateRequestTabBadges();
    });

    document.getElementById('baseUrlInput')?.addEventListener('keydown', (event) => {
        const { dropdown } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return;
        }

        const options = getRenderedBaseUrlOptions();
        const isOpen = dropdown.classList.contains('show');

        if (event.key === 'Escape') {
            closeBaseUrlDropdown();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen) {
                openBaseUrlDropdown();
                return;
            }
            if (!options.length) {
                return;
            }
            activeBaseUrlOptionIndex = Math.min(activeBaseUrlOptionIndex + 1, options.length - 1);
            updateActiveBaseUrlOption();
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen || !options.length) {
                return;
            }
            activeBaseUrlOptionIndex = Math.max(activeBaseUrlOptionIndex - 1, 0);
            updateActiveBaseUrlOption();
            return;
        }

        if (event.key === 'Enter' && isOpen && activeBaseUrlOptionIndex >= 0 && activeBaseUrlOptionIndex < options.length) {
            event.preventDefault();
            const selected = options[activeBaseUrlOptionIndex]?.dataset?.value || '';
            if (selected) {
                selectBaseUrlOption(selected);
            }
        }
    });

    document.getElementById('baseUrlDropdownToggle')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const { dropdown, input } = getBaseUrlDropdownElements();
        if (!dropdown) {
            return;
        }

        if (dropdown.classList.contains('show')) {
            closeBaseUrlDropdown();
            return;
        }

        input?.focus();
        openBaseUrlDropdown();
    });

    document.addEventListener('click', (event) => {
        const container = document.querySelector('.base-url-container');
        if (!container) {
            return;
        }

        if (!container.contains(event.target)) {
            closeBaseUrlDropdown();
        }
    });

    document.getElementById('addHeaderBtn')?.addEventListener('click', () => addHeaderRow());
    document.getElementById('addQueryBtn')?.addEventListener('click', () => addQueryRow());
    document.getElementById('queryQuickInput')?.addEventListener('input', () => {
        if (suppressQueryQuickInputAutoApply) {
            return;
        }
        scheduleQueryQuickAutoApply();
    });
    document.getElementById('queryQuickInput')?.addEventListener('paste', () => {
        clearQueryQuickApplyTimer();
        setTimeout(() => {
            applyQueryQuickInput({ notifyOnEmpty: false, markDirty: true });
        }, 0);
    });
    document.getElementById('addFormDataRowBtn')?.addEventListener('click', () => addFormDataRow());
    document.getElementById('clearDisabledFormDataBtn')?.addEventListener('click', clearDisabledFormDataRows);
    document.getElementById('formatJsonBtn')?.addEventListener('click', formatJsonEditorContent);
    document.getElementById('bodyEditor')?.addEventListener('input', updateBodyEditorVisualState);
    document.getElementById('bodyEditor')?.addEventListener('scroll', syncBodyEditorHighlightScroll);
    document.querySelector('.request-section')?.addEventListener('input', markRequestDirty);
    document.querySelector('.request-section')?.addEventListener('change', markRequestDirty);
    document.getElementById('openResponseInEditorBtn')?.addEventListener('click', () => {
        const responseText = typeof latestResponseText === 'string' ? latestResponseText : '';
        if (!responseText) {
            showToast(t('response.empty') || 'No response content to open', 'info');
            return;
        }

        vscode.postMessage({
            type: 'openResponseInEditor',
            data: {
                content: responseText
            }
        });
    });

    document.getElementById('headersList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-button')) {
            target.closest('.param-row')?.remove();
            updateRequestTabBadges();
        }
    });

    document.getElementById('queryList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-button')) {
            target.closest('.param-row')?.remove();
            scheduleQueryQuickSyncFromRows();
            updateRequestTabBadges();
        }
    });

    document.getElementById('queryList')?.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('param-input')) {
            scheduleQueryQuickSyncFromRows();
        }
    });

    document.getElementById('formDataList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('formdata-delete-btn')) {
            target.closest('.formdata-row')?.remove();
            ensureFormDataHasAtLeastOneRow();
            updateRequestTabBadges();
            return;
        }

        if (target.classList.contains('formdata-file-select-btn')) {
            const row = target.closest('.formdata-row');
            row?.querySelector('.formdata-file-input')?.click();
            return;
        }

        if (target.classList.contains('formdata-file-clear-btn')) {
            const row = target.closest('.formdata-row');
            if (row) {
                const fileInput = row.querySelector('.formdata-file-input');
                if (fileInput) {
                    fileInput.value = '';
                }
                updateFormDataFileName(row);
                updateRequestTabBadges();
            }
        }
    });

    document.getElementById('formDataList')?.addEventListener('change', (e) => {
        const target = e.target;
        if (target.classList.contains('formdata-type-select')) {
            const row = target.closest('.formdata-row');
            if (row) {
                const selectedType = target.value === 'file' ? 'file' : 'text';
                row.dataset.fieldType = selectedType;
                updateFormDataRowMode(row);
            }
            updateRequestTabBadges();
            return;
        }

        if (target.classList.contains('formdata-file-input')) {
            const row = target.closest('.formdata-row');
            if (row) {
                updateFormDataFileName(row);
                updateRequestTabBadges();
            }
        }
    });

    // Tab switching
    function activateMainTab(tabName) {
        if (!tabName) {
            return;
        }

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const targetTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const targetPanel = document.getElementById(tabName + 'Tab');
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activateMainTab(tab.dataset.tab);
        });
    });

    // Body mode switching
    document.querySelectorAll('.body-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.dataset.bodyMode;
            if (!mode) {
                return;
            }

            activateBodyMode(mode);
        });
    });

    function createFormDataRow(initialData = {}) {
        const row = document.createElement('div');
        const fieldType = initialData.type === 'file' ? 'file' : 'text';
        row.className = 'formdata-row';
        row.dataset.fieldType = fieldType;
        row.dataset.valueBase64 = typeof initialData.valueBase64 === 'string' ? initialData.valueBase64 : '';
        row.dataset.fileName = typeof initialData.fileName === 'string' ? initialData.fileName : '';
        row.dataset.contentType = typeof initialData.contentType === 'string' ? initialData.contentType : '';

        row.innerHTML = `
            <div class="formdata-enabled-wrap">
                <input type="checkbox" class="formdata-enabled" ${initialData.enabled === false ? '' : 'checked'} />
            </div>
            <input type="text" class="formdata-input formdata-key" placeholder="${t('placeholder.key')}" value="${escapeHtml(initialData.key || '')}" />
            <select class="formdata-type-select">
                <option value="text">${t('bodyMode.formDataTypeText') || 'Text'}</option>
                <option value="file">${t('bodyMode.formDataTypeFile') || 'File'}</option>
            </select>
            <div class="formdata-value-wrap">
                <input type="text" class="formdata-value-input" placeholder="${t('placeholder.value')}" value="${escapeHtml(initialData.value || '')}" />
                <div class="formdata-value-file">
                    <button type="button" class="formdata-file-select-btn">${t('bodyMode.selectFile')}</button>
                    <span class="formdata-file-name">${t('bodyMode.noFile')}</span>
                    <input type="file" class="formdata-file-input" />
                </div>
            </div>
            <div class="formdata-row-actions">
                <button type="button" class="formdata-file-clear-btn">${t('bodyMode.formDataClearFile') || 'Clear'}</button>
                <button type="button" class="formdata-delete-btn">${t('remove')}</button>
            </div>
        `;

        const select = row.querySelector('.formdata-type-select');
        if (select) {
            select.value = fieldType;
        }
        updateFormDataRowMode(row);
        return row;
    }

    function updateFormDataRowMode(row) {
        const isFileMode = (row.dataset.fieldType || 'text') === 'file';
        row.classList.toggle('file-mode', isFileMode);
        updateFormDataFileName(row);
    }

    function updateFormDataFileName(row) {
        const fileNameElement = row.querySelector('.formdata-file-name');
        const fileInput = row.querySelector('.formdata-file-input');
        if (!fileNameElement || !fileInput) {
            return;
        }

        const selectedFile = fileInput.files?.[0];
        fileNameElement.textContent = selectedFile?.name || row.dataset.fileName || t('bodyMode.noFile');
    }

    function addFormDataRow(initialData = {}) {
        const list = document.getElementById('formDataList');
        if (!list) {
            return;
        }
        list.appendChild(createFormDataRow(initialData));
    }

    function ensureFormDataHasAtLeastOneRow() {
        const list = document.getElementById('formDataList');
        if (!list) {
            return;
        }

        if (!list.querySelector('.formdata-row')) {
            addFormDataRow();
        }
    }

    function clearDisabledFormDataRows() {
        const list = document.getElementById('formDataList');
        if (!list) {
            return;
        }

        list.querySelectorAll('.formdata-row').forEach(row => {
            const enabledCheckbox = row.querySelector('.formdata-enabled');
            if (enabledCheckbox && !enabledCheckbox.checked) {
                row.remove();
            }
        });

        ensureFormDataHasAtLeastOneRow();
        updateRequestTabBadges();
    }

    async function collectFormDataFields() {
        const fields = [];
        const rows = document.querySelectorAll('#formDataList .formdata-row');

        for (const row of rows) {
            const enabled = row.querySelector('.formdata-enabled')?.checked;
            if (!enabled) {
                continue;
            }

            const key = row.querySelector('.formdata-key')?.value?.trim();
            if (!key) {
                continue;
            }

            const fieldType = row.querySelector('.formdata-type-select')?.value === 'file' ? 'file' : 'text';
            if (fieldType === 'file') {
                const fileInput = row.querySelector('.formdata-file-input');
                const file = fileInput?.files?.[0];
                if (!file && !row.dataset.valueBase64) {
                    continue;
                }

                const valueBase64 = file ? await fileToBase64(file) : row.dataset.valueBase64;
                fields.push({
                    key,
                    type: 'file',
                    fileName: file?.name || row.dataset.fileName || 'upload.bin',
                    contentType: file?.type || row.dataset.contentType || 'application/octet-stream',
                    valueBase64
                });
                continue;
            }

            const value = row.querySelector('.formdata-value-input')?.value ?? '';
            fields.push({
                key,
                type: 'text',
                value
            });
        }

        return fields;
    }

    ensureFormDataHasAtLeastOneRow();

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = typeof reader.result === 'string' ? reader.result : '';
                const base64 = result.includes(',') ? result.split(',')[1] : result;
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    function updateBinaryFileNameDisplay() {
        const binaryFileInput = document.getElementById('binaryFileInput');
        const binaryFileName = document.getElementById('binaryFileName');
        if (!binaryFileInput || !binaryFileName) {
            return;
        }

        const selectedFile = binaryFileInput.files?.[0];
        binaryFileName.textContent = selectedFile?.name || restoredBinaryFileName || t('bodyMode.noFile');
    }

    function updateDebugButton() {
        const debugButton = document.getElementById('debugButton');
        if (!debugButton) {
            return;
        }

        if (currentDebugState === 'starting') {
            debugButton.textContent = t('debug.starting') || 'Starting...';
            debugButton.disabled = true;
            return;
        }

        if (currentDebugState === 'running') {
            debugButton.textContent = t('debug.running') || 'Debug Running';
            debugButton.disabled = true;
            return;
        }

        debugButton.textContent = t('debug.start') || 'Start Debug';
        debugButton.disabled = false;
    }

    function updateMockAllButton() {
        const mockAllBtn = document.getElementById('mockAllBtn');
        if (!mockAllBtn) {
            return;
        }

        const mockTooltip = t('bodyMode.mockTooltip') || 'Generate Query / Body / FormData mock data';
        mockAllBtn.title = mockTooltip;
        mockAllBtn.setAttribute('aria-label', mockTooltip);

        if (isMockAllLoading) {
            mockAllBtn.textContent = t('bodyMode.mocking') || 'Mocking...';
            mockAllBtn.disabled = true;
            return;
        }

        mockAllBtn.textContent = t('bodyMode.mock') || 'Mock';
        mockAllBtn.disabled = false;
    }

    document.getElementById('binaryFileSelectBtn')?.addEventListener('click', () => {
        document.getElementById('binaryFileInput')?.click();
    });

    document.getElementById('binaryFileInput')?.addEventListener('change', () => {
        restoredBinaryBodyBase64 = '';
        restoredBinaryContentType = '';
        restoredBinaryFileName = '';
        updateBinaryFileNameDisplay();

        updateJsonValidityIndicator();
        updateRequestTabBadges();
    });

    document.getElementById('debugButton')?.addEventListener('click', () => {
        currentDebugState = 'starting';
        updateDebugButton();

        vscode.postMessage({
            type: 'startDebug',
            data: {
                baseUrl: getCurrentBaseUrl()
            }
        });
    });

    document.getElementById('backToActionBtn')?.addEventListener('click', () => {
        vscode.postMessage({
            type: 'backToAction'
        });
    });

    document.getElementById('mockAllBtn')?.addEventListener('click', () => {
        if (isMockAllLoading) {
            return;
        }

        if (!currentApiEndpoint || typeof currentApiEndpoint !== 'object') {
            showToast(t('bodyMode.mockNoEndpoint') || 'No API endpoint available for mock generation', 'error');
            return;
        }

        isMockAllLoading = true;
        vscode.postMessage({
            type: 'requestMockAll',
            data: {
                baseUrl: getCurrentBaseUrl()
            }
        });

        updateMockAllButton();
    });

    // Auth type switching
    document.querySelectorAll('.auth-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;

            const authType = btn.dataset.authType;

            // Update button styles
            document.querySelectorAll('.auth-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update auth sections
            document.querySelectorAll('.auth-section').forEach(s => s.classList.remove('active'));
            const sectionId = 'auth' + authType.charAt(0).toUpperCase() + authType.slice(1);
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('active');
            }
        });
    });

    // Response tab switching
    document.querySelectorAll('.response-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.responseTab;

            // Update tab styles
            document.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update content
            document.querySelectorAll('.response-tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(tabName + 'Panel').classList.add('active');
        });
    });

    // Add header row
    function addHeaderRow(key = '', value = '') {
        const list = document.getElementById('headersList');
        const row = document.createElement('div');
        row.className = 'param-row';
        row.innerHTML = `
                <input type="text" class="param-input" placeholder="${t('placeholder.key')}" value="${escapeHtml(key)}" />
                <input type="text" class="param-input" placeholder="${t('placeholder.value')}" value="${escapeHtml(value)}" />
                <button class="remove-button" type="button">${t('remove') || ''}</button>
            `;
        list.appendChild(row);
    }

    // Add query row
    function addQueryRow(key = '', value = '') {
        const list = document.getElementById('queryList');
        const row = document.createElement('div');
        row.className = 'param-row';
        row.innerHTML = `
                <input type="text" class="param-input" placeholder="${t('placeholder.key')}" value="${escapeHtml(key)}" />
                <input type="text" class="param-input" placeholder="${t('placeholder.value')}" value="${escapeHtml(value)}" />
                <button class="remove-button" type="button">${t('remove') || ''}</button>
            `;
        list.appendChild(row);
        return row;
    }

    function addQueryRowWithKey(key) {
        addQueryRow(key, '');
    }

    function extractRouteParamName(placeholderContent) {
        const raw = String(placeholderContent || '').trim();
        if (!raw) {
            return '';
        }

        return raw
            .split(':')[0]
            .split('=')[0]
            .replace(/^\*/, '')
            .trim();
    }

    function replaceRoutePlaceholders(route, queryEntries) {
        const consumedIndexes = new Set();
        const safeRoute = String(route || '');

        const replacedRoute = safeRoute.replace(/\{([^}]+)\}/g, (match, placeholderContent) => {
            const routeParamName = extractRouteParamName(placeholderContent);
            if (!routeParamName) {
                return match;
            }

            const routeParamLower = routeParamName.toLowerCase();
            for (let index = 0; index < queryEntries.length; index += 1) {
                if (consumedIndexes.has(index)) {
                    continue;
                }

                const entry = queryEntries[index];
                if ((entry.key || '').toLowerCase() !== routeParamLower) {
                    continue;
                }

                consumedIndexes.add(index);
                return encodeURIComponent(entry.value || '');
            }

            return match;
        });

        return { replacedRoute, consumedIndexes };
    }

    // Send request
    document.getElementById('sendButton').addEventListener('click', async () => {
        if (!currentApiEndpoint) {
            console.error('No API endpoint data available');
            return;
        }

        // Disable button and show loading
        const sendButton = document.getElementById('sendButton');
        sendButton.disabled = true;
        showLoading();

        const method = currentApiEndpoint.httpMethod;
        const baseUrl = getCurrentBaseUrl();
        ensureCurrentBaseUrlSaved(baseUrl);
        const route = document.getElementById('routeInput').value;
        const token = document.getElementById('tokenInput').value;
        saveSharedAuthForCurrentBaseUrl();

        // Collect headers
        const headers = {};
        document.querySelectorAll('#headersList .param-row').forEach(row => {
            const inputs = row.querySelectorAll('.param-input');
            const key = inputs[0].value.trim();
            const value = inputs[1].value.trim();
            if (key) {
                headers[key] = value;
            }
        });

        // Add bearer token if provided
        if (token) {
            // Check if token already has 'Bearer ' prefix (case-insensitive)
            const trimmedToken = token.trim();
            if (trimmedToken.toLowerCase().startsWith('bearer ')) {
                headers['Authorization'] = trimmedToken;
            } else {
                headers['Authorization'] = 'Bearer ' + trimmedToken;
            }
        }

        // Collect query parameters from manual parameter list
        const queryEntries = collectQueryEntriesFromRows();

        const { replacedRoute, consumedIndexes } = replaceRoutePlaceholders(route, queryEntries);
        const url = baseUrl + replacedRoute;

        const queryParams = [];
        queryEntries.forEach((entry, index) => {
            if (consumedIndexes.has(index)) {
                return;
            }

            queryParams.push(encodeURIComponent(entry.key) + '=' + encodeURIComponent(entry.value));
        });

        let finalUrl = url;
        const historyQuery = queryParams.join('&');
        if (queryParams.length > 0) {
            const separator = url.includes('?') ? '&' : '?';
            finalUrl = url + separator + queryParams.join('&');
        }

        // Get body
        let body = undefined;
        let bodyMode = currentBodyMode;
        let binaryBodyBase64 = undefined;
        let binaryContentType = undefined;
        let binaryFileName = undefined;
        let formDataFields = undefined;
        const canHaveBody = method.toUpperCase() !== 'HEAD';
        if (canHaveBody) {
            if (currentBodyMode === 'binary') {
                const binaryFileInput = document.getElementById('binaryFileInput');
                const selectedFile = binaryFileInput?.files?.[0];
                if (selectedFile) {
                    binaryBodyBase64 = await fileToBase64(selectedFile);
                    binaryContentType = selectedFile.type || undefined;
                    binaryFileName = selectedFile.name || undefined;
                } else if (restoredBinaryBodyBase64) {
                    binaryBodyBase64 = restoredBinaryBodyBase64;
                    binaryContentType = restoredBinaryContentType || undefined;
                    binaryFileName = restoredBinaryFileName || undefined;
                }
            } else if (currentBodyMode === 'formdata') {
                formDataFields = await collectFormDataFields();
                if (!formDataFields.length) {
                    sendButton.disabled = false;
                    showToast(t('bodyMode.formDataEmpty') || 'FormData has no valid fields', 'error');
                    return;
                }
            } else {
                const bodyText = document.getElementById('bodyEditor').value.trim();
                if (bodyText) {
                    body = bodyText;
                }
            }
        } else {
            bodyMode = 'json';
        }

        // Send message to extension
        vscode.postMessage({
            type: 'sendRequest',
            data: {
                method,
                url: finalUrl,
                baseUrl,
                headers,
                token,
                body,
                path: replacedRoute,
                query: historyQuery,
                bodyMode,
                binaryBodyBase64,
                binaryContentType,
                binaryFileName,
                formDataFields
            }
        });
    });

    // Update UI texts when language changes
    function updateUITexts() {
        // Update button texts
        const backToActionBtn = document.getElementById('backToActionBtn');
        if (backToActionBtn) {
            backToActionBtn.textContent = t('backToAction') || 'Back';
        }
        updateDebugButton();
        document.getElementById('sendButton').textContent = t('send');
        document.getElementById('addHeaderBtn').textContent = t('add');
        document.getElementById('addQueryBtn').textContent = t('add');
        const mockAllBtn = document.getElementById('mockAllBtn');
        if (mockAllBtn) {
            const mockTooltip = t('bodyMode.mockTooltip') || 'Generate Query / Body / FormData mock data';
            mockAllBtn.title = mockTooltip;
            mockAllBtn.setAttribute('aria-label', mockTooltip);
        }
        document.getElementById('formatJsonBtn').textContent = t('bodyMode.formatJson') || 'Format';
        const openResponseInEditorBtn = document.getElementById('openResponseInEditorBtn');
        if (openResponseInEditorBtn) {
            openResponseInEditorBtn.textContent = t('response.copyOpen') || 'Open';
            openResponseInEditorBtn.title = t('response.copyOpen') || 'Open';
        }

        // Update existing dynamic row action buttons (rows may be created before i18n arrives)
        document.querySelectorAll('#headersList .remove-button, #queryList .remove-button').forEach(btn => {
            btn.textContent = t('remove');
        });

        // Update tab texts
        document.querySelectorAll('.tab').forEach(tab => {
            const tabName = tab.dataset.tab;
            if (tabName === 'headers') tab.textContent = t('tab.headers');
            else if (tabName === 'auth') tab.textContent = t('tab.auth');
            else if (tabName === 'query') tab.textContent = t('tab.query');
            else if (tabName === 'body') tab.textContent = t('tab.body');
        });

        // Update response tabs
        document.querySelectorAll('.response-tab').forEach(tab => {
            const tabName = tab.dataset.responseTab;
            if (tabName === 'body') {
                tab.childNodes[0].textContent = t('tab.response');
            } else if (tabName === 'headers') {
                tab.childNodes[0].textContent = t('tab.headers') + ' ';
            }
        });

        // Update status labels
        document.querySelector('.status-bar .status-item:nth-child(1) .status-label').textContent = t('status.label');
        document.querySelector('.status-bar .status-item:nth-child(2) .status-label').textContent = t('size.label');
        document.querySelector('.status-bar .status-item:nth-child(3) .status-label').textContent = t('time.label');

        // Update placeholders
        const baseUrlInput = document.getElementById('baseUrlInput');
        if (baseUrlInput) {
            baseUrlInput.placeholder = t('placeholder.baseUrl');
        }
        document.getElementById('routeInput').placeholder = t('placeholder.route');
        document.getElementById('tokenInput').placeholder = t('placeholder.token');
        document.getElementById('bodyEditor').placeholder = t('placeholder.body');
        const queryQuickInput = document.getElementById('queryQuickInput');
        if (queryQuickInput) {
            queryQuickInput.placeholder = t('placeholder.queryString');
        }
        const applyQueryQuickInputBtn = document.getElementById('applyQueryQuickInputBtn');
        if (applyQueryQuickInputBtn) {
            applyQueryQuickInputBtn.textContent = t('query.apply') || 'Apply';
        }

        // Update body mode labels
        document.querySelectorAll('.body-mode-tab').forEach(tab => {
            const bodyMode = tab.dataset.bodyMode;
            if (bodyMode === 'json') {
                tab.textContent = t('bodyMode.json');
            } else if (bodyMode === 'formdata') {
                tab.textContent = t('bodyMode.formData');
            } else if (bodyMode === 'binary') {
                tab.textContent = t('bodyMode.binary');
            }
        });
        const formDataContentTypeHint = document.getElementById('formDataContentTypeHint');
        if (formDataContentTypeHint) {
            formDataContentTypeHint.textContent = t('bodyMode.formDataContentType') || 'Content-Type: multipart/form-data';
        }
        const formDataHeaderUse = document.getElementById('formDataHeaderUse');
        if (formDataHeaderUse) {
            formDataHeaderUse.textContent = t('bodyMode.formDataHeaderUse') || 'Use';
        }
        const formDataHeaderKey = document.getElementById('formDataHeaderKey');
        if (formDataHeaderKey) {
            formDataHeaderKey.textContent = t('bodyMode.formDataHeaderKey') || 'Key';
        }
        const formDataHeaderType = document.getElementById('formDataHeaderType');
        if (formDataHeaderType) {
            formDataHeaderType.textContent = t('bodyMode.formDataHeaderType') || 'Type';
        }
        const formDataHeaderValue = document.getElementById('formDataHeaderValue');
        if (formDataHeaderValue) {
            formDataHeaderValue.textContent = t('bodyMode.formDataHeaderValue') || 'Value';
        }
        const formDataHeaderActions = document.getElementById('formDataHeaderActions');
        if (formDataHeaderActions) {
            formDataHeaderActions.textContent = t('bodyMode.formDataHeaderActions') || 'Actions';
        }
        const addFormDataRowBtn = document.getElementById('addFormDataRowBtn');
        if (addFormDataRowBtn) {
            addFormDataRowBtn.textContent = t('bodyMode.formDataAddRow') || 'Add Row';
        }
        const clearDisabledFormDataBtn = document.getElementById('clearDisabledFormDataBtn');
        if (clearDisabledFormDataBtn) {
            clearDisabledFormDataBtn.textContent = t('bodyMode.formDataClearDisabled') || 'Clear Disabled';
        }
        document.querySelectorAll('#formDataList .formdata-row').forEach(row => {
            const keyInput = row.querySelector('.formdata-key');
            if (keyInput) {
                keyInput.placeholder = t('placeholder.key');
            }
            const valueInput = row.querySelector('.formdata-value-input');
            if (valueInput) {
                valueInput.placeholder = t('placeholder.value');
            }
            const typeSelect = row.querySelector('.formdata-type-select');
            if (typeSelect) {
                typeSelect.querySelector('option[value="text"]').textContent = t('bodyMode.formDataTypeText') || 'Text';
                typeSelect.querySelector('option[value="file"]').textContent = t('bodyMode.formDataTypeFile') || 'File';
            }
            const fileSelectBtn = row.querySelector('.formdata-file-select-btn');
            if (fileSelectBtn) {
                fileSelectBtn.textContent = t('bodyMode.selectFile');
            }
            const fileClearBtn = row.querySelector('.formdata-file-clear-btn');
            if (fileClearBtn) {
                fileClearBtn.textContent = t('bodyMode.formDataClearFile') || 'Clear';
            }
            const deleteBtn = row.querySelector('.formdata-delete-btn');
            if (deleteBtn) {
                deleteBtn.textContent = t('remove');
            }
            updateFormDataFileName(row);
        });
        updateMockAllButton();
        const binaryFileLabel = document.querySelector('.binary-file-label');
        if (binaryFileLabel) {
            binaryFileLabel.textContent = t('bodyMode.binaryFile');
        }
        const binaryFileSelectBtn = document.getElementById('binaryFileSelectBtn');
        if (binaryFileSelectBtn) {
            binaryFileSelectBtn.textContent = t('bodyMode.selectFile');
        }
        updateBinaryFileNameDisplay();

        // Update auth type button
        document.querySelector('[data-auth-type="bearer"]').textContent = t('auth.bearer');

    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'i18n':
                i18nTexts = message.data;
                updateUITexts();
                break;
            case 'initialize':
                initializeWithApiEndpoint(message.data);
                break;
            case 'requestComplete':
                displayResponse(message.data);
                hasUserEditedRequest = false;
                break;
            case 'updateApiEndpoint':
                updateApiEndpoint(message.data);
                break;
            case 'loadBaseUrls':
                savedBaseUrls = message.data || [];
                renderBaseUrls();
                break;
            case 'loadRequestState':
                applyRequestState(message.data);
                break;
            case 'loadSharedAuth': {
                const tokenInput = document.getElementById('tokenInput');
                if (tokenInput) {
                    tokenInput.value = typeof message.data?.token === 'string' ? message.data.token : '';
                }
                updateRequestTabBadges();
                break;
            }
            case 'renderSettings': {
                const settings = message.data || {};
                const threshold = Number(settings.largeResponseThresholdBytes);
                const lineLimit = Number(settings.maxResponseLineNumbers);
                const indentSpaces = Number(settings.jsonIndentSpaces);

                if (Number.isFinite(threshold) && threshold > 0) {
                    largeResponseThresholdBytes = Math.floor(threshold);
                }

                if (Number.isFinite(lineLimit) && lineLimit > 0) {
                    maxRenderLineNumbers = Math.floor(lineLimit);
                }

                if (indentSpaces === 2 || indentSpaces === 4) {
                    jsonIndentSpaces = indentSpaces;
                }

                updateBodyEditorVisualState();
                break;
            }
            case 'debugStatus': {
                const debugStatus = message.data?.status;
                if (debugStatus === 'idle' || debugStatus === 'starting' || debugStatus === 'running' || debugStatus === 'error') {
                    currentDebugState = debugStatus === 'error' ? 'idle' : debugStatus;
                    updateDebugButton();
                }

                if (message.data?.message) {
                    const toastType = debugStatus === 'error' ? 'error' : (debugStatus === 'running' ? 'success' : 'info');
                    showToast(message.data.message, toastType);
                }
                break;
            }
            case 'mockAllResult': {
                isMockAllLoading = false;
                updateMockAllButton();

                const result = message.data || {};
                if (!result.success) {
                    showToast(result.message || t('bodyMode.mockFailed') || 'Failed to generate mock data from Swagger', 'error');
                    break;
                }

                let appliedCount = 0;
                const bodyEditor = document.getElementById('bodyEditor');
                const hasBodyContent = !!bodyEditor && (bodyEditor.value || '').trim().length > 0;

                if (typeof result.body === 'string' && result.body.trim().length > 0) {
                    if (bodyEditor && !hasBodyContent) {
                        bodyEditor.value = formatJsonBodyIfPossible(result.body);
                        updateBodyEditorVisualState();
                        appliedCount += 1;
                    } else if (hasBodyContent) {
                        showToast(t('bodyMode.mockSkipWhenBodyExists') || 'Body already has content. Clear it first if you want to generate mock body.', 'info');
                    }
                }

                if (Array.isArray(result.queryEntries) && result.queryEntries.length > 0) {
                    const normalizedEntries = result.queryEntries
                        .map(entry => ({
                            key: typeof entry?.key === 'string' ? entry.key.trim() : '',
                            value: typeof entry?.value === 'string' ? entry.value : String(entry?.value ?? '')
                        }))
                        .filter(entry => entry.key.length > 0);

                    if (normalizedEntries.length > 0) {
                        const existingEntries = collectQueryEntriesFromRows();
                        const mergedEntries = mergeQueryEntriesKeepingManual(existingEntries, normalizedEntries);

                        renderQueryRowsFromEntries(mergedEntries);
                        setQueryQuickInputValue(buildQueryStringFromEntries(mergedEntries));
                        appliedCount += 1;
                    }
                }

                if (Array.isArray(result.formDataEntries) && result.formDataEntries.length > 0) {
                    const normalizedFormEntries = result.formDataEntries
                        .map(entry => ({
                            key: typeof entry?.key === 'string' ? entry.key.trim() : '',
                            value: typeof entry?.value === 'string' ? entry.value : String(entry?.value ?? '')
                        }))
                        .filter(entry => entry.key.length > 0);

                    if (normalizedFormEntries.length > 0) {
                        const existingFormEntries = collectFormDataEntriesFromRows();
                        const mergedFormEntries = mergeFormDataEntriesKeepingManual(existingFormEntries, normalizedFormEntries);
                        renderFormDataRowsFromEntries(mergedFormEntries);
                        appliedCount += 1;
                    }
                }

                if (appliedCount > 0) {
                    hasUserEditedRequest = true;
                    showToast(t('bodyMode.mockLoadedSwaggerUrl') || 'Mock data generated from Swagger', 'success');
                } else {
                    showToast(result.message || t('bodyMode.mockFailed') || 'No mock data available for this endpoint', 'info');
                }
                updateRequestTabBadges();
                break;
            }
        }
    });

    // Initialize with API endpoint data
    function initializeWithApiEndpoint(apiEndpoint) {
        currentApiEndpoint = apiEndpoint;
        currentDebugState = 'idle';
        isMockAllLoading = false;
        hasUserEditedRequest = false;
        restoredBinaryBodyBase64 = '';
        restoredBinaryContentType = '';
        restoredBinaryFileName = '';
        updateDebugButton();
        updateMockAllButton();

        resetResponseDisplay();

        // Update HTTP method and URL
        const methodElement = document.getElementById('httpMethod');
        methodElement.textContent = apiEndpoint.httpMethod;
        methodElement.className = 'http-method ' + apiEndpoint.httpMethod;

        // Split full URL into base URL and route
        const fullUrl = apiEndpoint.fullUrl || apiEndpoint.routeTemplate;
        const urlMatch = fullUrl.match(/^(https?:\/\/[^\/]+)(.*)$/);

        if (urlMatch) {
            defaultBaseUrl = urlMatch[1];
            document.getElementById('routeInput').value = urlMatch[2] || '/';
        } else {
            defaultBaseUrl = '';
            document.getElementById('routeInput').value = fullUrl;
        }

        // Render base URL dropdown
        renderBaseUrls();

        // Query parameters list starts empty - only restored state will populate it
        document.getElementById('queryList').innerHTML = '';

        const bodyEditor = document.getElementById('bodyEditor');
        if (bodyEditor) {
            bodyEditor.value = '';
        }
        currentBodyMode = 'json';
        activateBodyMode('json');
        updateBodyEditorVisualState();

        updateBodyEditorVisualState();
        requestRequestStateForCurrentBaseUrl();
        updateRequestTabBadges();
    }

    // Update API endpoint (when switching between different APIs)
    function updateApiEndpoint(apiEndpoint) {
        initializeWithApiEndpoint(apiEndpoint);
    }

    // JSON 语法高亮函数
    function highlightJSON(jsonString) {
        try {
            // 尝试解析为 JSON
            JSON.parse(jsonString);

            const tokenPattern = /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:?)|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|[{}\[\],:]/g;

            return jsonString.replace(tokenPattern, (match) => {
                let cssClass = 'json-number';

                if (match.startsWith('"')) {
                    if (match.trimEnd().endsWith(':')) {
                        const colonIndex = match.lastIndexOf(':');
                        const keyPart = colonIndex >= 0 ? match.slice(0, colonIndex) : match;
                        const colonPart = colonIndex >= 0 ? match.slice(colonIndex) : '';
                        return `<span class="json-key">${escapeHtml(keyPart)}</span><span class="json-punctuation">${escapeHtml(colonPart)}</span>`;
                    }

                    cssClass = 'json-string';
                } else if (match === 'true' || match === 'false') {
                    cssClass = 'json-boolean';
                } else if (match === 'null') {
                    cssClass = 'json-null';
                } else if (/^[{}\[\],:]$/.test(match)) {
                    cssClass = 'json-punctuation';
                }

                return `<span class="${cssClass}">${escapeHtml(match)}</span>`;
            });
        } catch {
            // 不是 JSON，返回转义的纯文本
            return escapeHtml(jsonString);
        }
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderLineNumbers(lineCount) {
        const safeLineCount = Math.max(1, lineCount);
        const visibleLineCount = Math.min(safeLineCount, maxRenderLineNumbers);
        let lineNumbers = '';

        for (let index = 1; index <= visibleLineCount; index += 1) {
            lineNumbers += `<span class="line-number">${index}</span>`;
        }

        if (safeLineCount > visibleLineCount) {
            lineNumbers += '<span class="line-number">…</span>';
        }

        document.getElementById('lineNumbers').innerHTML = lineNumbers;
    }

    const HTTP_STATUS_REASON_PHRASES = {
        100: 'Continue',
        101: 'Switching Protocols',
        102: 'Processing',
        103: 'Early Hints',
        200: 'OK',
        201: 'Created',
        202: 'Accepted',
        203: 'Non-Authoritative Information',
        204: 'No Content',
        205: 'Reset Content',
        206: 'Partial Content',
        207: 'Multi-Status',
        208: 'Already Reported',
        226: 'IM Used',
        300: 'Multiple Choices',
        301: 'Moved Permanently',
        302: 'Found',
        303: 'See Other',
        304: 'Not Modified',
        305: 'Use Proxy',
        307: 'Temporary Redirect',
        308: 'Permanent Redirect',
        400: 'Bad Request',
        401: 'Unauthorized',
        402: 'Payment Required',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        406: 'Not Acceptable',
        407: 'Proxy Authentication Required',
        408: 'Request Timeout',
        409: 'Conflict',
        410: 'Gone',
        411: 'Length Required',
        412: 'Precondition Failed',
        413: 'Payload Too Large',
        414: 'URI Too Long',
        415: 'Unsupported Media Type',
        416: 'Range Not Satisfiable',
        417: 'Expectation Failed',
        418: "I'm a Teapot",
        421: 'Misdirected Request',
        422: 'Unprocessable Entity',
        423: 'Locked',
        424: 'Failed Dependency',
        425: 'Too Early',
        426: 'Upgrade Required',
        428: 'Precondition Required',
        429: 'Too Many Requests',
        431: 'Request Header Fields Too Large',
        451: 'Unavailable For Legal Reasons',
        500: 'Internal Server Error',
        501: 'Not Implemented',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout',
        505: 'HTTP Version Not Supported',
        506: 'Variant Also Negotiates',
        507: 'Insufficient Storage',
        508: 'Loop Detected',
        510: 'Not Extended',
        511: 'Network Authentication Required'
    };

    function formatHttpStatus(statusCode) {
        if (!Number.isInteger(statusCode) || statusCode <= 0) {
            return 'Error';
        }

        const reasonPhrase = HTTP_STATUS_REASON_PHRASES[statusCode];
        if (reasonPhrase) {
            return `${statusCode} ${reasonPhrase}`;
        }

        return `${statusCode}`;
    }

    function formatNetworkErrorStatus(errorCode, errorMessage) {
        const normalizedCode = typeof errorCode === 'string' ? errorCode.trim().toUpperCase() : '';
        const normalizedMessage = typeof errorMessage === 'string' ? errorMessage.trim().toLowerCase() : '';

        if (normalizedCode === 'ETIMEDOUT' || normalizedMessage.includes('timeout')) {
            return 'Timeout';
        }

        if (normalizedCode === 'ECONNREFUSED') {
            return 'Connection Refused';
        }

        if (normalizedCode === 'ENOTFOUND' || normalizedCode === 'EAI_AGAIN') {
            return 'DNS Not Found';
        }

        if (normalizedCode === 'ECONNRESET') {
            return 'Connection Reset';
        }

        if (normalizedCode === 'EHOSTUNREACH' || normalizedCode === 'ENETUNREACH') {
            return 'Network Unreachable';
        }

        if (normalizedCode === 'ECONNABORTED') {
            return 'Connection Aborted';
        }

        if (normalizedCode === 'DEPTH_ZERO_SELF_SIGNED_CERT'
            || normalizedCode === 'SELF_SIGNED_CERT_IN_CHAIN'
            || normalizedCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
            || normalizedCode === 'CERT_HAS_EXPIRED'
            || normalizedCode === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            return 'TLS Certificate Error';
        }

        if (normalizedMessage.includes('invalid url') || normalizedMessage.includes('only absolute urls are supported')) {
            return 'Invalid URL';
        }

        return 'Network Error';
    }

    function formatRequestStatus(data) {
        if (Number.isInteger(data?.statusCode) && data.statusCode > 0) {
            return formatHttpStatus(data.statusCode);
        }

        return formatNetworkErrorStatus(data?.errorCode, data?.error);
    }

    // Show loading state
    function showLoading() {
        const statusValue = document.getElementById('statusValue');
        statusValue.textContent = t('status.sending');
        statusValue.className = 'status-value';

        document.getElementById('sizeValue').textContent = '-';
        document.getElementById('timeValue').textContent = '-';

        document.getElementById('responseBody').innerHTML = `<span style="color: var(--vscode-descriptionForeground); font-style: italic;">${t('status.sending')}</span>`;
        document.getElementById('lineNumbers').innerHTML = '<span class="line-number">1</span>';

        document.getElementById('headerCount').textContent = '0';
        document.getElementById('responseHeaders').innerHTML = '';
        latestResponseText = '';
    }

    function resetResponseDisplay() {
        document.getElementById('statusValue').textContent = '-';
        document.getElementById('statusValue').className = 'status-value';
        document.getElementById('sizeValue').textContent = '-';
        document.getElementById('timeValue').textContent = '-';
        document.getElementById('responseBody').innerHTML = '';
        document.getElementById('lineNumbers').innerHTML = '';
        document.getElementById('headerCount').textContent = '0';
        document.getElementById('responseHeaders').innerHTML = '';
        latestResponseText = '';
    }

    // Display response
    function displayResponse(data) {
        if (!data || typeof data !== 'object') {
            resetResponseDisplay();
            return;
        }

        // Re-enable send button
        document.getElementById('sendButton').disabled = false;

        if (data.success) {
            // Update status
            const statusText = formatHttpStatus(data.statusCode);
            const statusValue = document.getElementById('statusValue');
            statusValue.textContent = statusText;
            statusValue.className = data.statusCode >= 200 && data.statusCode < 300 ? 'status-value' : 'status-value error';

            // Update size
            const rawBody = typeof data.body === 'string' ? data.body : '';
            const bodySize = new Blob([rawBody]).size;
            document.getElementById('sizeValue').textContent = bodySize + ' Bytes';

            // Update time
            document.getElementById('timeValue').textContent = Number.isFinite(data.duration) ? data.duration + ' ms' : '-';

            const isLargeResponse = bodySize >= largeResponseThresholdBytes;
            let formattedBody = rawBody;
            let responseHtml = '';

            if (isLargeResponse) {
                const lineCount = Math.max(1, (formattedBody.match(/\n/g)?.length || 0) + 1);
                renderLineNumbers(lineCount);
                responseHtml = `<span style="color: var(--vscode-descriptionForeground);">Large response detected. Rendered in plain text mode for performance.</span>\n\n${escapeHtml(formattedBody)}`;
            } else {
                try {
                    const jsonObj = JSON.parse(data.body);
                    formattedBody = JSON.stringify(jsonObj, null, jsonIndentSpaces);
                } catch {
                    // Not JSON, keep as is
                }

                const lineCount = Math.max(1, (formattedBody.match(/\n/g)?.length || 0) + 1);
                renderLineNumbers(lineCount);

                responseHtml = highlightJSON(formattedBody);
            }

            latestResponseText = formattedBody;

            document.getElementById('responseBody').innerHTML = responseHtml;

            // Update headers
            const headerCount = Object.keys(data.headers || {}).length;
            document.getElementById('headerCount').textContent = headerCount;

            const headersHtml = Object.entries(data.headers || {}).map(([key, value]) => `
                    <div class="header-item">
                        <div class="header-key">${escapeHtml(key)}:</div>
                        <div class="header-value">${escapeHtml(String(value))}</div>
                    </div>
                `).join('');
            document.getElementById('responseHeaders').innerHTML = headersHtml;

            // Reset to body tab
            document.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('[data-response-tab="body"]').classList.add('active');
            document.querySelectorAll('.response-tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('bodyPanel').classList.add('active');

        } else {
            // Show error in response body
            const statusValue = document.getElementById('statusValue');
            statusValue.textContent = formatRequestStatus(data);
            statusValue.className = 'status-value error';

            document.getElementById('sizeValue').textContent = '-';
            document.getElementById('timeValue').textContent = Number.isFinite(data.duration) ? data.duration + ' ms' : '-';

            // Display error in response body
            document.getElementById('responseBody').innerHTML = escapeHtml(data.error || '');
            latestResponseText = typeof data.error === 'string' ? data.error : String(data.error || '');
            renderLineNumbers(1);

            document.getElementById('headerCount').textContent = '0';
            document.getElementById('responseHeaders').innerHTML = '';
        }
    }
})();
