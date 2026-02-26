const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('http://localhost:8080/index.html');
    await page.evaluate(() => { localStorage.clear(); });
    await page.reload();
    await page.waitForSelector('.node', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(800);

    let passed = 0;
    let failed = 0;
    function assert(condition, msg) {
        if (condition) { passed++; console.log('  ✅ ' + msg); }
        else { failed++; console.log('  ❌ FAIL: ' + msg); }
    }

    // Build test tree via evaluate using the new multi-map storage
    console.log('\n=== Building test tree ===');
    await page.evaluate(() => {
        // Get the current map ID
        var mapId = window.getCurrentMapId();
        var d = window.getMindMapData();
        d.root.text = '中心テーマ';
        d.root.children = [
            { id: 'pa', text: 'ParentA', children: [
                { id: 'ca1', text: 'ChildA1', children: [] },
                { id: 'ca2', text: 'ChildA2', children: [] }
            ]},
            { id: 'pb', text: 'ParentB', children: [
                { id: 'cb1', text: 'ChildB1', children: [] }
            ]}
        ];
        // Save using the new multi-map storage format
        localStorage.setItem('mindmap-data-' + mapId, JSON.stringify(d));
    });
    await page.reload();
    await page.waitForSelector('.node', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const data = await page.evaluate(() => {
        const d = window.getMindMapData();
        const all = [];
        function walk(n, dep) { all.push(n.text); for (const c of n.children) walk(c, dep+1); }
        walk(d.root, 0);
        return all;
    });
    console.log('Nodes:', data.join(', '));
    assert(data.length === 6, 'Built 6 nodes');

    // ========================================
    // Feature: Sidebar structure
    // ========================================
    console.log('\n=== Sidebar structure ===');
    assert(!!await page.$('#sidebar'), 'Sidebar exists');
    assert(!!await page.$('#sidebarToggle'), 'Toggle button exists');
    assert(!!await page.$('#copyBtn'), 'Copy button');
    assert(!!await page.$('#resetBtn'), 'Reset button');
    assert(!!await page.$('#copyFormat'), 'Format dropdown');
    assert(!!await page.$('#copyBorder'), 'Border dropdown');

    // ========================================
    // Open sidebar
    // ========================================
    console.log('\n=== Open sidebar ===');
    await page.click('#sidebarToggle');
    await page.waitForTimeout(300);
    const isOpen = await page.$eval('#sidebar', el => !el.classList.contains('collapsed'));
    assert(isOpen, 'Sidebar opens');

    // ========================================
    // Feature: Preview reflects format/border (default = simple + border)
    // ========================================
    console.log('\n=== Preview reflects settings ===');
    
    // Default: simple + border
    let previewText = await page.$eval('#sidebarTree', el => el.textContent);
    console.log('Default preview (first 100 chars):', previewText.substring(0, 100));
    assert(previewText.includes('├─') || previewText.includes('└─'), 'Default: border lines shown (├─ / └─)');
    assert(previewText.includes('中心テーマ'), 'Preview includes root text');
    assert(previewText.includes('ParentA'), 'Preview includes ParentA');
    assert(previewText.includes('ChildB1'), 'Preview includes ChildB1');
    assert(!previewText.includes('🐔'), 'Default: no emoji icons (simple mode)');

    // ========================================
    // Feature: Change to hiyoko mode -> preview updates
    // ========================================
    console.log('\n=== Change to hiyoko mode ===');
    await page.locator('#copyFormat').selectOption('hiyoko');
    await page.waitForTimeout(300);
    
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    console.log('Hiyoko preview (first 100 chars):', previewText.substring(0, 100));
    assert(previewText.includes('🐔'), 'Hiyoko mode: 🐔 icon for root level');
    assert(previewText.includes('🐤'), 'Hiyoko mode: 🐤 icon for level 2');
    assert(previewText.includes('🐣') || previewText.includes('🥚'), 'Hiyoko mode: 🐣/🥚 for deeper levels');

    // ========================================
    // Feature: Change to family mode -> preview updates
    // ========================================
    console.log('\n=== Change to family mode ===');
    await page.locator('#copyFormat').selectOption('family');
    await page.waitForTimeout(300);
    
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    console.log('Family preview (first 100 chars):', previewText.substring(0, 100));
    assert(previewText.includes('👴'), 'Family mode: 👴 icon for root level');
    assert(previewText.includes('👨'), 'Family mode: 👨 icon for level 2');

    // ========================================
    // Feature: Change border -> preview updates
    // ========================================
    console.log('\n=== Change border to none ===');
    await page.locator('#copyBorder').selectOption('none');
    await page.waitForTimeout(300);
    
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(!previewText.includes('├─') && !previewText.includes('└─') && !previewText.includes('│'), 
        'No border: no tree lines in preview');

    // Switch back to border
    await page.locator('#copyBorder').selectOption('border');
    await page.waitForTimeout(300);
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(previewText.includes('├─') || previewText.includes('└─'), 'Border restored: tree lines shown');

    // ========================================
    // Feature: Copy output matches preview
    // ========================================
    console.log('\n=== Copy output matches preview ===');
    await page.locator('#copyFormat').selectOption('hiyoko');
    await page.waitForTimeout(200);
    await page.locator('#copyBorder').selectOption('border');
    await page.waitForTimeout(200);

    const copyText = await page.evaluate(() => window.getCurrentCopyText());
    assert(copyText.includes('🐔'), 'Copy text matches hiyoko mode');
    assert(copyText.includes('├─') || copyText.includes('└─'), 'Copy text has border lines');

    // ========================================
    // Feature: Click preview line -> focus node
    // ========================================
    console.log('\n=== Click preview line focuses node ===');
    await page.locator('#copyFormat').selectOption('simple');
    await page.waitForTimeout(200);

    const ca2Line = await page.$('.sidebar-preview-line[data-sid="ca2"]');
    assert(!!ca2Line, 'ChildA2 preview line exists');
    if (ca2Line) {
        await ca2Line.click();
        await page.waitForTimeout(300);
    }
    const selectedAfterClick = await page.evaluate(() => Array.from(window.getSelectedNodeIds()));
    assert(selectedAfterClick.length === 1 && selectedAfterClick[0] === 'ca2', 'ChildA2 selected after preview line click');

    // ========================================
    // Feature: Real-time preview updates on data change
    // ========================================
    console.log('\n=== Real-time preview updates ===');
    await page.click('.node[data-id="pb"]');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type('ChildB2');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(previewText.includes('ChildB2'), 'Preview updated with new ChildB2 node');

    // ========================================
    // Feature: Persistence after reload
    // ========================================
    console.log('\n=== Persistence ===');
    await page.locator('#copyFormat').selectOption('family');
    await page.waitForTimeout(200);
    await page.locator('#copyBorder').selectOption('none');
    await page.waitForTimeout(200);
    
    await page.reload();
    await page.waitForSelector('.node', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(800);

    const reloadFormat = await page.$eval('#copyFormat', el => el.value);
    assert(reloadFormat === 'family', 'Format persists: ' + reloadFormat);

    const reloadBorder = await page.$eval('#copyBorder', el => el.value);
    assert(reloadBorder === 'none', 'Border persists: ' + reloadBorder);

    // Open sidebar if collapsed, and check preview reflects saved settings
    const sidebarCollapsed = await page.$eval('#sidebar', el => el.classList.contains('collapsed'));
    if (sidebarCollapsed) {
        await page.click('#sidebarToggle');
        await page.waitForTimeout(300);
    }
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(previewText.includes('👴'), 'Reload: family mode persisted in preview');
    assert(!previewText.includes('├─') && !previewText.includes('└─'), 'Reload: no border persisted in preview');

    // ========================================
    // Feature: Existing shortcuts still work
    // ========================================
    console.log('\n=== Existing shortcuts ===');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.click('.node[data-id="root"]');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    let sel = await page.evaluate(() => Array.from(window.getSelectedNodeIds()));
    assert(sel[0] === 'pa', 'ArrowRight -> ParentA');

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    sel = await page.evaluate(() => Array.from(window.getSelectedNodeIds()));
    assert(sel[0] === 'pb', 'ArrowDown -> ParentB (cross-parent)');

    // ========================================
    // Feature: No old floating UI
    // ========================================
    console.log('\n=== No old UI ===');
    assert(!await page.$('#previewBtn'), 'No preview button');
    assert(!await page.$('.copy-panel'), 'No floating panel');

    // ========================================
    // Summary
    // ========================================
    console.log('\n==================');
    console.log('Passed: ' + passed + '/' + (passed + failed));
    if (failed > 0) {
        console.log('FAILED: ' + failed);
        process.exit(1);
    } else {
        console.log('ALL TESTS PASSED ✅');
    }

    await browser.close();
})();
