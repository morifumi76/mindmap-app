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
    assert(!!await page.$('#copyFormat'), 'Format dropdown (hidden)');
    assert(!!await page.$('#copyBorder'), 'Border dropdown (hidden)');

    // ========================================
    // Open sidebar
    // ========================================
    console.log('\n=== Open sidebar ===');
    // Floating button uses 🌲 icon
    const floatToggleText = await page.$eval('#sidebarFloatToggle', el => el.textContent.trim());
    assert(floatToggleText === '🌲', 'Float toggle shows 🌲 icon: ' + floatToggleText);

    await page.click('#sidebarFloatToggle');
    await page.waitForTimeout(300);
    const isOpen = await page.$eval('#sidebar', el => !el.classList.contains('collapsed'));
    assert(isOpen, 'Sidebar opens');

    // ========================================
    // Feature: iOS-style toggle switches
    // ========================================
    console.log('\n=== iOS toggle switch structure ===');

    // Hiyoko toggle
    assert(!!await page.$('#toggleHiyoko'), 'Hiyoko toggle label element exists');
    assert(!!await page.$('#toggleHiyokoInput'), 'Hiyoko toggle input exists');
    const hiyokoType = await page.$eval('#toggleHiyokoInput', el => el.type);
    assert(hiyokoType === 'checkbox', 'Hiyoko toggle is a checkbox');

    // Border toggle
    assert(!!await page.$('#toggleBorder'), 'Border toggle label element exists');
    assert(!!await page.$('#toggleBorderInput'), 'Border toggle input exists');
    const borderType = await page.$eval('#toggleBorderInput', el => el.type);
    assert(borderType === 'checkbox', 'Border toggle is a checkbox');

    // Toggle switch dimensions: 40x20
    const switchWidth = await page.$eval('#toggleHiyoko', el => el.offsetWidth);
    const switchHeight = await page.$eval('#toggleHiyoko', el => el.offsetHeight);
    assert(switchWidth === 40, 'Toggle switch width = 40px: ' + switchWidth);
    assert(switchHeight === 20, 'Toggle switch height = 20px: ' + switchHeight);

    // Toggle label text
    const hiyokoLabelText = await page.$eval('#toggleHiyoko', el => el.closest('.sidebar-toggle-row').querySelector('.sidebar-toggle-label').textContent);
    assert(hiyokoLabelText.includes('ひよこモード'), 'Hiyoko label includes ひよこモード');
    const borderLabelText = await page.$eval('#toggleBorder', el => el.closest('.sidebar-toggle-row').querySelector('.sidebar-toggle-label').textContent);
    assert(borderLabelText === '罫線', 'Border label is 罫線: ' + borderLabelText);

    // Toggle row layout: justify-content: space-between
    const rowJustify = await page.$eval('.sidebar-toggle-row', el => getComputedStyle(el).justifyContent);
    assert(rowJustify === 'space-between', 'Toggle row layout is space-between: ' + rowJustify);

    // ON color = #37352f (not green)
    const onBg = await page.evaluate(() => {
        const slider = document.querySelector('#toggleBorderInput:checked + .toggle-slider');
        return slider ? getComputedStyle(slider).backgroundColor : 'no-checked-slider';
    });
    assert(onBg.includes('55, 53, 47') || onBg === 'rgb(55, 53, 47)', 'ON color is #37352f: ' + onBg);

    // Default states: hiyoko OFF, border ON
    const hiyokoChecked = await page.$eval('#toggleHiyokoInput', el => el.checked);
    assert(!hiyokoChecked, 'Default: hiyoko toggle OFF');
    const borderChecked = await page.$eval('#toggleBorderInput', el => el.checked);
    assert(borderChecked, 'Default: border toggle ON');

    // ========================================
    // Feature: Fixed-width buttons
    // ========================================
    console.log('\n=== Fixed-width buttons ===');
    const copyBtnWidth = await page.$eval('#copyBtn', el => el.offsetWidth);
    assert(copyBtnWidth === 100, 'Copy button width = 100px: ' + copyBtnWidth);
    const resetBtnWidth = await page.$eval('#resetBtn', el => el.offsetWidth);
    assert(resetBtnWidth === 80, 'Reset button width = 80px: ' + resetBtnWidth);

    // Copy button style: bg #37352f, color white
    const copyBtnBg = await page.$eval('#copyBtn', el => getComputedStyle(el).backgroundColor);
    assert(copyBtnBg.includes('55, 53, 47') || copyBtnBg === 'rgb(55, 53, 47)', 'Copy btn bg is #37352f: ' + copyBtnBg);
    const copyBtnColor = await page.$eval('#copyBtn', el => getComputedStyle(el).color);
    assert(copyBtnColor.includes('255, 255, 255') || copyBtnColor === 'rgb(255, 255, 255)', 'Copy btn text is white: ' + copyBtnColor);

    // Reset button style: bg transparent, color #91918e, border
    const resetBtnBg = await page.$eval('#resetBtn', el => getComputedStyle(el).backgroundColor);
    assert(resetBtnBg.includes('0, 0, 0, 0') || resetBtnBg === 'rgba(0, 0, 0, 0)', 'Reset btn bg is transparent: ' + resetBtnBg);
    const resetBtnColor = await page.$eval('#resetBtn', el => getComputedStyle(el).color);
    assert(resetBtnColor.includes('145, 145, 142') || resetBtnColor === 'rgb(145, 145, 142)', 'Reset btn text is #91918e: ' + resetBtnColor);

    // Reset button text (no 🗑 emoji)
    const resetBtnText = await page.$eval('#resetBtn', el => el.textContent.trim());
    assert(resetBtnText === 'リセット', 'Reset button text is リセット (no emoji): ' + resetBtnText);

    // Button area centered
    const buttonAreaJustify = await page.$eval('.sidebar-button-area', el => getComputedStyle(el).justifyContent);
    assert(buttonAreaJustify === 'center', 'Button area is centered: ' + buttonAreaJustify);

    // ========================================
    // Feature: Bottom panel layout
    // ========================================
    console.log('\n=== Bottom panel layout ===');
    assert(!!await page.$('.sidebar-bottom-panel'), 'Bottom panel exists');
    assert(!!await page.$('.sidebar-bottom-separator'), 'Separator line exists');
    assert(!!await page.$('.sidebar-toggle-area'), 'Toggle area exists');
    assert(!!await page.$('.sidebar-button-area'), 'Button area exists');

    // Separator is 1px solid #e8e8e8
    const sepBorderTop = await page.$eval('.sidebar-bottom-separator', el => getComputedStyle(el).borderTopStyle);
    assert(sepBorderTop === 'solid', 'Separator has solid border-top');

    // Tree is above bottom panel (flex column layout)
    const treeOrder = await page.evaluate(() => {
        const content = document.getElementById('sidebarContent');
        const children = Array.from(content.children).map(c => c.className || c.id);
        return children;
    });
    console.log('Content children order:', treeOrder.join(', '));

    // ========================================
    // Feature: Preview reflects format/border (default = simple + border)
    // ========================================
    console.log('\n=== Preview reflects settings ===');

    let previewText = await page.$eval('#sidebarTree', el => el.textContent);
    console.log('Default preview (first 100 chars):', previewText.substring(0, 100));
    assert(previewText.includes('├─') || previewText.includes('└─'), 'Default: border lines shown (├─ / └─)');
    assert(previewText.includes('中心テーマ'), 'Preview includes root text');
    assert(previewText.includes('ParentA'), 'Preview includes ParentA');
    assert(previewText.includes('ChildB1'), 'Preview includes ChildB1');
    assert(!previewText.includes('🐔'), 'Default: no emoji icons (simple mode)');

    // ========================================
    // Feature: Toggle hiyoko ON -> preview updates
    // ========================================
    console.log('\n=== Change to hiyoko mode via toggle switch ===');
    await page.click('#toggleHiyoko');
    await page.waitForTimeout(300);

    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    console.log('Hiyoko preview (first 100 chars):', previewText.substring(0, 100));
    assert(previewText.includes('🐔'), 'Hiyoko mode: 🐔 icon for root level');
    assert(previewText.includes('🐤'), 'Hiyoko mode: 🐤 icon for level 2');
    assert(previewText.includes('🐣') || previewText.includes('🥚'), 'Hiyoko mode: 🐣/🥚 for deeper levels');

    // Verify checkbox is now checked
    const hiyokoNowChecked = await page.$eval('#toggleHiyokoInput', el => el.checked);
    assert(hiyokoNowChecked, 'Hiyoko toggle is now ON (checked)');

    // ========================================
    // Feature: Family mode removed
    // ========================================
    console.log('\n=== Family mode removed ===');
    const familyOption = await page.$('#copyFormat option[value="family"]');
    assert(!familyOption, 'Family option removed from dropdown');

    // ========================================
    // Feature: Toggle border OFF -> preview updates
    // ========================================
    console.log('\n=== Toggle border OFF ===');
    await page.click('#toggleBorder');
    await page.waitForTimeout(300);

    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(!previewText.includes('├─') && !previewText.includes('└─') && !previewText.includes('│'),
        'No border: no tree lines in preview');

    const borderNowOff = await page.$eval('#toggleBorderInput', el => el.checked);
    assert(!borderNowOff, 'Border toggle is now OFF (unchecked)');

    // Toggle border back ON
    await page.click('#toggleBorder');
    await page.waitForTimeout(300);
    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(previewText.includes('├─') || previewText.includes('└─'), 'Border restored: tree lines shown');

    // ========================================
    // Feature: Copy output matches preview
    // ========================================
    console.log('\n=== Copy output matches preview ===');
    await page.evaluate(() => {
        document.getElementById('copyFormat').value = 'hiyoko';
        document.getElementById('copyFormat').dispatchEvent(new Event('change'));
        document.getElementById('copyBorder').value = 'border';
        document.getElementById('copyBorder').dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(200);

    const copyText = await page.evaluate(() => window.getCurrentCopyText());
    assert(copyText.includes('🐔'), 'Copy text matches hiyoko mode');
    assert(copyText.includes('├─') || copyText.includes('└─'), 'Copy text has border lines');

    // ========================================
    // Feature: Click preview line -> focus node
    // ========================================
    console.log('\n=== Click preview line focuses node ===');
    await page.evaluate(() => {
        document.getElementById('copyFormat').value = 'simple';
        document.getElementById('copyFormat').dispatchEvent(new Event('change'));
    });
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
    await page.evaluate(() => {
        document.getElementById('copyFormat').value = 'hiyoko';
        document.getElementById('copyFormat').dispatchEvent(new Event('change'));
        document.getElementById('copyBorder').value = 'none';
        document.getElementById('copyBorder').dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(200);

    await page.reload();
    await page.waitForSelector('.node', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(800);

    const reloadFormat = await page.$eval('#copyFormat', el => el.value);
    assert(reloadFormat === 'hiyoko', 'Format persists: ' + reloadFormat);

    const reloadBorder = await page.$eval('#copyBorder', el => el.value);
    assert(reloadBorder === 'none', 'Border persists: ' + reloadBorder);

    // Verify toggle switches reflect persisted state
    const sidebarCollapsed = await page.$eval('#sidebar', el => el.classList.contains('collapsed'));
    if (sidebarCollapsed) {
        await page.click('#sidebarFloatToggle');
        await page.waitForTimeout(300);
    }

    const hiyokoAfterReload = await page.$eval('#toggleHiyokoInput', el => el.checked);
    assert(hiyokoAfterReload, 'Reload: hiyoko toggle is ON');
    const borderAfterReload = await page.$eval('#toggleBorderInput', el => el.checked);
    assert(!borderAfterReload, 'Reload: border toggle is OFF');

    previewText = await page.$eval('#sidebarTree', el => el.textContent);
    assert(previewText.includes('🐔'), 'Reload: hiyoko mode persisted in preview');
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
