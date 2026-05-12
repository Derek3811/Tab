// Elements
const dropArea = document.getElementById('drop-area');
const tabTypeSelect = document.getElementById('tab-type');
const paperSizeSelect = document.getElementById('paper-size');
const printModeSelect = document.getElementById('print-mode');
const startPosInput = document.getElementById('start-pos');
const numericModeControls = document.getElementById('numeric-mode-controls');
const numStartInput = document.getElementById('num-start');
const numEndInput = document.getElementById('num-end');
const printerSelect = document.getElementById('printer-select');

const offsetXInput = document.getElementById('offset-x');
const offsetYInput = document.getElementById('offset-y');
const pageRangeInput = document.getElementById('page-range');
const sortAzToggle = document.getElementById('sort-az');
const rotatePageToggle = document.getElementById('rotate-page');
const rotateTextToggle = document.getElementById('rotate-text');
const debugOverlayToggle = document.getElementById('debug-overlay');
const manualReorderList = document.getElementById('manual-reorder-list');
const showDialogToggle = document.getElementById('show-dialog');
const resizer = document.getElementById('resizer');
const controlsPanel = document.querySelector('.controls-panel');


const previewContainer = document.getElementById('preview-container');
const previewStatus = document.getElementById('preview-status');
const printBtn = document.getElementById('print-btn');
const testPrintBtn = document.getElementById('test-print-btn');

const printSummaryContainer = document.getElementById('print-summary');
const summaryDetails = document.getElementById('summary-details');

const optionsHeader = document.getElementById('options-header');
const optionsContent = document.getElementById('options-content');

// State
let loadedTabs = []; // Original data
let activeTabs = []; // Sorted / filtered data
let isPrinting = false;
let sortableInstance = null;

// Initialize
async function init() {
  const printers = await window.api.getPrinters();
  printers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.isDefault) opt.selected = true;
    printerSelect.appendChild(opt);
  });

  optionsHeader.addEventListener('click', () => {
    optionsContent.classList.toggle('open');
    optionsHeader.querySelector('span:last-child').textContent = optionsContent.classList.contains('open') ? '▲' : '▼';
  });

  tabTypeSelect.addEventListener('change', handleConfigChange);
  printModeSelect.addEventListener('change', updatePreview);
  startPosInput.addEventListener('change', updatePreview);
  offsetXInput.addEventListener('change', updatePreview);
  offsetYInput.addEventListener('change', updatePreview);
  numStartInput.addEventListener('change', handleNumericChange);
  numEndInput.addEventListener('change', handleNumericChange);
  sortAzToggle.addEventListener('change', processTabs);
  rotatePageToggle.addEventListener('change', updatePreview);
  rotateTextToggle.addEventListener('change', updatePreview);
  debugOverlayToggle.addEventListener('change', updatePreview);

  printBtn.addEventListener('click', () => doPrint(false));
  testPrintBtn.addEventListener('click', () => doPrint(true));

  // Resizer Logic
  let isResizing = false;
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerOffset = controlsPanel.parentElement.getBoundingClientRect().left;
    const newWidth = e.clientX - containerOffset - 20; // 20px padding
    if (newWidth >= 200 && newWidth <= 600) {
      controlsPanel.style.flex = `0 0 ${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
    }
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('drag-over'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('drag-over'), false);
  });

  dropArea.addEventListener('drop', handleDrop, false);
}

function handleConfigChange() {
  const isNumeric = tabTypeSelect.value === '25';
  numericModeControls.style.display = isNumeric ? 'block' : 'none';
  if (isNumeric) {
    handleNumericChange();
  } else {
    processTabs();
  }
}

function handleNumericChange() {
  if (tabTypeSelect.value !== '25') return;
  const start = parseInt(numStartInput.value) || 1;
  const end = parseInt(numEndInput.value) || 25;
  
  let newTabs = [];
  for (let i = start; i <= end; i++) {
    newTabs.push(i.toString());
  }
  loadedTabs = newTabs;
  sortAzToggle.checked = false;
  sortAzToggle.disabled = true;
  processTabs();
}

async function handleDrop(e) {
  if (tabTypeSelect.value === '25') {
    alert("Numeric mode is active. Drag & drop is ignored. Switch tab density to load files.");
    return;
  }

  let dt = e.dataTransfer;
  let files = dt.files;
  if (files.length === 0) return;

  const file = files[0];
  const path = file.path;
  if (!path) return;

  try {
    let result = [];
    if (path.endsWith('.txt')) {
      result = await window.api.readTextFile(path);
    } else {
      result = await window.api.readFolder(path);
    }

    if (result && result.length > 0) {
      loadedTabs = result;
      startPosInput.value = 1;
      sortAzToggle.disabled = false;
      processTabs();
    } else {
      alert("No valid items found in the dropped path.");
    }
  } catch (err) {
    console.error(err);
    alert("Error reading drop data.");
  }
}

function processTabs() {
  if (loadedTabs.length === 0) {
    activeTabs = [];
    updatePreview();
    return;
  }

  activeTabs = [...loadedTabs];
  
  if (sortAzToggle.checked && tabTypeSelect.value !== '25') {
    activeTabs.sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
  }

  manualReorderList.innerHTML = '';
  activeTabs.forEach((text, index) => {
    const item = document.createElement('div');
    item.className = 'sortable-item';
    item.dataset.index = index;
    item.textContent = text;
    manualReorderList.appendChild(item);
  });

  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = new Sortable(manualReorderList, {
    animation: 150,
    onEnd: () => {
      sortAzToggle.checked = false;
      const newOrder = [];
      manualReorderList.querySelectorAll('.sortable-item').forEach(el => {
        newOrder.push(el.textContent);
      });
      activeTabs = newOrder;
      updatePreview();
    }
  });

  updatePreview();
}

function updatePreview() {
  if (activeTabs.length === 0) {
    previewContainer.innerHTML = '<div class="empty-state">Drop files to see high-res tab preview</div>';
    previewStatus.textContent = '0 items';
    printSummaryContainer.style.display = 'none';
    printBtn.disabled = true;
    printBtn.textContent = `🖨️ Print`;
    return;
  }

  const tabCount = parseInt(tabTypeSelect.value);
  const startPos = parseInt(startPosInput.value) || 1;
  const mode = printModeSelect.value;
  const offsetX = parseFloat(offsetXInput.value) || 0;
  const offsetY = parseFloat(offsetYInput.value) || 0;
  const debug = debugOverlayToggle.checked;

  previewStatus.textContent = `${activeTabs.length} items`;
  
  // Calculate total pages
  let totalPages = 0;
  if (mode === 'single') {
    totalPages = activeTabs.length;
  } else {
    // Full Page mode
    let currentPos = startPos - 1;
    let pages = 0;
    for (let i = 0; i < activeTabs.length; i++) {
      currentPos++;
      if (currentPos % tabCount === 0 || i === activeTabs.length - 1) {
        pages++;
        if (currentPos % tabCount === 0) currentPos = 0;
      }
    }
    totalPages = pages;
  }

  // Update Print Summary
  printSummaryContainer.style.display = 'block';
  summaryDetails.innerHTML = `
    <strong>First Item:</strong> ${activeTabs[0]}<br>
    <strong>Start Position:</strong> ${startPos}<br>
    <strong>Mode:</strong> ${mode === 'single' ? 'Single Tab (1 tab per page)' : 'Full Page (Fill all)'}<br>
    <strong>Total:</strong> ${activeTabs.length} tab(s) &rarr; ${totalPages} page(s)
  `;

  // Update Print Button
  const modeText = mode === 'single' ? 'Single Tab' : 'Full Page';
  printBtn.textContent = `Print ${activeTabs.length} tabs → ${totalPages} pages (${modeText})`;
  printBtn.disabled = false;

  // Render WYSIWYG Zoomed Preview
  let previewHTML = '';
  
  // Show only 1 tab by default in Single Tab mode to reduce noise
  const previewLimit = mode === 'single' ? 1 : Math.min(activeTabs.length, 10);
  
  // Base scaling for human-readable horizontal layout
  const scale = 3; // 3x zoom
  // For horizontal preview, width is the long side (e.g. 2.2 inches), height is the short side (0.5 inches)
  const tabWidthPx = (11 / tabCount) * 96 * scale; 
  const tabHeightPx = 0.5 * 96 * scale; 
  
  for (let i = 0; i < previewLimit; i++) {
    const text = activeTabs[i];
    
    // Simulate smart fit font sizes (scaled by 3x for zoom)
    // Same logic as print.html
    let baseFontSize = 16; 
    if (tabCount === 25) {
       baseFontSize = 12;
    } else {
       if (text.length > 15) baseFontSize = 14;
       if (text.length > 25) baseFontSize = 12;
    }
    const fontSize = `${baseFontSize * scale}px`;

    // Optical offset for preview (scaled up)
    // Print logic: 1mm inward, -0.5mm upward.
    // In horizontal view: X offset shifts left/right, Y offset shifts up/down.
    // 1mm = 3.78px * scale
    const transX = (offsetX * 3.78 * scale);
    const transY = -1.89 * scale + (offsetY * 3.78 * scale);
    
    const debugStyle = debug ? 'border: 2px dashed red; background: rgba(255,0,0,0.05);' : '';

    previewHTML += `
      <div class="zoomed-tab-container">
        <div class="zoomed-tab-meta">
          <span>Tab: ${text}</span>
          <span style="color: var(--accent-color);">Pos: ${((startPos - 1 + i) % tabCount) + 1}</span>
        </div>
        <div class="zoomed-tab" style="width: ${tabWidthPx}px; height: ${tabHeightPx}px; ${debugStyle}">
          ${debug ? '<div style="position: absolute; top:0; bottom:0; left:50%; border-left: 1px dashed blue;"></div><div style="position: absolute; left:0; right:0; top:50%; border-top: 1px dashed blue;"></div>' : ''}
          <div class="zoomed-tab-text" style="font-size: ${fontSize};">
            <span style="transform: translate(${transX}px, ${transY}px); display: inline-block; max-width: 100%;">${text}</span>
          </div>
        </div>
      </div>
    `;
  }

  if (activeTabs.length > previewLimit && mode !== 'single') {
    previewHTML += `<div style="color: #64748b; font-size: 15px; margin-top: 20px;">+ ${activeTabs.length - previewLimit} more tabs...</div>`;
  } else if (activeTabs.length > 1 && mode === 'single') {
    previewHTML += `<div style="color: #64748b; font-size: 15px; margin-top: 20px;">+ ${activeTabs.length - 1} more pages in Single Tab mode</div>`;
  }

  previewContainer.innerHTML = previewHTML;
}

async function doPrint(isTest) {
  let tabsToPrint = isTest ? ['Test Print Tab'] : activeTabs;
  if (tabsToPrint.length === 0 || isPrinting) return;
  
  isPrinting = true;
  if (isTest) {
    testPrintBtn.textContent = "Testing...";
    testPrintBtn.disabled = true;
  } else {
    printBtn.textContent = "Generating...";
    printBtn.disabled = true;
  }

  const printData = {
    tabs: tabsToPrint,
    type: tabTypeSelect.value,
    mode: isTest ? 'single' : printModeSelect.value,
    startPos: parseInt(startPosInput.value) || 1,
    offsetX: parseFloat(offsetXInput.value) || 0,
    offsetY: parseFloat(offsetYInput.value) || 0,
    paperSize: paperSizeSelect.value,
    pageRange: pageRangeInput.value.trim(),
    printerName: printerSelect.value,
    showDialog: showDialogToggle.checked,
    rotatePage: rotatePageToggle.checked,
    rotateText: rotateTextToggle.checked,
    copies: parseInt(document.getElementById('copies').value) || 1,
    debug: debugOverlayToggle.checked
  };

  try {
    const result = await window.api.printTabs(printData);
    if (result.success) {
      if (!isTest) alert("Print job sent successfully!");
    } else {
      alert("Print error: " + result.error);
    }
  } catch (err) {
    alert("Print error: " + err);
  } finally {
    isPrinting = false;
    if (isTest) {
      testPrintBtn.textContent = "📄 Test Print (1 Page)";
      testPrintBtn.disabled = false;
    }
    updatePreview(); // restores print button state
  }
}

document.addEventListener('DOMContentLoaded', init);
