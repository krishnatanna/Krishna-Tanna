/* custom.js
   Quick View modal, variant pickers, Add-to-Cart, and special rule:
   - Adds a dynamic modal when clicking Quick view buttons (buttons have data-quick & data-handle)
   - Uses /products/{handle}.js to fetch product JSON
   - Adds product variant to cart via /cart/add.js
   - If chosen variant includes BOTH "Black" and "Medium" (case-insensitive), it also adds the upsell variant id found on the grid section's data attribute
   - Uses only vanilla JS
*/
(function () {
  'use strict';

  // Format price (fallback to simple formatting if Shopify.currency not available)
  function formatMoney(cents) {
    try {
      const currency = (window.Shopify && Shopify.currency && Shopify.currency.active) || undefined;
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
    } catch (e) {
      return (cents / 100).toFixed(2);
    }
  }

  // Utility: find closest ancestor with data-section attr
  function findGridSection(el) {
    return el.closest('[data-section="custom-product-grid"]') || document.querySelector('[data-section="custom-product-grid"]');
  }

  // Create modal DOM (if doesn't exist)
  function ensureModal() {
    let modal = document.getElementById('custom-quickview');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'custom-quickview';
    modal.className = 'cqv-modal';
    modal.innerHTML = `
      <div class="cqv-overlay" data-cqv-close></div>
      <div class="cqv-panel" role="dialog" aria-modal="true">
        <button class="cqv-close" data-cqv-close aria-label="Close">&times;</button>
        <div class="cqv-inner">
          <div class="cqv-media"><img alt="" /></div>
          <div class="cqv-body">
            <h2 class="cqv-title"></h2>
            <div class="cqv-price"></div>
            <div class="cqv-desc"></div>
            <div class="cqv-variants"></div>
            <div class="cqv-actions">
              <label>Qty <input type="number" class="cqv-qty" value="1" min="1" /></label>
              <button class="btn cqv-add">Add to cart</button>
            </div>
            <div class="cqv-msg" aria-live="polite"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  // Open modal and prevent body scroll
  function openModal(modal) {
    modal.classList.add('open');
    document.documentElement.classList.add('no-scroll');
  }
  function closeModal(modal) {
    modal.classList.remove('open');
    document.documentElement.classList.remove('no-scroll');
  }

  // Find variant by selected options
  function findVariant(product, selections) {
    return product.variants.find(function (v) {
      return product.options.every(function (optName, idx) {
        const want = selections[optName];
        if (!want) return true;
        const got = v['option' + (idx + 1)];
        return got === want;
      });
    });
  }

  // Build variant pickers inside modal
  function buildVariantPickers(modal, product) {
    const wrap = modal.querySelector('.cqv-variants');
    wrap.innerHTML = '';
    const selections = {};

    product.options.forEach(function (optName, optIndex) {
      const idx = optIndex + 1;
      // collect unique values for option
      const values = Array.from(new Set(product.variants.map(v => v['option' + idx])));

      const group = document.createElement('div');
      group.className = 'cqv-variant-group';
      const title = document.createElement('div');
      title.className = 'cqv-variant-title';
      title.textContent = optName;
      group.appendChild(title);

      const optionsRow = document.createElement('div');
      optionsRow.className = 'cqv-variant-options';

      values.forEach(function (val) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cqv-opt';
        btn.textContent = val;
        btn.setAttribute('data-opt', optName);
        btn.setAttribute('data-val', val);
        btn.setAttribute('aria-pressed', 'false');

        btn.addEventListener('click', function () {
          // toggle selection inside same option group
          optionsRow.querySelectorAll('.cqv-opt').forEach(o => o.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          selections[optName] = val;
          const variant = findVariant(product, selections);
          if (variant) {
            modal.dataset.variantId = variant.id;
            modal.querySelector('.cqv-price').textContent = formatMoney(variant.price);
            modal.querySelector('.cqv-title').textContent = product.title + (variant.title ? ' — ' + variant.title : '');
          }
        });

        optionsRow.appendChild(btn);
      });

      group.appendChild(optionsRow);
      wrap.appendChild(group);
    });

    // Preselect first available variant
    const initialVariant = product.variants.find(v => v.available) || product.variants[0];
    if (initialVariant) {
      // set selections to match initialVariant
      product.options.forEach(function (optName, idx) {
        const val = initialVariant['option' + (idx + 1)];
        selections[optName] = val;
        const btn = wrap.querySelector(`.cqv-opt[data-opt="${CSS.escape(optName)}"][data-val="${CSS.escape(val)}"]`);
        if (btn) btn.click();
      });
      modal.dataset.variantId = initialVariant.id;
      modal.querySelector('.cqv-price').textContent = formatMoney(initialVariant.price);
    }

    return selections; // initial selection object
  }

  // Add item to cart (returns response JSON or throws)
  function addToCart(variantId, quantity) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(variantId), quantity: Number(quantity) })
    }).then(res => {
      if (!res.ok) throw new Error('Cart add failed');
      return res.json();
    });
  }

  // Helper: get upsell variant id from grid section (data attribute)
  function getUpsellVariantIdFromSection(button) {
    const section = findGridSection(button);
    if (!section) return null;
    const v = section.getAttribute('data-upsell-variant');
    if (!v) return null;
    try { return Number(v) || null; } catch (e) { return null; }
  }

  // Main click handler (delegation)
  document.addEventListener('click', async function (ev) {
    const quick = ev.target.closest('[data-quick]');
    if (quick) {
      ev.preventDefault();
      const handle = quick.getAttribute('data-handle');
      if (!handle) return alert('Product handle missing');

      try {
        const res = await fetch(`/products/${handle}.js`);
        if (!res.ok) throw new Error('Product fetch failed');
        const product = await res.json();

        const modal = ensureModal();

        // fill content
        modal.querySelector('.cqv-title').textContent = product.title;
        modal.querySelector('.cqv-desc').textContent = product.description ? product.description.replace(/<\/?[^>]+(>|$)/g, '') : '';
        const imageUrl = product.images && product.images.length ? product.images[0] : product.featured_image;
        modal.querySelector('.cqv-media img').src = imageUrl || '';
        modal.querySelector('.cqv-media img').alt = product.title;

        // Build variant pickers and set initial selection
        buildVariantPickers(modal, product);

        // Ensure add handler
        const addBtn = modal.querySelector('.cqv-add');
        addBtn.onclick = async function () {
          addBtn.disabled = true;
          modal.querySelector('.cqv-msg').textContent = 'Adding...';

          const qty = modal.querySelector('.cqv-qty').value || 1;
          const vid = modal.dataset.variantId;
          if (!vid) {
            modal.querySelector('.cqv-msg').textContent = 'Please select variant';
            addBtn.disabled = false;
            return;
          }

          try {
            await addToCart(vid, qty);

            // check special rule: if chosen variant's option values include Black & Medium
            const chosenVariant = product.variants.find(v => Number(v.id) === Number(vid));
            const optionValues = [];
            if (chosenVariant) {
              [chosenVariant.option1, chosenVariant.option2, chosenVariant.option3].forEach(o => {
                if (o) optionValues.push(o.toString().toLowerCase());
              });
            }
            const hasBlack = optionValues.some(v => v.includes('black'));
            const hasMedium = optionValues.some(v => v.includes('medium'));

            const upsellVariantId = getUpsellVariantIdFromSection(quick);
            if (hasBlack && hasMedium && upsellVariantId) {
              // add upsell
              try {
                await addToCart(upsellVariantId, 1);
              } catch (e) {
                console.warn('Upsell add failed', e);
              }
            }

            // Redirect to cart after add(s)
            window.location.href = '/cart';
          } catch (err) {
            console.error(err);
            modal.querySelector('.cqv-msg').textContent = 'Could not add to cart. Try again.';
            addBtn.disabled = false;
          }
        };

        // open modal
        openModal(modal);
      } catch (err) {
        console.error(err);
        alert('Unable to load product.');
      }
      return;
    }

    // close handlers
    const close = ev.target.closest('[data-cqv-close]');
    if (close) {
      const modal = document.getElementById('custom-quickview');
      if (modal) closeModal(modal);
      return;
    }
  });

  // close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('custom-quickview');
      if (modal && modal.classList.contains('open')) closeModal(modal);
    }
  });
})();
