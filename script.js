// --- INITIALIZATION ---
let items = JSON.parse(localStorage.getItem('taskManagerItems')) || [];

// Main Circles (Global)
let categories = JSON.parse(localStorage.getItem('taskManagerCategories')) || [
    { id: 'goal', name: 'Goals' }, { id: 'project', name: 'Projects' }, { id: 'task', name: 'Tasks' }
];

// Default Detail Template
const defaultDetailCategories = [
    { id: 'events', name: 'Events' },
    { id: 'connections', name: 'Connections' },
    { id: 'history', name: 'History' },
    { id: 'interest', name: 'Interests' },
    { id: 'likes', name: 'Likes' },
    { id: 'dislikes', name: 'Dislikes' },
    { id: 'notes', name: 'Notes' }
];

let activeFilters = new Set(['all']);
let selectedTags = new Set();
let showCompleted = false;
let currentContactId = null; 
let tempParentId = null; 
let searchQuery = '';
let sortBy = 'manual'; // 'manual', 'upcoming', 'drift'
let editingId = null;

function saveData() {
    localStorage.setItem('taskManagerItems', JSON.stringify(items));
    localStorage.setItem('taskManagerCategories', JSON.stringify(categories));
}

function getActiveCategoryList() {
    if (!currentContactId) return categories;
    
    const contact = items.find(i => i.id === currentContactId);
    if (!contact) return [];

    if (!contact.customCategories) {
        contact.customCategories = JSON.parse(JSON.stringify(defaultDetailCategories));
        saveData();
    }
    return contact.customCategories;
}

// --- GLOBAL SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    const itemModal = document.getElementById('itemModal');
    const settingsModal = document.getElementById('settingsModal');
    const isAnyModalOpen = itemModal.classList.contains('active') || settingsModal.classList.contains('active');
    
    if (e.key === 'Escape') {
        closeModal();
        closeSettings();
        document.getElementById('suggestionsDropdown').style.display = 'none';
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && itemModal.classList.contains('active')) {
        if(document.getElementById('itemForm').checkValidity()) document.getElementById('itemForm').dispatchEvent(new Event('submit'));
    }

    if (e.key.toLowerCase() === 'n' && !isAnyModalOpen) {
        const activeTag = document.activeElement.tagName.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
            e.preventDefault();
            openNewItem();
        }
    }
});

// --- TAG FILTER LOGIC ---
const tagInput = document.getElementById('catFilterInput');
const suggestionsDropdown = document.getElementById('suggestionsDropdown');
const activeTagsContainer = document.getElementById('activeTagsContainer');

tagInput.addEventListener('focus', () => { renderSuggestions(); suggestionsDropdown.style.display = 'block'; });
document.addEventListener('click', (e) => { if (!tagInput.contains(e.target) && !suggestionsDropdown.contains(e.target)) suggestionsDropdown.style.display = 'none'; });
tagInput.addEventListener('input', () => { renderSuggestions(tagInput.value); });
tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); processTagInput(tagInput.value); }
    if (e.key === 'Backspace' && tagInput.value === '' && selectedTags.size > 0) { const lastTag = Array.from(selectedTags).pop(); removeTag(lastTag); }
});

function processTagInput(val) {
    const terms = val.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    const activeList = getActiveCategoryList();
    terms.forEach(term => { const match = activeList.find(c => c.name.toLowerCase() === term); if (match) addTag(match.id); });
    tagInput.value = ''; renderSuggestions();
}

function renderSuggestions(filterText = '') {
    const term = filterText.toLowerCase();
    const activeList = getActiveCategoryList();
    const availableCats = activeList.filter(c => !selectedTags.has(c.id));
    const matches = availableCats.filter(c => c.name.toLowerCase().includes(term));
    if (matches.length === 0) { suggestionsDropdown.style.display = 'none'; return; }
    suggestionsDropdown.innerHTML = matches.map(c => `<div class="suggestion-item" onclick="addTag('${c.id}')">${c.name}</div>`).join('');
    suggestionsDropdown.style.display = 'block';
}

function toggleCategoryFilter(id) {
    const isOnlySelected = selectedTags.size === 1 && selectedTags.has(id);
    if (isOnlySelected) {removeTag(id);} else {selectedTags.clear(); addTag(id);}
}

function addTag(id) {
    selectedTags.add(id); renderTags(); tagInput.value = ''; renderSuggestions(); renderItems(); updateSidebarStyles();
}

function removeTag(id) {
    selectedTags.delete(id); renderTags(); renderItems(); updateSidebarStyles();
}

function renderTags() {
    const activeList = getActiveCategoryList();
    activeTagsContainer.innerHTML = Array.from(selectedTags).map(id => {
        const cat = activeList.find(c => c.id === id); if (!cat) return '';
        return `<div class="filter-tag"><span>${cat.name}</span><button onclick="removeTag('${id}')"><i class="fas fa-times"></i></button></div>`;
    }).join('');
}

function resetFilters() {
    selectedTags.clear(); showCompleted = false; renderTags(); renderItems(); updateSidebarStyles();
}

function toggleCompletedFilter() {
    showCompleted = !showCompleted; renderItems(); updateSidebarStyles();
}

function updateSidebarStyles() {
    const isAllActive = selectedTags.size === 0 && !showCompleted;
    document.getElementById('allFilter').classList.toggle('active', isAllActive);
    document.getElementById('completedFilter').classList.toggle('active', showCompleted);
    document.querySelectorAll('.category-name').forEach(el => {
        const catId = el.closest('.category-row')?.dataset.catId;
        if(catId) el.classList.toggle('active', selectedTags.has(catId));
    });
}

// --- DATE & EVENT LOGIC ---
function getEventEffectiveDate(eventItem) {
    if (!eventItem.dueDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0); 

    let eventDate = new Date(eventItem.dueDate + (eventItem.dueTime ? 'T' + eventItem.dueTime : 'T00:00:00'));
    
    if (eventItem.recurring) {
        let candidate = new Date(now.getFullYear(), eventDate.getMonth(), eventDate.getDate(), eventDate.getHours(), eventDate.getMinutes());
        if (candidate < now) candidate.setFullYear(now.getFullYear() + 1);
        return candidate;
    } else {
        return eventDate;
    }
}

function getNextValidEventDate(contactId) {
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(now.getDate() + 30); 

    const contactEvents = items.filter(i => 
        i.parentId === contactId && 
        i.type === 'events' && 
        !i.completed && 
        i.dueDate
    );

    let upcomingDates = [];
    contactEvents.forEach(e => {
        const effectiveDate = getEventEffectiveDate(e);
        if (effectiveDate && effectiveDate >= now && effectiveDate <= threshold) {
            upcomingDates.push(effectiveDate);
        }
    });

    if (upcomingDates.length === 0) return null;
    upcomingDates.sort((a, b) => a - b);
    return upcomingDates[0];
}

// --- DRIFT LOGIC ---
function getLastContactDate(contact) {
    const historyItems = items.filter(i => i.parentId === contact.id && i.type === 'history' && i.dueDate);
    if (historyItems.length === 0) return null;
    historyItems.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));
    return new Date(historyItems[0].dueDate);
}

function getDriftDays(contact) {
    // Returns number of days OVER the catchup limit. 
    // Positive = Drifting (Needs contact). Negative = Safe.
    if (!contact.catchUpFreq) return -Infinity; // No setting = no drift

    const freqDays = parseInt(contact.catchUpFreq);
    const now = new Date();
    
    let lastDate = getLastContactDate(contact);
    if (!lastDate) lastDate = contact.createdAt ? new Date(contact.createdAt) : new Date(); 

    const diffTime = Math.abs(now - lastDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    return diffDays - freqDays;
}

function getDriftStatus(contact) {
    const drift = getDriftDays(contact);
    if (drift > 0) {
        return `Drifting (${drift}d)`;
    }
    return null;
}

// --- RENDER ITEMS ---
function renderItems() {
    const grid = document.getElementById('itemsGrid');
    
    let filtered = items.filter(i => {
        if (currentContactId) return i.parentId === currentContactId;
        return !i.parentId;
    });
    
    if (showCompleted) filtered = filtered.filter(i => i.completed);
    else filtered = filtered.filter(i => !i.completed);

    if (selectedTags.size > 0) filtered = filtered.filter(i => selectedTags.has(i.type));
    if (searchQuery) filtered = filtered.filter(i => {
        if (i.type === 'connections') {
            const target = items.find(t => t.id === parseInt(i.targetId));
            const targetName = target ? target.title.toLowerCase() : '';
            return targetName.includes(searchQuery) || (i.description && i.description.toLowerCase().includes(searchQuery));
        }
        return i.title.toLowerCase().includes(searchQuery) || (i.description && i.description.toLowerCase().includes(searchQuery));
    });

    // --- SORTING LOGIC ---
    if (sortBy === 'upcoming') {
        if (!currentContactId) {
            const contactsWithEvents = [];
            filtered.forEach(contact => {
                const nextDate = getNextValidEventDate(contact.id);
                if (nextDate) {
                    contactsWithEvents.push({ contact, nextDate });
                }
            });
            contactsWithEvents.sort((a, b) => a.nextDate - b.nextDate);
            filtered = contactsWithEvents.map(obj => obj.contact);
        } else {
            filtered.sort((a, b) => {
                const dateA = getEventEffectiveDate(a) || new Date(9999, 0, 1);
                const dateB = getEventEffectiveDate(b) || new Date(9999, 0, 1);
                return dateA - dateB;
            });
        }
    } 
    else if (sortBy === 'drift') {
        if (!currentContactId) {
            // Sort by Drift Days (descending: most drifting first)
            // Filter to ensure we only show items that have a frequency set
            // or perhaps show all but push non-configured to bottom?
            // "Sorts by who is most overdue" implies putting the overdue ones at top.
            filtered.sort((a, b) => getDriftDays(b) - getDriftDays(a));
        }
    }

    if (filtered.length === 0) {
        let emptyMsg = currentContactId ? 'No details recorded yet.' : 'Orbit empty.';
        if (sortBy === 'upcoming' && !currentContactId) emptyMsg = 'No upcoming events in the next 30 days.';
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-layer-group"></i><p>${searchQuery ? 'No matches found.' : emptyMsg}</p></div>`;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const categoryName = getCategoryName(item.type);
        const isContact = !item.parentId; 
        const isEvent = item.type === 'events';
        const isHistory = item.type === 'history';
        const isConnection = item.type === 'connections';

        // --- CONNECTION LOGIC ---
        let displayTitle = item.title;
        let clickAction = currentContactId ? '' : `onclick="enterContactView(${item.id})"`;
        let cardClass = currentContactId ? 'item-card detail-card' : 'item-card contact-card';
        let connectionBadge = '';

        if (isConnection) {
            const targetContact = items.find(c => c.id === parseInt(item.targetId));
            if (targetContact) {
                displayTitle = targetContact.title;
                clickAction = `onclick="enterContactView(${targetContact.id})"`;
                cardClass += ' connection-card';
                if (item.description) {
                    connectionBadge = `<div class="connection-badge"><i class="fas fa-link"></i> ${item.description}</div>`;
                }
            } else {
                displayTitle = "Unknown Contact";
                clickAction = '';
            }
        }

        // --- DRIFT LOGIC ---
        let driftHtml = '';
        if (isContact) {
            const driftStatus = getDriftStatus(item);
            if (driftStatus) {
                driftHtml = `<span class="drift-tag"><i class="fas fa-wind"></i> ${driftStatus}</span>`;
            }
        }

        // --- DASHBOARD EVENTS LOGIC ---
        let eventsHtml = '';
        let targetIdForEvents = isConnection ? parseInt(item.targetId) : item.id;

        if (isContact) {
            const now = new Date();
            const threshold = new Date(); threshold.setDate(now.getDate() + 30);

            let myEvents = items.filter(child => 
                child.parentId === targetIdForEvents && 
                child.type === 'events' && 
                !child.completed &&
                child.dueDate
            ).map(e => {
                return { ...e, effectiveDate: getEventEffectiveDate(e) };
            }).filter(e => e.effectiveDate !== null);

            if (sortBy === 'upcoming') {
                myEvents = myEvents.filter(e => e.effectiveDate >= now && e.effectiveDate <= threshold);
            } else {
                myEvents = myEvents.filter(e => {
                    return e.effectiveDate.getMonth() === now.getMonth() && e.effectiveDate.getFullYear() === now.getFullYear();
                });
            }

            myEvents.sort((a, b) => a.effectiveDate - b.effectiveDate);

            if (myEvents.length > 0) {
                const title = sortBy === 'upcoming' ? 'Upcoming' : 'This Month';
                eventsHtml = `<div class="upcoming-events-preview">
                    <div class="event-preview-header">${title}</div>
                    ${myEvents.slice(0, 3).map(e => {
                        const day = e.effectiveDate.getDate();
                        const month = e.effectiveDate.toLocaleDateString('en-US', {month: 'short'});
                        const dateStr = `${month} ${day}`;
                        return `<div class="mini-event-row"><span class="mini-date">${dateStr}</span> <span class="mini-title">${e.title}</span></div>`;
                    }).join('')}
                </div>`;
            }
        }

        // --- DETAIL DISPLAY ---
        let dateHtml = '';
        let iconHtml = '';
        const interactions = {
            'in-person': '<i class="fas fa-handshake"></i>',
            'text': '<i class="fas fa-comment"></i>',
            'email': '<i class="fas fa-envelope"></i>',
            'voice': '<i class="fas fa-phone"></i>',
            'video': '<i class="fas fa-video"></i>'
        };

        if (item.dueDate) {
            const dateObj = new Date(item.dueDate + (item.dueTime ? 'T' + item.dueTime : ''));
            const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const timeStr = item.dueTime ? new Date('1970-01-01T' + item.dueTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            let extraIcon = '';
            if (isEvent && item.recurring) extraIcon = `<i class="fas fa-rotate-right" title="Recurring" style="margin-left:5px; font-size:10px;"></i>`;
            dateHtml = `<span class="date-badge"><i class="far fa-calendar"></i> ${dateStr} ${timeStr} ${extraIcon}</span>`;
        }

        if (isHistory && item.interactionType) {
            iconHtml = `<span class="interaction-icon" title="${item.interactionType}">${interactions[item.interactionType] || ''}</span>`;
        }

        function getInitials(name) { return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '?'; }
        function stringToColor(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
            const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
            return '#' + '00000'.substring(0, 6 - c.length) + c;
        }
        
        let avatarHtml = '';
        if (isContact || isConnection) {
            const initials = getInitials(displayTitle);
            const color = stringToColor(displayTitle);
            avatarHtml = `<div class="avatar" style="background-color: ${color}40; color: ${color}; border-color: ${color};">${initials}</div>`;
        }

        const isDragEnabled = sortBy === 'manual' && !searchQuery;

        // --- BUTTON LOGIC ---
        let actionButtons = '';
        if (isContact) {
            if (!item.completed) {
                actionButtons = `
                    <button onclick="event.stopPropagation(); openQuickLog(${item.id})" class="btn-quick-log" title="Quick Log"><i class="fas fa-plus"></i></button>
                    <button onclick="event.stopPropagation(); editItem(${item.id})" title="Edit"><i class="fas fa-pen"></i></button>
                    <button onclick="event.stopPropagation(); handleTrash(${item.id})" class="btn-delete" title="Archive"><i class="fas fa-trash"></i></button>
                `;
            } else {
                actionButtons = `
                    <button onclick="event.stopPropagation(); toggleItemStatus(${item.id})" class="btn-check" title="Restore"><i class="fas fa-undo"></i></button>
                    <button onclick="event.stopPropagation(); editItem(${item.id})" title="Edit"><i class="fas fa-pen"></i></button>
                    <button onclick="event.stopPropagation(); handleTrash(${item.id})" class="btn-delete" title="Delete Forever"><i class="fas fa-trash"></i></button>
                `;
            }
        } else {
            actionButtons = `
                <button onclick="event.stopPropagation(); editItem(${item.id})" title="Edit"><i class="fas fa-pen"></i></button>
                <button onclick="event.stopPropagation(); deleteItem(${item.id})" class="btn-delete" title="Delete"><i class="fas fa-trash"></i></button>
            `;
        }

        return `
                <div class="${cardClass} ${item.completed ? 'completed-card' : ''}" ${isDragEnabled ? 'draggable="true"' : ''} data-id="${item.id}" ${clickAction}>
                    <div class="item-header">
                        <div style="display:flex; align-items:center;">
                            ${avatarHtml}
                            <div class="item-title">${displayTitle}</div>
                        </div>
                        <div class="item-actions">
                            ${actionButtons}
                        </div>
                    </div>
                    
                    <div class="item-meta">
                        <div>
                            <span class="item-type">${categoryName}</span>
                            ${dateHtml}
                            ${iconHtml}
                            ${driftHtml}
                        </div>
                    </div>
                    
                    ${eventsHtml}
                    ${connectionBadge} 
                    ${(!isConnection && item.description) ? `<div class="item-description">${parseMarkdown(item.description)}</div>` : ''}
                </div>`;
    }).join('');

    if (sortBy === 'manual' && !searchQuery) {
        const cards = document.querySelectorAll('.item-card');
        cards.forEach(card => {
            card.addEventListener('dragstart', () => { setTimeout(() => card.classList.add('dragging'), 0); });
            card.addEventListener('dragend', () => { card.classList.remove('dragging'); updateItemOrder(); stopAutoScroll(); });
            addLongPressDrag(card); 
        });
    }
}

function handleSearch(val) { searchQuery = val.toLowerCase().trim(); renderItems(); }

// --- TRASH & LOGGING LOGIC ---

function handleTrash(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.completed) {
        deleteItem(id);
    } else {
        item.completed = true;
        saveData();
        renderItems();
        showToast("Contact moved to Archive.");
        renderSidebar(); 
    }
}

function openQuickLog(contactId) {
    tempParentId = contactId;
    editingId = null;
    
    document.getElementById('itemForm').reset();
    
    const contact = items.find(i => i.id === contactId);
    
    const typeSelect = document.getElementById('itemType');
    typeSelect.innerHTML = `<option value="history">History</option>`;
    typeSelect.value = 'history';

    document.getElementById('modalTitle').textContent = "Quick Log: " + contact.title;
    
    document.getElementById('modalDateGroup').style.display = 'block';
    document.getElementById('historyTypeGroup').style.display = 'block';
    document.getElementById('titleGroup').style.display = 'block';
    
    document.getElementById('itemTitle').placeholder = "Summary (Optional)";
    document.getElementById('itemTitle').required = false; 
    
    document.getElementById('itemDate').valueAsDate = new Date();
    
    document.getElementById('itemModal').classList.add('active');
    setTimeout(() => document.getElementById('itemTitle').focus(), 100);
}

// --- NAVIGATION FUNCTIONS ---
function enterContactView(id) {
    currentContactId = id;
    tempParentId = null; 
    selectedTags.clear();
    
    const contact = items.find(i => i.id === id);
    if (contact) {
        document.getElementById('appTitle').innerText = contact.title;
        if(!contact.customCategories) {
            contact.customCategories = JSON.parse(JSON.stringify(defaultDetailCategories));
            saveData();
        }
    }

    document.getElementById('sidebarNav').style.display = 'block';
    document.getElementById('btnNewCategory').textContent = "+ New Section";
    document.getElementById('modalTitle').textContent = "New Detail";
    document.getElementById('titleLabel').textContent = "Detail Title";
    document.getElementById('typeLabel').textContent = "Section";
    renderSidebar();
    renderTags(); 
    renderItems();
}

function exitContactView() {
    currentContactId = null;
    tempParentId = null;
    selectedTags.clear();
    document.getElementById('appTitle').innerText = 'orbit.';
    document.getElementById('sidebarNav').style.display = 'none';
    document.getElementById('btnNewCategory').textContent = "+ New Circle";
    document.getElementById('modalTitle').textContent = "New Contact";
    document.getElementById('titleLabel').textContent = "Contact Name";
    document.getElementById('typeLabel').textContent = "Circle";
    renderSidebar();
    renderTags(); 
    renderItems();
}

// --- SIDEBAR ---
function renderSidebar() {
    const container = document.getElementById('dynamicCategories');
    const activeList = getActiveCategoryList();

    container.innerHTML = activeList.map(cat => `
        <div class="category-row" draggable="true" data-cat-id="${cat.id}">
            <i class="fas fa-grip-vertical cat-handle"></i>
            <span class="category-name ${selectedTags.has(cat.id) ? 'active' : ''}" onclick="toggleCategoryFilter('${cat.id}')">
                ${cat.name} 
                <span class="cat-count">(${getCategoryCount(cat.id)})</span>
            </span>
            <div class="cat-actions">
                ${(cat.id === 'events' || cat.id === 'connections' || cat.id === 'history') ? '' : `
                <button class="cat-btn-mini" onclick="renameCategory('${cat.id}')"><i class="fas fa-pen"></i></button>
                <button class="cat-btn-mini delete" onclick="deleteCategory('${cat.id}')"><i class="fas fa-trash"></i></button>
                `}
                <button class="cat-btn-mini add" onclick="openNewItem('${cat.id}')"><i class="fas fa-plus"></i></button>
            </div>
        </div>
    `).join('');
    
    updateSidebarStyles();

    container.querySelectorAll('.category-row').forEach(row => {
        row.addEventListener('mousedown', (e) => { if(e.target.classList.contains('cat-handle')) row.setAttribute('draggable', 'true'); else row.setAttribute('draggable', 'false'); });
        row.addEventListener('dragstart', () => { setTimeout(() => row.classList.add('dragging-cat'), 0); });
        row.addEventListener('dragend', () => { row.classList.remove('dragging-cat'); updateCategoryOrder(); });
        const handle = row.querySelector('.cat-handle');
        handle.addEventListener('touchstart', (e) => handleTouchStart(e, row, 'category', container), {passive: false});
    });
}

function getCategoryCount(catId) {
    return items.filter(i => {
        if (currentContactId) {
            return i.parentId === currentContactId && i.type === catId && !i.completed;
        } else {
            return !i.parentId && i.type === catId && !i.completed;
        }
    }).length;
}

// --- AUTO SCROLL & DRAG ---
let scrollVelocity = 0; let scrollFrame = null;
function updateAutoScroll(y) {
    const threshold = 100; const maxSpeed = 15; const h = window.innerHeight;
    if (y < threshold) scrollVelocity = -maxSpeed * ((threshold - y) / threshold);
    else if (y > h - threshold) scrollVelocity = maxSpeed * ((y - (h - threshold)) / threshold);
    else scrollVelocity = 0;
    if (scrollVelocity !== 0 && !scrollFrame) scrollFrame = requestAnimationFrame(performAutoScroll);
    else if (scrollVelocity === 0 && scrollFrame) { cancelAnimationFrame(scrollFrame); scrollFrame = null; }
}
function performAutoScroll() {
    if (scrollVelocity === 0) { scrollFrame = null; return; }
    window.scrollBy(0, scrollVelocity); scrollFrame = requestAnimationFrame(performAutoScroll);
}
function stopAutoScroll() { scrollVelocity = 0; if (scrollFrame) { cancelAnimationFrame(scrollFrame); scrollFrame = null; } }

const catContainer = document.getElementById('dynamicCategories');
if(catContainer) {
    catContainer.addEventListener('dragover', (e) => handleVerticalDrag(e, catContainer, '.dragging-cat', '.category-row:not(.dragging-cat)'));
    catContainer.addEventListener('drop', (e) => { e.preventDefault(); updateCategoryOrder(); });
}

const grid = document.getElementById('itemsGrid');
if(grid) {
    grid.addEventListener('dragover', (e) => {
        if(sortBy !== 'manual' || searchQuery) return;
        e.preventDefault(); updateAutoScroll(e.clientY);
        const draggingItem = grid.querySelector('.dragging'); if (!draggingItem) return;
        const after = getDragAfterElement(grid, e.clientX, e.clientY);
        if (after == null) grid.appendChild(draggingItem); else grid.insertBefore(draggingItem, after);
    });
    grid.addEventListener('drop', (e) => { if(sortBy !== 'manual' || searchQuery) return; e.preventDefault(); updateItemOrder(); stopAutoScroll(); });
}

window.addEventListener('dragover', (e) => { if(document.querySelector('.dragging')) { e.preventDefault(); updateAutoScroll(e.clientY); } });
window.addEventListener('dragend', stopAutoScroll);

let touchDragItem = null; let touchClone = null; let touchOffsetX = 0; let touchOffsetY = 0; let longPressTimer = null;
function addLongPressDrag(card) {
    card.addEventListener('touchstart', (e) => {
        if(e.target.tagName === 'BUTTON' || e.target.tagName === 'I' || e.target.tagName === 'INPUT') return;
        longPressTimer = setTimeout(() => { navigator.vibrate?.(50); handleTouchStart(e, card, 'card', grid); }, 500);
    }, {passive: true});
    card.addEventListener('touchend', () => clearTimeout(longPressTimer));
    card.addEventListener('touchmove', () => clearTimeout(longPressTimer));
}
function handleTouchStart(e, item, type, container) {
    if(e.cancelable) e.preventDefault();
    touchDragItem = item;
    const touch = e.touches[0];
    const rect = item.getBoundingClientRect();
    touchOffsetX = touch.clientX - rect.left;
    touchOffsetY = touch.clientY - rect.top;
    touchClone = item.cloneNode(true);
    touchClone.classList.add('dragging-clone');
    touchClone.style.left = `${rect.left}px`;
    touchClone.style.top = `${rect.top}px`;
    touchClone.style.width = `${rect.width}px`;
    document.body.appendChild(touchClone);
    item.style.opacity = '0.3';
    const moveHandler = (ev) => handleTouchMove(ev, container, type);
    const endHandler = (ev) => handleTouchEnd(ev, item, moveHandler, endHandler, type);
    document.addEventListener('touchmove', moveHandler, {passive: false});
    document.addEventListener('touchend', endHandler);
}
function handleTouchMove(e, container, type) {
    e.preventDefault(); if(!touchClone) return;
    const touch = e.touches[0]; updateAutoScroll(touch.clientY);
    touchClone.style.left = `${touch.clientX - touchOffsetX}px`;
    touchClone.style.top = `${touch.clientY - touchOffsetY}px`;
    if (type === 'card') {
        const after = getDragAfterElement(container, touch.clientX, touch.clientY);
        if (after == null) container.appendChild(touchDragItem); else container.insertBefore(touchDragItem, after);
    } else {
        const after = getVerticalDragAfterElement(container, touch.clientY, '.category-row:not(.dragging-clone)');
        if (after == null) container.appendChild(touchDragItem); else container.insertBefore(touchDragItem, after);
    }
}
function handleTouchEnd(e, item, moveHandler, endHandler, type) {
    stopAutoScroll();
    document.removeEventListener('touchmove', moveHandler); document.removeEventListener('touchend', endHandler);
    if(touchClone) touchClone.remove(); touchClone = null; item.style.opacity = '1';
    if(type === 'card') updateItemOrder(); else updateCategoryOrder();
}
function handleVerticalDrag(e, container, dragClass, staticClass) {
    e.preventDefault(); const dragging = container.querySelector(dragClass); if (!dragging) return;
    const afterElement = getVerticalDragAfterElement(container, e.clientY, staticClass);
    if (afterElement == null) container.appendChild(dragging); else container.insertBefore(dragging, afterElement);
}
function getVerticalDragAfterElement(container, y, selector) {
    const draggableElements = [...container.querySelectorAll(selector)];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child }; else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}
function getDragAfterElement(container, x, y) {
    const els = [...container.querySelectorAll('.item-card:not(.dragging)')].filter(e => e !== touchDragItem);
    return els.reduce((closest, child) => {
        const box = child.getBoundingClientRect(); const offset = Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2));
        if (offset < closest.distance) return { distance: offset, element: child }; else return closest;
    }, { distance: Number.POSITIVE_INFINITY }).element;
}

// --- ORDER UPDATES ---
function updateCategoryOrder() {
    const activeList = getActiveCategoryList();
    const newOrderIds = [...catContainer.querySelectorAll('.category-row')].map(el => el.dataset.catId);
    
    const newCategories = [];
    newOrderIds.forEach(id => {
        const cat = activeList.find(c => c.id === id);
        if (cat) newCategories.push(cat);
    });

    if (currentContactId) {
        const contact = items.find(i => i.id === currentContactId);
        if(contact) contact.customCategories = newCategories;
    } else {
        categories = newCategories;
    }
    saveData();
}

function updateItemOrder() {
    const newOrderIds = [...grid.querySelectorAll('.item-card')].map(el => parseInt(el.dataset.id));
    let indices = [];
    items.forEach((item, index) => { if (newOrderIds.includes(item.id)) indices.push(index); });
    indices.sort((a,b) => a-b);
    let newItems = [...items];
    for(let i=0; i<indices.length; i++) {
        const targetId = newOrderIds[i];
        const item = items.find(it => it.id === targetId);
        newItems[indices[i]] = item;
    }
    items = newItems;
    saveData();
}

// --- MARKDOWN & HELPERS ---
function parseMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<u>$1</u>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function toggleSort() {
    if (sortBy === 'manual') { 
        sortBy = 'upcoming'; 
        document.getElementById('sortLabel').textContent = 'Upcoming'; 
    } else if (sortBy === 'upcoming') {
        sortBy = 'drift';
        document.getElementById('sortLabel').textContent = 'Needs Contact';
    } else { 
        sortBy = 'manual'; 
        document.getElementById('sortLabel').textContent = 'Manual'; 
    }
    renderItems();
}

function showToast(message, onUndo) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div'); toast.className = 'toast';
    let html = `<span>${message}</span>`;
    if (onUndo) html += `<button class="toast-undo">Undo</button>`;
    toast.innerHTML = html;
    if (onUndo) toast.querySelector('.toast-undo').onclick = () => { onUndo(); toast.remove(); };
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
}

// --- CRUD & LOGIC ---
function handleTypeChange() {
    const type = document.getElementById('itemType').value;
    const dateGroup = document.getElementById('modalDateGroup');
    const connectionGroup = document.getElementById('modalConnectionGroup');
    const historyGroup = document.getElementById('historyTypeGroup');
    const catchUpGroup = document.getElementById('catchUpGroup');
    const titleGroup = document.getElementById('titleGroup');
    const descLabel = document.getElementById('descLabel');
    const recurringOption = document.getElementById('recurringOption');

    dateGroup.style.display = 'none';
    connectionGroup.style.display = 'none';
    historyGroup.style.display = 'none';
    catchUpGroup.style.display = 'none';
    titleGroup.style.display = 'block';
    recurringOption.style.display = 'none';
    document.getElementById('itemTitle').required = true;
    descLabel.textContent = "Description";

    if (!currentContactId && !tempParentId) {
        // Main Menu (New Contact)
        catchUpGroup.style.display = 'block';
    } 
    else {
        // Detail View (or Quick Log)
        if (type === 'events') {
            dateGroup.style.display = 'block';
            recurringOption.style.display = 'flex';
        } 
        else if (type === 'history') {
            dateGroup.style.display = 'block'; 
            historyGroup.style.display = 'block'; 
            if(!document.getElementById('itemDate').value) {
                document.getElementById('itemDate').valueAsDate = new Date();
            }
            // Title is optional for history
            document.getElementById('itemTitle').required = false; 
            document.getElementById('itemTitle').placeholder = "Summary (Optional)";
        }
        else if (type === 'connections') {
            connectionGroup.style.display = 'block';
            titleGroup.style.display = 'none';
            document.getElementById('itemTitle').required = false; 
            descLabel.textContent = "Relationship (e.g., Brother, Colleague)";
            populateContactSelect();
        }
    }
}

function populateContactSelect() {
    const select = document.getElementById('connectionSelect');
    // Exclude current contact or temp parent from list to prevent self-linking
    const excludeId = currentContactId || tempParentId;
    const contacts = items.filter(i => !i.parentId && i.id !== excludeId);
    select.innerHTML = contacts.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
}

function openNewItem(preselectedType) {
    editingId = null;
    tempParentId = null;
    document.getElementById('itemForm').reset();
    populateCategorySelect();
    if (preselectedType) document.getElementById('itemType').value = preselectedType;
    
    const title = currentContactId ? "New Detail" : "New Contact";
    document.getElementById('modalTitle').textContent = title;

    handleTypeChange();
    
    document.getElementById('itemModal').classList.add('active');
    
    if (!currentContactId || document.getElementById('itemType').value !== 'connections') {
        setTimeout(() => document.getElementById('itemTitle').focus(), 100);
    }
}

function editItem(id) {
    const item = items.find(i => i.id === id);
    if (item) {
        editingId = id; populateCategorySelect();
        
        document.getElementById('itemType').value = item.type;
        // Check if editing a connection, show select box correctly
        if (item.type === 'connections') {
            // Need to populate select before setting value
            populateContactSelect(); // This will work if we are in Detail View (currentContactId set)
        }

        handleTypeChange(); 

        if (item.type === 'connections') {
            document.getElementById('connectionSelect').value = item.targetId;
        } else {
            document.getElementById('itemTitle').value = item.title;
        }

        document.getElementById('itemDate').value = item.dueDate || '';
        document.getElementById('itemTime').value = item.dueTime || '';
        document.getElementById('itemDescription').value = item.description;
        
        if (item.catchUpFreq) document.getElementById('itemCatchUp').value = item.catchUpFreq;
        if (item.interactionType) document.getElementById('itemInteractionType').value = item.interactionType;
        
        const chk = document.getElementById('itemRecurring');
        if(chk) chk.checked = !!item.recurring;
        
        document.getElementById('modalTitle').textContent = currentContactId ? 'Edit Detail' : 'Edit Contact';
        document.getElementById('itemModal').classList.add('active');
    }
}

function deleteItem(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    const deletedItem = items[idx];
    
    const childrenIdx = items.reduce((acc, it, index) => {
        if(it.parentId === id) acc.push(index);
        return acc;
    }, []);
    
    if(childrenIdx.length > 0 && !confirm(`Deleting this contact will also hide ${childrenIdx.length} details. Proceed?`)) {
        return;
    }

    items.splice(idx, 1);
    saveData();
    renderItems();
    showToast("Item deleted.", () => { items.splice(idx, 0, deletedItem); saveData(); renderItems(); renderSidebar(); });
    renderSidebar(); // Update counts
}

function clearDateTime() {
    const dateInput = document.getElementById('itemDate');
    const timeInput = document.getElementById('itemTime');
    const recurInput = document.getElementById('itemRecurring');
    dateInput.value = '';
    timeInput.value = '';
    if(recurInput) recurInput.checked = false;
    dateInput.setCustomValidity('');
    timeInput.setCustomValidity('');
    dateInput.removeAttribute('required');
    timeInput.removeAttribute('required');
}

function closeModal() { document.getElementById('itemModal').classList.remove('active'); setTimeout(() => { document.getElementById('itemForm').reset(); editingId = null; tempParentId = null; }, 200); }

document.getElementById('itemForm').onsubmit = (e) => {
    e.preventDefault();
    const type = document.getElementById('itemType').value;
    const isRecurring = document.getElementById('itemRecurring') ? document.getElementById('itemRecurring').checked : false;
    
    let titleVal = document.getElementById('itemTitle').value;
    let targetIdVal = null;

    // Resolve Context
    const effectiveParentId = currentContactId || tempParentId || null;

    if (type === 'connections' && effectiveParentId) {
        targetIdVal = document.getElementById('connectionSelect').value;
        const target = items.find(i => i.id == targetIdVal);
        titleVal = target ? target.title : "Linked Contact";
    }

    // Default History Title logic
    if (!titleVal && type === 'history') {
         const typeSelect = document.getElementById('itemInteractionType');
         if(typeSelect.selectedIndex > -1) {
             titleVal = typeSelect.options[typeSelect.selectedIndex].text;
         } else {
             titleVal = "Interaction";
         }
    }

    const catchUpFreq = (!effectiveParentId) ? document.getElementById('itemCatchUp').value : null;
    const interactionType = (effectiveParentId && type === 'history') ? document.getElementById('itemInteractionType').value : null;

    const item = {
        id: editingId || Date.now(),
        parentId: effectiveParentId, 
        title: titleVal,
        targetId: targetIdVal, 
        type: type,
        dueDate: document.getElementById('itemDate').value,
        dueTime: document.getElementById('itemTime').value,
        recurring: (type === 'events' && isRecurring), 
        description: document.getElementById('itemDescription').value,
        
        catchUpFreq: catchUpFreq, 
        interactionType: interactionType, 
        
        completed: editingId ? items.find(i => i.id === editingId).completed : false,
        notified: editingId ? items.find(i => i.id === editingId).notified : false,
        createdAt: Date.now()
    };
    
    if (editingId) {
        const oldItem = items.find(i => i.id === editingId);
        if (item.catchUpFreq === null && oldItem.catchUpFreq) item.catchUpFreq = oldItem.catchUpFreq;
    }

    if (editingId) items[items.findIndex(i => i.id === editingId)] = item; else items.push(item);
    saveData(); closeModal(); renderItems(); renderSidebar();
};

function toggleItemStatus(id) { const item = items.find(i => i.id === id); item.completed = !item.completed; saveData(); renderItems(); if(item.completed) showToast("Item archived."); renderSidebar(); }

// --- CATEGORY MANAGEMENT ---
function addNewCategory() { 
    const promptTitle = currentContactId ? "New Section Name:" : "New Circle Name:";
    const name = prompt(promptTitle); 
    if(name) { 
        const activeList = getActiveCategoryList();
        activeList.push({id: 'cat_'+Date.now(), name: name.trim()}); 
        if(currentContactId) {
            const contact = items.find(i => i.id === currentContactId);
            if(contact) contact.customCategories = activeList;
        } 
        saveData(); 
        renderSidebar(); 
    } 
}

function deleteCategory(id) { 
    if(id === 'events' || id === 'connections' || id === 'history') { alert("This category is a core system circle and cannot be deleted."); return; }
    if(confirm("Delete this category?")) { 
        let activeList = getActiveCategoryList();
        activeList = activeList.filter(c => c.id !== id);
        if(currentContactId) {
            const contact = items.find(i => i.id === currentContactId);
            if(contact) contact.customCategories = activeList;
        } else {
            categories = activeList;
        }
        selectedTags.delete(id);
        saveData(); renderSidebar(); renderItems(); 
    } 
}

function renameCategory(id) { 
    const activeList = getActiveCategoryList();
    const cat = activeList.find(c => c.id === id); 
    const name = prompt("New Name:", cat.name); 
    if(name) { 
        cat.name = name.trim(); 
        if(currentContactId) {
            const contact = items.find(i => i.id === currentContactId);
            if(contact) contact.customCategories = activeList;
        }
        saveData(); renderSidebar(); 
    } 
}

function populateCategorySelect() { 
    const activeList = getActiveCategoryList();
    document.getElementById('itemType').innerHTML = activeList.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join(''); 
}

function getCategoryName(id) { 
    let cat = categories.find(c => c.id === id);
    if(cat) return cat.name;
    cat = defaultDetailCategories.find(c => c.id === id);
    if(cat) return cat.name;
    for (const item of items) {
        if (item.customCategories) {
            cat = item.customCategories.find(c => c.id === id);
            if(cat) return cat.name;
        }
    }
    return 'Unknown'; 
}

// --- SETTINGS & THEMES ---
function openSettings() { document.getElementById('settingsModal').classList.add('active'); }
function closeSettings() { document.getElementById('settingsModal').classList.remove('active'); }
function switchSettingsTab(tabId) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.target.classList.add('active');
}
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const icon = document.getElementById('themeBtn').querySelector('i');
    if(['dark', 'dark-green', 'dark-purple', 'dark-blue', 'dark-red', 'dark-cafe', 'ranny'].includes(theme)) icon.classList.replace('fa-moon', 'fa-sun');
    else icon.classList.replace('fa-sun', 'fa-moon');
}
function toggleTheme() {
    const current = localStorage.getItem('theme') || 'light';
    let nextTheme = 'light';
    const themePairs = {
        'light': 'dark', 'dark': 'light',
        'light-green': 'dark-green', 'dark-green': 'light-green',
        'light-purple': 'dark-purple', 'dark-purple': 'light-purple',
        'light-blue': 'dark-blue', 'dark-blue': 'light-blue',
        'pink': 'dark-red', 'dark-red': 'pink',
        'light-cafe': 'dark-cafe', 'dark-cafe': 'light-cafe', 
        'ranny': 'ranny-red',
        'ranny-red': 'ranny-orange',
        'ranny-orange': 'ranny-yellow',
        'ranny-yellow': 'ranny-mint',
        'ranny-mint': 'ranny-green',
        'ranny-green': 'ranny-cyan',
        'ranny-cyan': 'ranny-blue',
        'ranny-blue': 'ranny-purple',
        'ranny-purple': 'ranny'
    };
    if (themePairs[current]) nextTheme = themePairs[current];
    else nextTheme = current.includes('dark') ? 'light' : 'dark';
    setTheme(nextTheme);
}
function triggerImport() { document.getElementById('importFile').click(); }
function exportData() {
    const blob = new Blob([JSON.stringify({ items, categories, version: 6 }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'foothold-contacts-data.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function importData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.items && data.categories && confirm('Overwrite current data?')) { 
                items = data.items; 
                categories = data.categories; 
                saveData(); location.reload(); 
            }
        } catch (error) { alert('Error parsing file.'); }
        input.value = '';
    };
    reader.readAsText(file);
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) setTheme(savedTheme);

renderSidebar();
renderItems();