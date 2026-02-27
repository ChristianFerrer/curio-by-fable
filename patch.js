const fs = require('fs');
let html = fs.readFileSync('C:/Users/chris/Documents/code/curio-by-fable/index.html', 'utf8');

const startMarker = '<!-- Supabase UMD sinc';
const endMarker = '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>';

const startIdx = html.indexOf(startMarker);
const endIdx   = html.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) { console.error('Markers not found'); process.exit(1); }

// Include leading whitespace before startMarker
let blockStart = startIdx;
while (blockStart > 0 && (html[blockStart-1] === ' ' || html[blockStart-1] === '\t')) blockStart--;

const afterEnd = endIdx + endMarker.length;

const before = html.substring(0, blockStart);
const after  = html.substring(afterEnd);

const newBlock = `  <!-- Scripts de la aplicación (orden crítico) -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
  <script src="/public/config.js"></script>
  <script>
  (function() {
    // 1) Crear cliente Supabase global
    var cfg = window.__CURIO_CONFIG__ || {};
    try {
      window._sb = window.supabase.createClient(
        cfg.supabaseUrl  || '',
        cfg.supabaseAnon || '',
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
    } catch(e) {
      console.warn('[Curio] Supabase mock:', e.message);
      var _c = {
        select: function(){ return _c; }, eq: function(){ return _c; },
        order:  function(){ return _c; }, limit:  function(){ return _c; },
        ilike:  function(){ return _c; }, gte:    function(){ return _c; },
        lte:    function(){ return _c; }, insert: function(){ return _c; },
        update: function(){ return _c; }, single: function(){ return Promise.resolve({data:null,error:null}); },
      };
      window._sb = {
        auth: {
          getSession:         function() { return Promise.resolve({ data: { session: null } }); },
          onAuthStateChange:  function()  { return { data: { subscription: { unsubscribe: function(){} } } }; },
          signInWithPassword: function()  { return Promise.resolve({ error: { message: 'No disponible' } }); },
          signUp:             function()  { return Promise.resolve({ error: null, data: {} }); },
          signOut:            function()  { return Promise.resolve(); },
          signInWithOAuth:    function()  { return Promise.resolve(); },
        },
        from: function() { return _c; },
      };
    }

    // 2) Helpers
    var CART_KEY    = 'curio_cart';
    var SESSION_KEY = 'curio_sid';

    function initReveal() {
      if (!('IntersectionObserver' in window)) return;
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) { if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); } });
      }, { threshold: 0.1 });
      document.querySelectorAll('.reveal').forEach(function(el) { obs.observe(el); });
    }
    function fmtPrice(n) {
      if (n == null || isNaN(n)) return '\u2014';
      return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    }
    function fmtDate(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    }
    function fmtCategory(slug) {
      var m = { juguetes_educativos:'Juguetes Educativos', juegos_mesa:'Juegos de Mesa', decoracion_habitacion:'Decoraci\u00f3n Habitaci\u00f3n', mobiliario_montessori:'Mobiliario Montessori', puzzles:'Puzzles', construccion:'Construcci\u00f3n', exterior:'Exterior' };
      return m[slug] || slug || '';
    }
    function fmtAge(min, max) {
      if (min == null) return '';
      if (max >= 99) return '+' + min + ' a\u00f1os';
      if (min === max) return min + ' a\u00f1os';
      return min + '\u2013' + max + ' a\u00f1os';
    }
    function fmtStatus(s) {
      var m = { pendiente:'Pendiente', procesando:'Procesando', enviado:'Enviado', entregado:'Entregado', cancelado:'Cancelado' };
      return m[s] || s;
    }

    // 3) Factory function — Alpine la llama con x-data="app()"
    window.app = function() {
      var _sbL = window._sb;
      return {
        // State
        user: null,
        showAuthModal: false, authView: 'login', authLoading: false, authError: '',
        loginEmail: '', loginPassword: '',
        registerName: '', registerEmail: '', registerPassword: '',
        afterAuthRedirect: null,
        currentView: 'home',
        navScrolled: false, megaMenuOpen: false, mobileMenuOpen: false,
        categories: [],
        featuredProducts: [],
        products: [], productsLoading: false, productsTotal: 0, productsPage: 1, productsTotalPages: 1,
        filters: { category: '', search: '', sort: 'newest' }, searchQuery: '',
        currentProduct: null, currentProductLoading: false, selectedQty: 1, selectedImageIdx: 0,
        cartItems: [], cartOpen: false,
        cartCount: 0, cartSubtotal: 0, cartShipping: 4.99, cartTotal: 4.99,
        checkoutStep: 1, checkoutLoading: false, lastOrderId: null,
        shippingForm: { full_name:'', address_line1:'', address_line2:'', city:'', province:'', postal_code:'', phone:'' },
        userOrders: [], ordersLoading: false,
        newsletterEmail: '', newsletterLoading: false, newsletterDone: false,
        toasts: [],

        // ── Init
        init: function() {
          var self = this;
          _sbL.auth.getSession().then(function(s) {
            self.user = (s && s.data && s.data.session) ? s.data.session.user : null;
          }).catch(function() { self.user = null; });

          _sbL.auth.onAuthStateChange(function(ev, session) {
            self.user = session ? session.user : null;
            if (self.afterAuthRedirect && self.user) {
              var d = self.afterAuthRedirect;
              self.afterAuthRedirect = null;
              self.showAuthModal = false;
              self.navigate(d);
            }
          });

          this._loadCart();
          window.addEventListener('scroll', function() { self.navScrolled = window.scrollY > 20; }, { passive: true });
          this._handleRoute(location.hash);
          window.addEventListener('hashchange', function() { self._handleRoute(location.hash); });
          fetch('/api/categories').then(function(r){ return r.json(); })
            .then(function(d){ self.categories = d.categories || []; })
            .catch(function(){ self.categories = []; });
          setTimeout(initReveal, 400);
        },

        // ── Router
        _handleRoute: function(hash) {
          var self = this;
          var path = hash.replace('#', '') || '/';
          this._trackView(path);
          this.cartOpen = false;
          this.mobileMenuOpen = false;

          if (path === '/' || path === '') {
            this.currentView = 'home';
            this._loadFeatured();
          } else if (path === '/catalogo' || path.startsWith('/catalogo?')) {
            this.currentView = 'catalog';
            var qp = new URLSearchParams((path.split('?')[1]) || '');
            if (qp.get('category')) this.filters.category = qp.get('category');
            this.loadProducts(1);
          } else if (path.startsWith('/producto/')) {
            var slug = path.split('/producto/')[1].split('?')[0];
            this.currentView = 'product';
            this.selectedQty = 1; this.selectedImageIdx = 0;
            this._loadProduct(slug);
          } else if (path === '/carrito') {
            this.currentView = 'cart';
          } else if (path === '/checkout') {
            if (!this.user) { this.afterAuthRedirect = '/checkout'; this.showAuthModal = true; location.hash = '#/'; return; }
            this.currentView = 'checkout'; this.checkoutStep = 1;
            _sbL.from('profiles').select('full_name,phone').eq('id', this.user.id).single()
              .then(function(p) {
                if (p.data && p.data.full_name) self.shippingForm.full_name = p.data.full_name;
                if (p.data && p.data.phone)     self.shippingForm.phone     = p.data.phone;
              }).catch(function(){});
          } else if (path === '/perfil') {
            if (!this.user) { this.navigate('/'); return; }
            this.currentView = 'profile';
            this.loadOrders();
          } else if (path.startsWith('/pedido-confirmado/')) {
            this.lastOrderId = path.split('/pedido-confirmado/')[1];
            this.currentView = 'order-success';
          } else {
            this.currentView = 'home';
            this._loadFeatured();
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(initReveal, 300);
        },

        navigate: function(path) { location.hash = '#' + path; },

        // ── Products
        _loadFeatured: function() {
          if (this.featuredProducts.length) return;
          var self = this;
          fetch('/api/products?featured=true&limit=8')
            .then(function(r){ return r.json(); })
            .then(function(d){ self.featuredProducts = d.products || []; })
            .catch(function(){});
        },
        _loadProduct: function(slug) {
          var self = this;
          this.currentProduct = null; this.currentProductLoading = true;
          fetch('/api/product?slug=' + encodeURIComponent(slug))
            .then(function(r) { if (!r.ok) throw new Error('not found'); return r.json(); })
            .then(function(d) { self.currentProduct = d; })
            .catch(function() { self.toast('Producto no encontrado.', 'error'); self.navigate('/catalogo'); })
            .finally(function() { self.currentProductLoading = false; });
        },
        loadProducts: function(page) {
          var self = this;
          page = page || 1; this.productsLoading = true; this.productsPage = page;
          var p = new URLSearchParams({ page: String(page), limit: '20', sort: this.filters.sort });
          if (this.filters.category) p.set('category', this.filters.category);
          if (this.filters.search)   p.set('search',   this.filters.search);
          fetch('/api/products?' + p.toString())
            .then(function(r){ return r.json(); })
            .then(function(d) { self.products = d.products || []; self.productsTotal = d.total || 0; self.productsTotalPages = d.totalPages || 1; })
            .catch(function() { self.toast('Error cargando productos.', 'error'); })
            .finally(function() { self.productsLoading = false; });
        },
        setFilter:      function(key, val) { this.filters[key] = val; this.loadProducts(1); },
        clearFilters:   function() { this.filters = { category:'', search:'', sort:'newest' }; this.searchQuery=''; this.loadProducts(1); },
        searchProducts: function() { this.filters.search = this.searchQuery; if (this.currentView !== 'catalog') this.navigate('/catalogo'); else this.loadProducts(1); },

        // ── Auth
        login: function() {
          var self = this;
          if (!this.loginEmail || !this.loginPassword) { this.authError = 'Por favor, completa todos los campos.'; return; }
          this.authLoading = true; this.authError = '';
          _sbL.auth.signInWithPassword({ email: this.loginEmail.trim(), password: this.loginPassword })
            .then(function(r) {
              self.authLoading = false;
              if (r.error) { self.authError = 'Email o contrase\u00f1a incorrectos.'; }
              else { self.showAuthModal = false; self.loginEmail = ''; self.loginPassword = ''; self.toast('\u00a1Bienvenido de vuelta!', 'success'); }
            }).catch(function() { self.authLoading = false; self.authError = 'Error al iniciar sesi\u00f3n.'; });
        },
        register: function() {
          var self = this;
          if (!this.registerName || !this.registerEmail || !this.registerPassword) { this.authError = 'Por favor, completa todos los campos.'; return; }
          if (this.registerPassword.length < 8) { this.authError = 'La contrase\u00f1a debe tener al menos 8 caracteres.'; return; }
          this.authLoading = true; this.authError = '';
          _sbL.auth.signUp({ email: this.registerEmail.trim(), password: this.registerPassword, options: { data: { full_name: this.registerName.trim() } } })
            .then(function(r) {
              self.authLoading = false;
              if (r.error) { self.authError = r.error.message && r.error.message.includes('already') ? 'Este email ya est\u00e1 registrado.' : 'Error al registrarse.'; }
              else { self.showAuthModal = false; self.registerName=''; self.registerEmail=''; self.registerPassword=''; self.toast('\u00a1Registro exitoso! Revisa tu email.', 'success'); }
            }).catch(function() { self.authLoading = false; self.authError = 'Error al registrarse.'; });
        },
        loginWithGoogle: function() {
          _sbL.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/#/' } });
        },
        logout: function() {
          var self = this;
          _sbL.auth.signOut().then(function() { self.navigate('/'); self.toast('Sesi\u00f3n cerrada.', 'info'); }).catch(function(){});
        },
        openLogin:    function() { this.authView = 'login';    this.authError = ''; this.showAuthModal = true; },
        openRegister: function() { this.authView = 'register'; this.authError = ''; this.showAuthModal = true; },
        closeModal:   function() { this.showAuthModal = false; this.authError = ''; },

        // ── Cart
        _updateCartTotals: function() {
          this.cartCount    = this.cartItems.reduce(function(s,i){ return s+i.quantity; }, 0);
          this.cartSubtotal = this.cartItems.reduce(function(s,i){ return s+i.price*i.quantity; }, 0);
          this.cartShipping = this.cartSubtotal >= 50 ? 0 : 4.99;
          this.cartTotal    = this.cartSubtotal + this.cartShipping;
        },
        addToCart: function(product, qty) {
          qty = Math.max(1, parseInt(qty) || 1);
          var ex = this.cartItems.find(function(i){ return i.product_id === product.id; });
          if (ex) { ex.quantity += qty; }
          else { this.cartItems.push({ product_id: product.id, name: product.name, slug: product.slug, price: product.price, image_url: (product.images && product.images[0]) || null, quantity: qty }); }
          this._saveCart(); this._updateCartTotals();
          this.toast(product.name + ' a\u00f1adido al carrito \uD83D\uDED2', 'success');
          this.cartOpen = true;
        },
        removeFromCart: function(pid) {
          this.cartItems = this.cartItems.filter(function(i){ return i.product_id !== pid; });
          this._saveCart(); this._updateCartTotals();
        },
        incrementQty: function(pid) {
          var it = this.cartItems.find(function(i){ return i.product_id === pid; });
          if (it) { it.quantity++; this._saveCart(); this._updateCartTotals(); }
        },
        decrementQty: function(pid) {
          var it = this.cartItems.find(function(i){ return i.product_id === pid; });
          if (!it) return;
          if (it.quantity <= 1) this.removeFromCart(pid);
          else { it.quantity--; this._saveCart(); this._updateCartTotals(); }
        },
        _saveCart:  function() { try { localStorage.setItem(CART_KEY, JSON.stringify(this.cartItems)); } catch(e) {} },
        _loadCart:  function() { try { var raw = localStorage.getItem(CART_KEY); if (raw) { this.cartItems = JSON.parse(raw); this._updateCartTotals(); } } catch(e) {} },
        clearCart:  function() { this.cartItems = []; localStorage.removeItem(CART_KEY); this._updateCartTotals(); },
        goToCheckout: function() {
          this.cartOpen = false;
          if (!this.user) { this.afterAuthRedirect = '/checkout'; this.openLogin(); return; }
          this.navigate('/checkout');
        },

        // ── Checkout
        validateShipping: function() {
          var f = this.shippingForm;
          if (!f.full_name || !f.address_line1 || !f.city || !f.postal_code || !f.phone) { this.toast('Completa todos los campos obligatorios.', 'error'); return false; }
          if (!/^\d{5}$/.test(f.postal_code)) { this.toast('C\u00f3digo postal debe tener 5 d\u00edgitos.', 'error'); return false; }
          return true;
        },
        goToConfirm: function() { if (this.validateShipping()) this.checkoutStep = 2; },
        submitOrder: function() {
          var self = this;
          if (!this.user) { this.openLogin(); return; }
          if (!this.cartItems.length) { this.toast('El carrito est\u00e1 vac\u00edo.', 'error'); return; }
          this.checkoutLoading = true;
          _sbL.auth.getSession().then(function(s) {
            var token = (s && s.data && s.data.session) ? s.data.session.access_token : '';
            return fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
              body: JSON.stringify({
                items: self.cartItems.map(function(i){ return { product_id: i.product_id, quantity: i.quantity }; }),
                shipping_address: self.shippingForm
              })
            });
          }).then(function(r) {
            return r.json().then(function(d) { if (!r.ok) throw new Error(d.error || 'Error'); return d; });
          }).then(function(d) {
            self.clearCart(); self.navigate('/pedido-confirmado/' + d.order_id);
          }).catch(function(e) {
            self.toast(e.message, 'error');
          }).finally(function() { self.checkoutLoading = false; });
        },

        // ── Orders
        loadOrders: function() {
          var self = this;
          this.ordersLoading = true;
          _sbL.auth.getSession().then(function(s) {
            var token = (s && s.data && s.data.session) ? s.data.session.access_token : '';
            return fetch('/api/orders', { headers: { 'Authorization': 'Bearer ' + token } });
          }).then(function(r){ return r.json(); })
          .then(function(d){ self.userOrders = d.orders || []; })
          .catch(function(){})
          .finally(function(){ self.ordersLoading = false; });
        },

        // ── Newsletter
        subscribeNewsletter: function() {
          var self = this;
          if (!this.newsletterEmail || !this.newsletterEmail.includes('@')) { this.toast('Introduce un email v\u00e1lido.', 'error'); return; }
          this.newsletterLoading = true;
          fetch('/api/newsletter', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: this.newsletterEmail }) })
            .then(function(r){ return r.json(); })
            .then(function(d) {
              if (d.already) { self.toast('Este email ya est\u00e1 suscrito \uD83D\uDE0A', 'info'); }
              else { self.newsletterDone = true; self.newsletterEmail = ''; self.toast('\u00a1Gracias! Te has suscrito.', 'success'); }
            }).catch(function() { self.toast('Error al suscribirse.', 'error'); })
            .finally(function() { self.newsletterLoading = false; });
        },

        // ── Track view
        _trackView: function(page) {
          var sid = sessionStorage.getItem(SESSION_KEY);
          if (!sid) {
            sid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
            sessionStorage.setItem(SESSION_KEY, sid);
          }
          fetch('/api/track-view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: page, session_id: sid, user_id: this.user ? this.user.id : null })
          }).catch(function(){});
        },

        // ── Toasts
        toast: function(msg, type) {
          type = type || 'info';
          var id  = Date.now() + Math.random();
          var t   = { id: id, message: msg, type: type, visible: true };
          this.toasts.push(t);
          var self = this;
          setTimeout(function() {
            t.visible = false;
            setTimeout(function() { self.toasts = self.toasts.filter(function(x){ return x.id !== id; }); }, 400);
          }, 3800);
        },

        // ── Format helpers
        formatPrice:    function(n)         { return fmtPrice(n); },
        formatDate:     function(iso)       { return fmtDate(iso); },
        formatCategory: function(slug)      { return fmtCategory(slug); },
        formatAge:      function(min, max)  { return fmtAge(min, max); },
        formatStatus:   function(s)         { return fmtStatus(s); },
        discountPct:    function(price, compare) {
          if (!compare || compare <= price) return 0;
          return Math.round((1 - price / compare) * 100);
        },
      };
    };
  })();
  </script>
  <!-- Alpine.js v3.14.1 con defer — window.app() ya est\u00e1 definido cuando Alpine inicialice -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"></script>`;

const newHtml = before + newBlock + after;

// Also fix x-data
const fixed = newHtml.replace('x-data="appStore"', 'x-data="app()"');

fs.writeFileSync('C:/Users/chris/Documents/code/curio-by-fable/index.html', fixed, 'utf8');

const lines = fixed.split('\n').length;
console.log('Done. Lines:', lines);
console.log('x-data="app()":', fixed.includes('x-data="app()"') ? 'OK' : 'MISSING');
console.log('window.app:', fixed.includes('window.app = function()') ? 'OK' : 'MISSING');
console.log('Alpine 3.14.1:', fixed.includes('alpinejs@3.14.1') ? 'OK' : 'MISSING');
console.log('No appStore:', !fixed.includes('x-data="appStore"') ? 'OK' : 'STILL PRESENT');
console.log('No alpine:init:', !fixed.includes('alpine:init') ? 'OK' : 'STILL PRESENT');
