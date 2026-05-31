// Custom dropdown selector — replaces native <select> with styled buttons
// Keeps original <select> hidden, syncs value + fires change events

export function initCustomSelects() {
  document.querySelectorAll('.set-select-wrap').forEach(wrap => {
    const select = wrap.querySelector('.set-select');
    if (!select) return;
    // Already initialized
    if (wrap.querySelector('.set-select-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'set-select-btn';
    btn.type = 'button';

    const dropdown = document.createElement('div');
    dropdown.className = 'set-select-dropdown';

    const options = select.querySelectorAll('option');
    options.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'set-option';
      div.textContent = opt.textContent;
      div.dataset.value = opt.value;
      if (opt.selected) {
        div.classList.add('selected');
        btn.textContent = opt.textContent;
      }
      div.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Update hidden select
        select.value = div.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        // Update UI
        btn.textContent = div.textContent;
        dropdown.querySelectorAll('.set-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        closeAllDropdowns();
      });
      dropdown.appendChild(div);
    });

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('show');
      closeAllDropdowns();
      if (!isOpen) {
        dropdown.classList.add('show');
        btn.classList.add('open');
      }
    });

    wrap.appendChild(btn);
    wrap.appendChild(dropdown);
  });

  // Close dropdowns on outside click
  document.addEventListener('pointerdown', closeAllDropdowns);
}

function closeAllDropdowns() {
  document.querySelectorAll('.set-select-dropdown.show').forEach(d => {
    d.classList.remove('show');
    d.parentElement.querySelector('.set-select-btn')?.classList.remove('open');
  });
}

// Sync button text with hidden select value (for programmatic changes)
export function syncCustomSelects() {
  document.querySelectorAll('.set-select-wrap').forEach(wrap => {
    const select = wrap.querySelector('.set-select');
    const btn = wrap.querySelector('.set-select-btn');
    if (!select || !btn) return;
    const opt = select.querySelector(`option[value="${select.value}"]`);
    if (opt) btn.textContent = opt.textContent;
  });
}
