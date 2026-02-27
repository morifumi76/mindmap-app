const { chromium } = require('playwright');

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { pass++; console.log('  ✅ ' + msg); }
    else { fail++; console.log('  ❌ FAIL: ' + msg); }
}

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });

    // ========================================
    // Test 1: Initial state & Migration
    // ========================================
    console.log('\n=== Test 1: Initial State & Fresh Start ===');
    let page = await ctx.newPage();
    await page.goto('http://localhost:8080/index.html');
    await page.waitForTimeout(1500);

    // Left sidebar should be open by default (240px on fresh start)
    let leftSidebar = page.locator('#leftSidebar');
    let isCollapsed = await leftSidebar.evaluate(el => el.classList.contains('collapsed'));
    assert(!isCollapsed, 'Left sidebar opens by default on fresh start');

    // Should have header
    let header = await page.locator('.left-sidebar-header').textContent();
    assert(header.includes('マイマップ'), 'Header shows マイマップ');

    // Should have new button
    let newBtn = page.locator('#newMapBtn');
    assert(await newBtn.isVisible(), 'New map button is visible');

    // Should have at least 1 map item
    let mapItems = await page.locator('.map-item').count();
    assert(mapItems >= 1, 'At least 1 map exists (' + mapItems + ')');

    // First map should be active
    let activeItems = await page.locator('.map-item.active').count();
    assert(activeItems === 1, 'Exactly 1 active map');

    // ========================================
    // Test 2: Create New Map (top-level)
    // ========================================
    console.log('\n=== Test 2: Create New Map (Top-Level) ===');
    await newBtn.click();
    await page.waitForTimeout(500);

    mapItems = await page.locator('.map-item').count();
    assert(mapItems === 2, 'Now 2 maps exist after creating new');

    // The new map should be active (we switched to it)
    activeItems = await page.locator('.map-item.active').count();
    assert(activeItems === 1, 'Still exactly 1 active map');

    // URL should have ?id= parameter
    let url = page.url();
    assert(url.includes('?id='), 'URL has ?id= parameter');

    // Check localStorage meta
    let meta = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('mindmap-meta')); } catch(e) { return null; }
    });
    assert(meta && meta.length === 2, 'Meta list has 2 entries');

    // Check parentId and order fields exist
    assert(meta[0].parentId === null, 'First map has parentId: null');
    assert(meta[0].order !== undefined, 'First map has order field');
    assert(meta[1].parentId === null, 'Second map has parentId: null');

    // Check id counter incremented
    let idCounter = await page.evaluate(() => localStorage.getItem('mindmap-id-counter'));
    assert(parseInt(idCounter) >= 2, 'ID counter is >= 2');

    // Check last active ID
    let lastActiveId = await page.evaluate(() => localStorage.getItem('mindmap-last-active-id'));
    assert(lastActiveId !== null, 'Last active ID is saved');

    // ========================================
    // Test 3: Two-level tree UI – folder icons & structure
    // ========================================
    console.log('\n=== Test 3: Two-Level Tree UI ===');

    // Active map should have 📌 icon, non-active should have no icon
    let allIcons = await page.evaluate(() => {
        var icons = [];
        document.querySelectorAll('.map-item').forEach(el => {
            icons.push({
                icon: el.querySelector('.map-item-icon').textContent,
                active: el.classList.contains('active')
            });
        });
        return icons;
    });
    let nonActiveNoIcon = allIcons.filter(i => !i.active).every(i => i.icon === '');
    let hasPin = allIcons.some(i => i.active && i.icon === '📌');
    assert(nonActiveNoIcon || allIcons.length === 1, 'Non-active maps have no icon');
    assert(hasPin, 'Active map shows pin icon 📌');

    // ========================================
    // Test 4: Switch Map
    // ========================================
    console.log('\n=== Test 4: Switch Between Maps ===');

    let currentId = await page.evaluate(() => window.getCurrentMapId());

    // Click on the first (non-active) map item
    let firstMapItem = page.locator('.map-item').first();
    let firstMapId = await firstMapItem.getAttribute('data-map-id');

    if (firstMapId != currentId) {
        await firstMapItem.click();
        await page.waitForTimeout(500);
    } else {
        let secondMapItem = page.locator('.map-item').nth(1);
        await secondMapItem.click();
        await page.waitForTimeout(500);
    }

    let newCurrentId = await page.evaluate(() => window.getCurrentMapId());
    assert(newCurrentId !== currentId, 'Switched to a different map');

    url = page.url();
    assert(url.includes('id=' + newCurrentId), 'URL updated to new map ID');

    let activeMapId = await page.locator('.map-item.active').getAttribute('data-map-id');
    assert(parseInt(activeMapId) === newCurrentId, 'Active map in list matches current');

    // ========================================
    // Test 5: Map data is isolated
    // ========================================
    console.log('\n=== Test 5: Map Data Isolation ===');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type('TestNode');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    let mapAData = await page.evaluate(() => window.getMindMapData());
    let mapAChildren = mapAData.root.children.length;

    let otherMapItem = page.locator('.map-item').first();
    let otherMapItemId = await otherMapItem.getAttribute('data-map-id');
    if (parseInt(otherMapItemId) === newCurrentId) {
        otherMapItem = page.locator('.map-item').nth(1);
    }
    await otherMapItem.click();
    await page.waitForTimeout(500);

    let mapBData = await page.evaluate(() => window.getMindMapData());
    assert(mapBData.root.children.length !== mapAChildren || mapAChildren === 0,
        'Maps have isolated data');

    // ========================================
    // Test 6: Context Menu - Duplicate
    // ========================================
    console.log('\n=== Test 6: Context Menu - Duplicate ===');

    let beforeCount = await page.locator('.map-item').count();

    let menuBtn = page.locator('.map-item-menu-btn').first();
    await menuBtn.click();
    await page.waitForTimeout(300);

    let ctxMenu = page.locator('#ctxMenu');
    let ctxMenuVisible = await ctxMenu.evaluate(el => el.classList.contains('show'));
    assert(ctxMenuVisible, 'Context menu appears');

    await page.click('[data-action="duplicate"]');
    await page.waitForTimeout(500);

    let afterCount = await page.locator('.map-item').count();
    assert(afterCount === beforeCount + 1, 'Duplicate created new map (' + beforeCount + ' -> ' + afterCount + ')');

    let allMapNames = await page.evaluate(() => {
        var names = [];
        document.querySelectorAll('.map-item-name').forEach(el => names.push(el.textContent));
        return names;
    });
    let hasCopy = allMapNames.some(n => n.includes('のコピー'));
    assert(hasCopy, 'Duplicate map name includes "のコピー"');

    // ========================================
    // Test 7: Context Menu - Rename (uses input element)
    // ========================================
    console.log('\n=== Test 7: Context Menu - Rename ===');

    menuBtn = page.locator('.map-item-menu-btn').first();
    await menuBtn.click();
    await page.waitForTimeout(300);

    await page.click('[data-action="rename"]');
    await page.waitForTimeout(300);

    // The rename input should appear
    let renameInput = page.locator('.map-item-rename-input');
    let renameInputCount = await renameInput.count();
    assert(renameInputCount >= 1, 'Rename input field appears');

    // Type new name
    await renameInput.first().fill('My Renamed Map');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    allMapNames = await page.evaluate(() => {
        var names = [];
        document.querySelectorAll('.map-item-name').forEach(el => names.push(el.textContent));
        return names;
    });
    let hasRenamed = allMapNames.some(n => n === 'My Renamed Map');
    assert(hasRenamed, 'Map renamed successfully');

    meta = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('mindmap-meta')); } catch(e) { return null; }
    });
    let renamedMeta = meta.find(m => m.name === 'My Renamed Map');
    assert(renamedMeta !== undefined, 'Renamed map persisted in localStorage meta');

    // ========================================
    // Test 8: Double-click to rename
    // ========================================
    console.log('\n=== Test 8: Double-Click Rename ===');

    let nameEl = page.locator('.map-item-name').first();
    await nameEl.dblclick();
    await page.waitForTimeout(300);

    renameInput = page.locator('.map-item-rename-input');
    renameInputCount = await renameInput.count();
    assert(renameInputCount >= 1, 'Double-click opens rename input');

    // Press Escape to cancel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    renameInputCount = await page.locator('.map-item-rename-input').count();
    assert(renameInputCount === 0, 'Escape cancels rename');

    // ========================================
    // Test 9: Context Menu - Delete
    // ========================================
    console.log('\n=== Test 9: Context Menu - Delete ===');

    beforeCount = await page.locator('.map-item').count();

    page.on('dialog', async dialog => {
        await dialog.accept();
    });

    menuBtn = page.locator('.map-item-menu-btn').last();
    await menuBtn.click();
    await page.waitForTimeout(300);

    await page.click('[data-action="delete"]');
    await page.waitForTimeout(500);

    afterCount = await page.locator('.map-item').count();
    assert(afterCount === beforeCount - 1, 'Map deleted (' + beforeCount + ' -> ' + afterCount + ')');

    // ========================================
    // Test 10: Cannot delete last map
    // ========================================
    console.log('\n=== Test 10: Cannot Delete Last Map ===');

    while (true) {
        let cnt = await page.locator('.map-item').count();
        if (cnt <= 1) break;
        let mb = page.locator('.map-item-menu-btn').last();
        await mb.click();
        await page.waitForTimeout(200);
        await page.click('[data-action="delete"]');
        await page.waitForTimeout(500);
    }

    let finalCount = await page.locator('.map-item').count();
    assert(finalCount === 1, 'Cannot delete the last map, 1 remains');

    // ========================================
    // Test 11: Persistence across page reload
    // ========================================
    console.log('\n=== Test 11: Persistence Across Reload ===');

    let savedCurrentId = await page.evaluate(() => window.getCurrentMapId());

    await page.reload();
    await page.waitForTimeout(1500);

    let lsCollapsedAfterReload = await page.locator('#leftSidebar').evaluate(el => el.classList.contains('collapsed'));
    if (lsCollapsedAfterReload) {
        await page.click('#leftSidebarFloatToggle');
        await page.waitForTimeout(300);
    }

    let reloadedId = await page.evaluate(() => window.getCurrentMapId());
    assert(reloadedId === savedCurrentId, 'Same map loaded after reload (last active)');

    // ========================================
    // Test 12: URL ?id= parameter loading
    // ========================================
    console.log('\n=== Test 12: URL ?id= Parameter ===');

    let lsCollapsed10 = await page.locator('#leftSidebar').evaluate(el => el.classList.contains('collapsed'));
    if (lsCollapsed10) {
        await page.click('#leftSidebarFloatToggle');
        await page.waitForTimeout(300);
    }

    await page.click('#newMapBtn');
    await page.waitForTimeout(500);
    let newMapId = await page.evaluate(() => window.getCurrentMapId());

    await page.goto('http://localhost:8080/index.html?id=' + savedCurrentId);
    await page.waitForTimeout(1500);

    let loadedId = await page.evaluate(() => window.getCurrentMapId());
    assert(loadedId === savedCurrentId, 'Loads specific map from ?id= param');

    // ========================================
    // Test 13: Sort toggle – default is manual (none)
    // ========================================
    console.log('\n=== Test 13: Sort Toggle ===');

    let lsCollapsed13 = await page.locator('#leftSidebar').evaluate(el => el.classList.contains('collapsed'));
    if (lsCollapsed13) {
        await page.click('#leftSidebarFloatToggle');
        await page.waitForTimeout(300);
    }

    // Sort toggle should exist
    let sortToggle = page.locator('#sortToggleInput');
    assert(await sortToggle.count() === 1, 'Sort toggle exists');

    // Default sort mode should be 'none'
    let sortMode = await page.evaluate(() => window.getSortMode());
    assert(sortMode === 'none', 'Default sort mode is "none" (manual)');

    // Sort toggle should be OFF by default
    let sortChecked = await page.evaluate(() => document.getElementById('sortToggleInput').checked);
    assert(!sortChecked, 'Sort toggle is OFF by default');

    // Turn on sort via JavaScript (checkbox is hidden behind iOS toggle)
    await page.evaluate(() => {
        var input = document.getElementById('sortToggleInput');
        input.checked = true;
        input.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    sortMode = await page.evaluate(() => window.getSortMode());
    assert(sortMode === 'alpha', 'Sort mode changed to "alpha"');

    // Verify sort is persisted in localStorage
    let storedSortMode = await page.evaluate(() => localStorage.getItem('mindmap-sort-mode'));
    assert(storedSortMode === 'alpha', 'Sort mode persisted in localStorage');

    // Turn off sort
    await page.evaluate(() => {
        var input = document.getElementById('sortToggleInput');
        input.checked = false;
        input.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    sortMode = await page.evaluate(() => window.getSortMode());
    assert(sortMode === 'none', 'Sort mode reverted to "none"');

    // ========================================
    // Test 14: Child map creation (子マップを追加)
    // ========================================
    console.log('\n=== Test 14: Child Map Creation ===');

    // We should have 2 top-level maps now. Create a child map.
    let topLevelItems = await page.locator('.map-item:not(.child-item)').count();
    assert(topLevelItems >= 1, 'At least 1 top-level map exists');

    // Open context menu on first top-level item
    menuBtn = page.locator('.map-item:not(.child-item) .map-item-menu-btn').first();
    await menuBtn.click();
    await page.waitForTimeout(300);

    // "子マップを追加" should be visible
    let addChildBtn = page.locator('[data-action="add-child-map"]');
    let addChildVisible = await addChildBtn.isVisible();
    assert(addChildVisible, '子マップを追加 menu item is visible');

    await addChildBtn.click();
    await page.waitForTimeout(800);

    // A child item should now exist
    let childItems = await page.locator('.map-item.child-item').count();
    assert(childItems >= 1, 'Child map created (child-item class present)');

    // Child should have 📌 (if active) or empty icon (no 📁/📄 icons)
    let childIcon = await page.locator('.map-item.child-item .map-item-icon').first().textContent();
    assert(childIcon === '📌' || childIcon === '', 'Child map has pin or no icon (no file/folder icons)');

    // The child's parentId should match the parent map ID
    meta = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('mindmap-meta')); } catch(e) { return null; }
    });
    let childMeta = meta.find(m => m.parentId !== null);
    assert(childMeta !== undefined, 'Child map has parentId set');

    // ========================================
    // Test 15: Collapse/Expand parent
    // ========================================
    console.log('\n=== Test 15: Collapse/Expand ===');

    // Parent should have expand/collapse toggle (▼ when expanded)
    let parentToggle = page.locator('.map-item:not(.child-item) .map-item-toggle').first();
    let toggleCount = await parentToggle.count();
    // Only parents with children have visible toggle
    let parentWithChildrenToggle = await page.evaluate(() => {
        var toggles = document.querySelectorAll('.map-item:not(.child-item) .map-item-toggle');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].style.visibility !== 'hidden') return toggles[i].textContent;
        }
        return null;
    });
    assert(parentWithChildrenToggle === '▼', 'Parent with children shows ▼ (expanded)');

    // Click toggle to collapse
    let visibleToggle = await page.evaluate(() => {
        var toggles = document.querySelectorAll('.map-item:not(.child-item) .map-item-toggle');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].style.visibility !== 'hidden') { toggles[i].click(); return true; }
        }
        return false;
    });
    await page.waitForTimeout(300);

    // After collapse, child items should be hidden
    childItems = await page.locator('.map-item.child-item').count();
    assert(childItems === 0, 'Children hidden after collapse');

    // Toggle text should now be ►
    let collapsedToggleText = await page.evaluate(() => {
        var toggles = document.querySelectorAll('.map-item:not(.child-item) .map-item-toggle');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].style.visibility !== 'hidden') return toggles[i].textContent;
        }
        return null;
    });
    assert(collapsedToggleText === '►', 'Collapsed parent shows ►');

    // Collapse state should be persisted
    let collapseState = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('mindmap-collapse-state')); } catch(e) { return null; }
    });
    assert(collapseState !== null, 'Collapse state saved in localStorage');

    // Click toggle to expand again
    await page.evaluate(() => {
        var toggles = document.querySelectorAll('.map-item:not(.child-item) .map-item-toggle');
        for (var i = 0; i < toggles.length; i++) {
            if (toggles[i].style.visibility !== 'hidden') { toggles[i].click(); return; }
        }
    });
    await page.waitForTimeout(300);

    childItems = await page.locator('.map-item.child-item').count();
    assert(childItems >= 1, 'Children visible after expand');

    // ========================================
    // Test 16: Migration v4 flag
    // ========================================
    console.log('\n=== Test 16: Migration v4 ===');

    let migratedV4 = await page.evaluate(() => localStorage.getItem('mindmap-migrated-v4'));
    assert(migratedV4 === '1', 'mindmap-migrated-v4 flag is set');

    // All meta entries should have parentId and order
    meta = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('mindmap-meta')); } catch(e) { return null; }
    });
    let allHaveFields = meta.every(m => m.parentId !== undefined && m.order !== undefined);
    assert(allHaveFields, 'All meta entries have parentId and order fields');

    // ========================================
    // Test 17: Backspace doesn't trigger during rename
    // ========================================
    console.log('\n=== Test 17: Backspace During Rename ===');

    // Start renaming
    nameEl = page.locator('.map-item-name').first();
    await nameEl.dblclick();
    await page.waitForTimeout(300);

    renameInput = page.locator('.map-item-rename-input').first();
    await renameInput.fill('TestBackspace');
    await page.waitForTimeout(100);

    // Press Backspace – should NOT delete a mind map node
    let nodeCountBefore = await page.evaluate(() => window.getMindMapData().root.children.length);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
    let nodeCountAfter = await page.evaluate(() => window.getMindMapData().root.children.length);
    assert(nodeCountBefore === nodeCountAfter, 'Backspace in rename does NOT delete mind map nodes');

    // Finish rename
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // ========================================
    // Test 18: Node operations still work
    // ========================================
    console.log('\n=== Test 18: Node Operations Still Work ===');

    // Click on canvas to ensure focus is on the mind map, not the sidebar
    await page.click('#canvas');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Select root node first
    await page.evaluate(() => {
        // Find and click the root node
        var rootEl = document.querySelector('[data-id="root"]');
        if (rootEl) rootEl.click();
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); // Exit editing mode
    await page.waitForTimeout(200);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type('ChildNode');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    let data = await page.evaluate(() => window.getMindMapData());
    assert(data.root.children.length >= 1, 'Can add child nodes');

    let copyText = await page.evaluate(() => window.getCurrentCopyText());
    assert(copyText.includes('中心テーマ'), 'Copy text includes root text');
    assert(copyText.includes('ChildNode'), 'Copy text includes child node');

    // ========================================
    // Test 19: Keyboard shortcuts still work
    // ========================================
    console.log('\n=== Test 19: Keyboard Shortcuts ===');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    let selectedIds = await page.evaluate(() => {
        var ids = [];
        window.getSelectedNodeIds().forEach(id => ids.push(id));
        return ids;
    });
    assert(selectedIds.length === 1, 'Navigation with ArrowRight works');

    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    selectedIds = await page.evaluate(() => {
        var ids = [];
        window.getSelectedNodeIds().forEach(id => ids.push(id));
        return ids;
    });
    assert(selectedIds.includes('root'), 'Navigation with ArrowLeft works back to root');

    // ========================================
    // Test 20: Right sidebar still works
    // ========================================
    console.log('\n=== Test 20: Right Sidebar ===');

    let rightFloatToggle = page.locator('#sidebarFloatToggle');
    await rightFloatToggle.click();
    await page.waitForTimeout(300);

    let rightSidebar = page.locator('#sidebar');
    let rightCollapsed = await rightSidebar.evaluate(el => el.classList.contains('collapsed'));
    assert(!rightCollapsed, 'Right sidebar can be opened');

    let previewLines = await page.locator('.sidebar-preview-line').count();
    assert(previewLines >= 2, 'Right sidebar shows preview lines');

    // ========================================
    // Test 21: Auto-save when switching maps
    // ========================================
    console.log('\n=== Test 21: Auto-save on Switch ===');

    await page.evaluate(() => {
        var root = window.getMindMapData().root;
        root.children.push({ id: 'test_autosave_' + Date.now(), text: 'UniqueAutoSaveTest', children: [] });
        var mapId = window.getCurrentMapId();
        var data = window.getMindMapData();
        localStorage.setItem('mindmap-data-' + mapId, JSON.stringify(data));
    });
    await page.waitForTimeout(500);

    let beforeSwitchId = await page.evaluate(() => window.getCurrentMapId());

    let leftCollapsed = await page.locator('#leftSidebar').evaluate(el => el.classList.contains('collapsed'));
    if (leftCollapsed) {
        await page.click('#leftSidebarFloatToggle');
        await page.waitForTimeout(300);
    }

    await page.click('#newMapBtn');
    await page.waitForTimeout(500);

    let origMapItem = page.locator(`.map-item[data-map-id="${beforeSwitchId}"]`);
    await origMapItem.click();
    await page.waitForTimeout(500);

    data = await page.evaluate(() => window.getMindMapData());
    let hasUniqueNode = JSON.stringify(data).includes('UniqueAutoSaveTest');
    assert(hasUniqueNode, 'Data auto-saved when switching maps');

    // ========================================
    // Test 22: Left sidebar toggle persists width
    // ========================================
    console.log('\n=== Test 22: Left Sidebar Width Persistence ===');

    let savedWidth = await page.evaluate(() => localStorage.getItem('mindmap_left_sidebar_width'));
    assert(savedWidth !== null, 'Left sidebar width saved in localStorage');

    // ========================================
    // Test 23: Child map indentation
    // ========================================
    console.log('\n=== Test 23: Child Map Indentation ===');

    let childItemPadding = await page.evaluate(() => {
        var child = document.querySelector('.map-item.child-item');
        if (!child) return null;
        return window.getComputedStyle(child).paddingLeft;
    });
    assert(childItemPadding === '28px', 'Child items have 28px left padding for indentation');

    // ========================================
    // Test 24: 子マップを追加 hidden for child items
    // ========================================
    console.log('\n=== Test 24: 子マップを追加 Hidden for Children ===');

    // Open context menu on a child item
    let childMenuBtn = page.locator('.map-item.child-item .map-item-menu-btn').first();
    let childMenuCount = await childMenuBtn.count();
    if (childMenuCount > 0) {
        await childMenuBtn.click();
        await page.waitForTimeout(300);
        let addChildDisplay = await page.evaluate(() => {
            var item = document.querySelector('[data-action="add-child-map"]');
            return item ? window.getComputedStyle(item).display : 'none';
        });
        assert(addChildDisplay === 'none', '子マップを追加 hidden for child items in context menu');
        // Close menu
        await page.click('body');
        await page.waitForTimeout(200);
    } else {
        assert(true, 'No child items with menu to test (skipped)');
    }

    // ========================================
    // Test 25: Alphabetical sort order
    // ========================================
    console.log('\n=== Test 25: Alphabetical Sort Order ===');

    // Rename maps to test sorting
    await page.evaluate(() => {
        var meta = JSON.parse(localStorage.getItem('mindmap-meta'));
        var topLevel = meta.filter(m => m.parentId === null);
        if (topLevel.length >= 2) {
            topLevel[0].name = 'Zebra Map';
            topLevel[1].name = 'Apple Map';
        }
        localStorage.setItem('mindmap-meta', JSON.stringify(meta));
        window.renderMapList();
    });
    await page.waitForTimeout(300);

    // Turn on alphabetical sort
    await page.evaluate(() => {
        document.getElementById('sortToggleInput').checked = true;
        document.getElementById('sortToggleInput').dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    let sortedNames = await page.evaluate(() => {
        var names = [];
        document.querySelectorAll('.map-item:not(.child-item) .map-item-name').forEach(el => names.push(el.textContent));
        return names;
    });
    if (sortedNames.length >= 2) {
        assert(sortedNames[0].localeCompare(sortedNames[1]) <= 0, 'Maps sorted alphabetically when sort toggle is ON');
    } else {
        assert(true, 'Not enough maps to verify sort (skipped)');
    }

    // Turn off sort
    await page.evaluate(() => {
        document.getElementById('sortToggleInput').checked = false;
        document.getElementById('sortToggleInput').dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(300);

    // ========================================
    // Summary
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
    console.log('='.repeat(50));

    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
})().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
