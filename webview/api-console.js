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
    let tempBaseUrls = []; // 临时编辑中的 base URLs
    let currentBodyMode = 'json';
    let baseUrlMeasureCanvas = null;
    let currentDebugState = 'idle';
    let requestHistory = [];
    let largeResponseThresholdBytes = 1024 * 1024;
    let maxRenderLineNumbers = 2000;

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

    // Load and render base URLs in the select dropdown
    function renderBaseUrls() {
        const select = document.getElementById('baseUrlSelect');
        select.innerHTML = '';

        // 总是先添加默认URL（来自 launchSettings.json）并设置为第一个选项
        if (defaultBaseUrl) {
            const option = document.createElement('option');
            option.value = defaultBaseUrl;
            option.textContent = `${defaultBaseUrl}`;
            option.dataset.isDefault = 'true';
            select.appendChild(option);
        }

        // 然后添加用户保存的 base URLs
        savedBaseUrls.forEach((url, index) => {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = url;
            option.dataset.index = index;
            select.appendChild(option);
        });

        // 默认选中第一个选项（launchSettings.json 的 URL）
        if (select.options.length > 0) {
            select.selectedIndex = 0;
        }

        updateBaseUrlSelectWidth();
    }

    function updateBaseUrlSelectWidth() {
        const select = document.getElementById('baseUrlSelect');
        const container = document.querySelector('.base-url-container');
        if (!select || !container) {
            return;
        }

        const selectedText = select.options.length > 0
            ? (select.options[select.selectedIndex]?.text || select.value || '')
            : (t('placeholder.baseUrl') || 'Select Base URL');

        const computedStyle = window.getComputedStyle(select);
        const canvas = baseUrlMeasureCanvas || (baseUrlMeasureCanvas = document.createElement('canvas'));
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        context.font = computedStyle.font;
        const textWidth = context.measureText(selectedText).width;

        const minWidth = 160;
        const maxWidth = 500;
        const horizontalSpace = 56;
        const targetWidth = Math.ceil(textWidth + horizontalSpace);
        const finalWidth = Math.max(minWidth, Math.min(maxWidth, targetWidth));

        container.style.width = `${finalWidth}px`;
    }

    // Render base URL list in management modal
    function renderBaseUrlList() {
        const container = document.getElementById('baseUrlListContainer');

        if (tempBaseUrls.length === 0) {
            container.innerHTML = `<p style="color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">${t('baseUrl.empty')}</p>`;
            return;
        }

        container.innerHTML = tempBaseUrls.map((url, index) => `
                <div class="base-url-item">
                    <input type="text" class="base-url-item-input" value="${escapeHtml(url)}" data-index="${index}" placeholder="${t('placeholder.baseUrlInput')}" />
                    <div class="base-url-item-actions">
                        <button class="base-url-item-btn delete" data-index="${index}" title="${t('delete')}">🗑️</button>
                    </div>
                </div>
            `).join('');
    }

    // Event delegation for base URL list buttons
    document.getElementById('baseUrlListContainer').addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('delete')) {
            const index = parseInt(target.getAttribute('data-index'));
            deleteBaseUrlDirect(index);
        }
    });

    // Event delegation for input changes
    document.getElementById('baseUrlListContainer').addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('base-url-item-input')) {
            const index = parseInt(target.getAttribute('data-index'));
            tempBaseUrls[index] = target.value;
        }
    });

    // Delete base URL directly (no confirmation)
    function deleteBaseUrlDirect(index) {
        if (index >= 0 && index < tempBaseUrls.length) {
            tempBaseUrls.splice(index, 1);
            renderBaseUrlList();
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

    // Open management modal
    document.getElementById('manageBaseUrlBtn').addEventListener('click', () => {
        // Copy current saved URLs to temp for editing
        tempBaseUrls = [...savedBaseUrls];
        renderBaseUrlList();
        document.getElementById('manageBaseUrlModal').classList.add('show');
    });

    // Cancel management modal (discard changes)
    document.getElementById('cancelManageBtn').addEventListener('click', () => {
        document.getElementById('manageBaseUrlModal').classList.remove('show');
        tempBaseUrls = [];
    });

    // Save management modal (apply changes)
    document.getElementById('saveManageBtn').addEventListener('click', () => {
        // Filter out empty URLs and trim
        savedBaseUrls = tempBaseUrls
            .map(url => url.trim())
            .filter(url => url.length > 0);

        // Save to extension
        vscode.postMessage({
            type: 'saveBaseUrls',
            data: savedBaseUrls
        });

        // Re-render select dropdown
        renderBaseUrls();

        // Close modal
        document.getElementById('manageBaseUrlModal').classList.remove('show');
        tempBaseUrls = [];

        // Show success message
        showToast(t('baseUrl.saved'), 'success');
    });

    // Add new base URL
    document.getElementById('addNewBaseUrlBtn').addEventListener('click', () => {
        tempBaseUrls.push(''); // Add empty string at the end
        renderBaseUrlList();
        // Focus on the last input
        setTimeout(() => {
            const inputs = document.querySelectorAll('.base-url-item-input');
            if (inputs.length > 0) {
                const lastInput = inputs[inputs.length - 1];
                lastInput.focus();
                lastInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 0);
    });

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

    function formatHistoryTimestamp(timestamp) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }

        const now = new Date();
        const sameDay = date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();

        const pad = (value) => String(value).padStart(2, '0');
        const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

        if (sameDay) {
            return timePart;
        }

        return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${timePart}`;
    }

    function formatHistoryStatus(statusCode) {
        const rawStatus = statusCode === null || statusCode === undefined ? '--' : String(statusCode);
        return rawStatus.padStart(3, '\u00A0');
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
            return JSON.stringify(parsed, null, 2);
        } catch {
            return bodyText;
        }
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
            bodyEditor.value = JSON.stringify(parsed, null, 2);
        } catch {
            showToast(t('error.invalidJson') || 'Invalid JSON format', 'error');
        }
    }

    function renderRequestHistory() {
        const historySelect = document.getElementById('historySelect');
        const clearButton = document.getElementById('clearHistoryBtn');

        if (!historySelect || !clearButton) {
            return;
        }

        const previousValue = historySelect.value;
        historySelect.innerHTML = '';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = t('history.placeholder') || 'Request History';
        historySelect.appendChild(placeholderOption);

        requestHistory.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            const statusCode = formatHistoryStatus(item.statusCode);
            option.textContent = `[${statusCode}] ${formatHistoryTimestamp(item.timestamp)}`;
            historySelect.appendChild(option);
        });

        const hasPrevious = requestHistory.some(item => item.id === previousValue);
        historySelect.value = hasPrevious ? previousValue : '';

        clearButton.disabled = requestHistory.length === 0;
    }

    function applyHistoryRecord(record) {
        if (!record) {
            return;
        }

        const queryStringInput = document.getElementById('queryStringInput');
        const bodyEditor = document.getElementById('bodyEditor');
        const queryList = document.getElementById('queryList');

        if (queryStringInput) {
            queryStringInput.value = record.query || '';
        }

        if (queryList) {
            queryList.innerHTML = '';
        }

        if (bodyEditor) {
            bodyEditor.value = formatJsonBodyIfPossible(record.body || '');
        }

        activateBodyMode('json');
    }



    // Get current selected base URL
    function getCurrentBaseUrl() {
        const select = document.getElementById('baseUrlSelect');
        return select.value || '';
    }

    document.getElementById('baseUrlSelect')?.addEventListener('change', () => {
        updateBaseUrlSelectWidth();
    });

    window.addEventListener('resize', () => {
        updateBaseUrlSelectWidth();
    });

    document.getElementById('addHeaderBtn')?.addEventListener('click', addHeaderRow);
    document.getElementById('addQueryBtn')?.addEventListener('click', addQueryRow);
    document.getElementById('addFormDataRowBtn')?.addEventListener('click', () => addFormDataRow());
    document.getElementById('clearDisabledFormDataBtn')?.addEventListener('click', clearDisabledFormDataRows);
    document.getElementById('formatJsonBtn')?.addEventListener('click', formatJsonEditorContent);
    document.getElementById('historySelect')?.addEventListener('change', () => {
        const historySelect = document.getElementById('historySelect');
        const selectedId = historySelect?.value;

        if (!selectedId) {
            return;
        }

        const selectedRecord = requestHistory.find(item => item.id === selectedId);
        if (selectedRecord) {
            applyHistoryRecord(selectedRecord);
        }
    });

    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => {
        vscode.postMessage({
            type: 'clearRequestHistory'
        });
    });

    document.getElementById('headersList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-button')) {
            target.closest('.param-row')?.remove();
        }
    });

    document.getElementById('queryList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-button')) {
            target.closest('.param-row')?.remove();
        }
    });

    document.getElementById('formDataList')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('formdata-delete-btn')) {
            target.closest('.formdata-row')?.remove();
            ensureFormDataHasAtLeastOneRow();
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
            return;
        }

        if (target.classList.contains('formdata-file-input')) {
            const row = target.closest('.formdata-row');
            if (row) {
                updateFormDataFileName(row);
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
        fileNameElement.textContent = selectedFile?.name || t('bodyMode.noFile');
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
                if (!file) {
                    continue;
                }

                const valueBase64 = await fileToBase64(file);
                fields.push({
                    key,
                    type: 'file',
                    fileName: file.name,
                    contentType: file.type || 'application/octet-stream',
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
        binaryFileName.textContent = selectedFile?.name || t('bodyMode.noFile');
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

    document.getElementById('binaryFileSelectBtn')?.addEventListener('click', () => {
        document.getElementById('binaryFileInput')?.click();
    });

    document.getElementById('binaryFileInput')?.addEventListener('change', () => {
        updateBinaryFileNameDisplay();
    });

    document.getElementById('debugButton')?.addEventListener('click', () => {
        currentDebugState = 'starting';
        updateDebugButton();

        vscode.postMessage({
            type: 'startDebug'
        });
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
    function addHeaderRow() {
        const list = document.getElementById('headersList');
        const row = document.createElement('div');
        row.className = 'param-row';
        row.innerHTML = `
                <input type="text" class="param-input" placeholder="${t('placeholder.key')}" />
                <input type="text" class="param-input" placeholder="${t('placeholder.value')}" />
                <button class="remove-button" type="button">${t('remove') || ''}</button>
            `;
        list.appendChild(row);
    }

    // Add query row
    function addQueryRow() {
        const list = document.getElementById('queryList');
        const row = document.createElement('div');
        row.className = 'param-row';
        row.innerHTML = `
                <input type="text" class="param-input" placeholder="${t('placeholder.key')}" />
                <input type="text" class="param-input" placeholder="${t('placeholder.value')}" />
                <button class="remove-button" type="button">${t('remove') || ''}</button>
            `;
        list.appendChild(row);
        return row;
    }

    function addQueryRowWithKey(key) {
        const row = addQueryRow();
        const keyInput = row?.querySelectorAll('.param-input')?.[0];
        if (keyInput) {
            keyInput.value = key;
        }
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
        const route = document.getElementById('routeInput').value;
        const token = document.getElementById('tokenInput').value;

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

        // Collect query parameters and append to URL
        // Priority: query string input > manual parameter list
        const queryEntries = [];
        const queryStringInput = document.getElementById('queryStringInput').value.trim();

        if (queryStringInput) {
            // Use query string input (priority)
            const cleanString = queryStringInput.startsWith('?') ? queryStringInput.substring(1) : queryStringInput;
            const params = new URLSearchParams(cleanString);
            params.forEach((value, key) => {
                queryEntries.push({ key, value });
            });
        } else {
            // Use manual parameter list (fallback)
            document.querySelectorAll('#queryList .param-row').forEach(row => {
                const inputs = row.querySelectorAll('.param-input');
                const key = inputs[0].value.trim();
                const value = inputs[1].value.trim();
                if (key) {
                    queryEntries.push({ key, value });
                }
            });
        }

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
        const canHaveBody = !['GET', 'HEAD'].includes(method.toUpperCase());
        if (canHaveBody) {
            if (currentBodyMode === 'binary') {
                const binaryFileInput = document.getElementById('binaryFileInput');
                const selectedFile = binaryFileInput?.files?.[0];
                if (selectedFile) {
                    binaryBodyBase64 = await fileToBase64(selectedFile);
                    binaryContentType = selectedFile.type || undefined;
                    binaryFileName = selectedFile.name || undefined;
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
                headers,
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
        updateDebugButton();
        document.getElementById('sendButton').textContent = t('send');
        document.getElementById('addHeaderBtn').textContent = t('add');
        document.getElementById('addQueryBtn').textContent = t('add');
        document.getElementById('addNewBaseUrlBtn').textContent = t('baseUrl.add');
        document.getElementById('clearHistoryBtn').textContent = t('history.clear') || 'Clear';
        document.getElementById('formatJsonBtn').textContent = t('bodyMode.formatJson') || 'Format';

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
        document.getElementById('routeInput').placeholder = t('placeholder.route');
        document.getElementById('tokenInput').placeholder = t('placeholder.token');
        document.getElementById('bodyEditor').placeholder = t('placeholder.body');
        document.getElementById('queryStringInput').placeholder = t('placeholder.queryString');

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
        const binaryFileLabel = document.querySelector('.binary-file-label');
        if (binaryFileLabel) {
            binaryFileLabel.textContent = t('bodyMode.binaryFile');
        }
        const binaryFileSelectBtn = document.getElementById('binaryFileSelectBtn');
        if (binaryFileSelectBtn) {
            binaryFileSelectBtn.textContent = t('bodyMode.selectFile');
        }
        updateBinaryFileNameDisplay();

        // Update manage button title
        document.getElementById('manageBaseUrlBtn').title = t('baseUrl.manage');

        // Update auth type button
        document.querySelector('[data-auth-type="bearer"]').textContent = t('auth.bearer');

        renderRequestHistory();
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
                break;
            case 'updateApiEndpoint':
                updateApiEndpoint(message.data);
                break;
            case 'loadBaseUrls':
                savedBaseUrls = message.data || [];
                renderBaseUrls();
                break;
            case 'requestHistoryLoaded':
                requestHistory = Array.isArray(message.data) ? message.data : [];
                renderRequestHistory();
                break;
            case 'renderSettings': {
                const settings = message.data || {};
                const threshold = Number(settings.largeResponseThresholdBytes);
                const lineLimit = Number(settings.maxResponseLineNumbers);

                if (Number.isFinite(threshold) && threshold > 0) {
                    largeResponseThresholdBytes = Math.floor(threshold);
                }

                if (Number.isFinite(lineLimit) && lineLimit > 0) {
                    maxRenderLineNumbers = Math.floor(lineLimit);
                }
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
        }
    });

    // Initialize with API endpoint data
    function initializeWithApiEndpoint(apiEndpoint) {
        currentApiEndpoint = apiEndpoint;
        currentDebugState = 'idle';
        updateDebugButton();
        requestHistory = [];
        renderRequestHistory();

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

        // Query parameters list starts empty - users can add them manually
        document.getElementById('queryList').innerHTML = '';

        const autoQueryParamNames = Array.isArray(apiEndpoint.autoQueryParamNames)
            ? apiEndpoint.autoQueryParamNames
                .filter(name => typeof name === 'string')
                .map(name => name.trim())
                .filter(name => name.length > 0)
            : [];

        if (autoQueryParamNames.length > 0) {
            activateMainTab('query');
            autoQueryParamNames.forEach(paramName => addQueryRowWithKey(paramName));
        }
    }

    // Update API endpoint (when switching between different APIs)
    function updateApiEndpoint(apiEndpoint) {
        initializeWithApiEndpoint(apiEndpoint);
    }

    // JSON 语法高亮函数
    function highlightJSON(jsonString) {
        const escapeHtml = (text) => {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        try {
            // 尝试解析为 JSON
            JSON.parse(jsonString);

            // 高亮 JSON
            return jsonString
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
                .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
                .replace(/: (\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
                .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                .replace(/: null/g, ': <span class="json-null">null</span>');
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
    }

    // Display response
    function displayResponse(data) {
        // Re-enable send button
        document.getElementById('sendButton').disabled = false;

        if (data.success) {
            // Update status
            const statusText = data.statusCode >= 200 && data.statusCode < 300 ? '200 OK' : data.statusCode + ' Error';
            const statusValue = document.getElementById('statusValue');
            statusValue.textContent = statusText;
            statusValue.className = data.statusCode >= 200 && data.statusCode < 300 ? 'status-value' : 'status-value error';

            // Update size
            const bodySize = new Blob([data.body]).size;
            document.getElementById('sizeValue').textContent = bodySize + ' Bytes';

            // Update time
            document.getElementById('timeValue').textContent = data.duration + ' ms';

            const isLargeResponse = bodySize >= largeResponseThresholdBytes;
            let formattedBody = data.body;
            let responseHtml = '';

            if (isLargeResponse) {
                const lineCount = Math.max(1, (formattedBody.match(/\n/g)?.length || 0) + 1);
                renderLineNumbers(lineCount);
                responseHtml = `<span style="color: var(--vscode-descriptionForeground);">Large response detected. Rendered in plain text mode for performance.</span>\n\n${escapeHtml(formattedBody)}`;
            } else {
                try {
                    const jsonObj = JSON.parse(data.body);
                    formattedBody = JSON.stringify(jsonObj, null, 2);
                } catch {
                    // Not JSON, keep as is
                }

                const lineCount = Math.max(1, (formattedBody.match(/\n/g)?.length || 0) + 1);
                renderLineNumbers(lineCount);

                responseHtml = highlightJSON(formattedBody);
            }

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
            statusValue.textContent = 'Error';
            statusValue.className = 'status-value error';

            document.getElementById('sizeValue').textContent = '-';
            document.getElementById('timeValue').textContent = data.duration + ' ms';

            // Display error in response body
            document.getElementById('responseBody').innerHTML = escapeHtml(data.error);
            renderLineNumbers(1);

            document.getElementById('headerCount').textContent = '0';
            document.getElementById('responseHeaders').innerHTML = '';
        }
    }
})();