// src/js/app.js — Alpine.js store para la tienda pública de Curio by Fable
import supabase from './supabase-client.js';

// ── Utilidades de formato ────────────────────────────────────
const fmt = {
  price(n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  },
  date(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  },
  category(slug) {
    const map = {
      juguetes_educativos:   'Juguetes Educativos',
      juegos_mesa:           'Juegos de Mesa',
      decoracion_habitacion: 'Decoración Habitación',
      mobiliario_montessori: 'Mobiliario Montessori',
      puzzles:               'Puzzles',
      construccion:          'Construcción',
      exterior:              'Exterior',
    };
    return map[slug] || slug;
  },
  age(min, max) {
    if (min == null) return '';
    if (max >= 99) return `+${min} años`;
    if (min === max) return `${min} años`;
    return `${min}–${max} años`;
  },
  statusLabel(s) {
    const map = { pendiente: 'Pendiente', procesando: 'Procesando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
    return map[s] || s;
  },
};

const CART_KEY    = 'curio_cart';
const SESSION_KEY = 'curio_sid';

// ── Reveal animation observer ─────────────────────────────────
function initReveal() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('revealed'); observer.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({

    // ── Auth ─────────────────────────────────────────────────
    user: null,
    showAuthModal: false,
    authView: 'login',      // 'login' | 'register'
    authLoading: false,
    authError: '',
    loginEmail: '', loginPassword: '',
    registerName: '', registerEmail: '', registerPassword: '',
    afterAuthRedirect: null,

    // ── Navigation ────────────────────────────────────────────
    currentView: 'home',
    navScrolled: false,
    megaMenuOpen: false,
    mobileMenuOpen: false,

    // ── Categories ────────────────────────────────────────────
    categories: [],

    // ── Products / Catalog ────────────────────────────────────
    featuredProducts: [],
    products: [],
    productsLoading: false,
    productsTotal: 0,
    productsPage: 1,
    productsTotalPages: 1,
    filters: {
      category: '',
      search:   '',
      sort:     'newest',
    },
    searchQuery: '',

    // ── Product detail ────────────────────────────────────────
    currentProduct: null,
    currentProductLoading: false,
    selectedQty: 1,
    selectedImageIdx: 0,

    // ── Cart ─────────────────────────────────────────────────
    cartItems: [],
    cartOpen: false,

    get cartCount() {
      return this.cartItems.reduce((s, i) => s + i.quantity, 0);
    },
    get cartSubtotal() {
      return this.cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
    },
    get cartShipping() {
      return this.cartSubtotal >= 50 ? 0 : 4.99;
    },
    get cartTotal() {
      return this.cartSubtotal + this.cartShipping;
    },

    // ── Checkout ─────────────────────────────────────────────
    checkoutStep: 1,          // 1=address, 2=confirm
    checkoutLoading: false,
    lastOrderId: null,
    shippingForm: {
      full_name: '', address_line1: '', address_line2: '',
      city: '', province: '', postal_code: '', phone: '',
    },

    // ── Orders / Profile ──────────────────────────────────────
    userOrders: [],
    ordersLoading: false,

    // ── Newsletter ────────────────────────────────────────────
    newsletterEmail: '',
    newsletterLoading: false,
    newsletterDone: false,

    // ── Toasts ────────────────────────────────────────────────
    toasts: [],

    // ════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════
    async init() {
      // Restaurar sesión
      const { data: { session } } = await supabase.auth.getSession();
      this.user = session?.user || null;

      supabase.auth.onAuthStateChange((_event, session) => {
        this.user = session?.user || null;
        if (this.afterAuthRedirect && this.user) {
          const dest = this.afterAuthRedirect;
          this.afterAuthRedirect = null;
          this.showAuthModal = false;
          this.navigate(dest);
        }
      });

      // Restaurar carrito
      this._loadCart();

      // Nav scroll listener
      window.addEventListener('scroll', () => {
        this.navScrolled = window.scrollY > 20;
      }, { passive: true });

      // Routing basado en hash
      this._handleRoute(location.hash);
      window.addEventListener('hashchange', () => this._handleRoute(location.hash));

      // Cargar categorías
      await this.loadCategories();

      // Reveal animations
      setTimeout(initReveal, 300);
    },

    // ── Router ───────────────────────────────────────────────
    async _handleRoute(hash) {
      const path = hash.replace('#', '') || '/';
      this._trackView(path);
      this.cartOpen = false;
      this.mobileMenuOpen = false;

      if (path === '/' || path === '') {
        this.currentView = 'home';
        this.loadFeaturedProducts();
      } else if (path === '/catalogo' || path.startsWith('/catalogo?')) {
        this.currentView = 'catalog';
        // Parsear filtros de la URL
        const params = new URLSearchParams(path.split('?')[1] || '');
        if (params.get('category')) this.filters.category = params.get('category');
        await this.loadProducts();
      } else if (path.startsWith('/producto/')) {
        const slug = path.split('/producto/')[1].split('?')[0];
        this.currentView = 'product';
        this.selectedQty = 1;
        this.selectedImageIdx = 0;
        await this.loadProduct(slug);
      } else if (path === '/carrito') {
        this.currentView = 'cart';
      } else if (path === '/checkout') {
        if (!this.user) { this.afterAuthRedirect = '/checkout'; this.showAuthModal = true; location.hash = '#/'; return; }
        this.currentView = 'checkout';
        this.checkoutStep = 1;
        if (this.user) {
          // Pre-llenar nombre del usuario
          const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', this.user.id).single();
          if (profile?.full_name) this.shippingForm.full_name = profile.full_name;
          if (profile?.phone) this.shippingForm.phone = profile.phone;
        }
      } else if (path === '/perfil') {
        if (!this.user) { this.navigate('/'); return; }
        this.currentView = 'profile';
        await this.loadOrders();
      } else if (path.startsWith('/pedido-confirmado/')) {
        this.lastOrderId = path.split('/pedido-confirmado/')[1];
        this.currentView = 'order-success';
        setTimeout(initReveal, 100);
      } else {
        this.currentView = 'home';
        this.loadFeaturedProducts();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(initReveal, 300);
    },

    navigate(path) {
      location.hash = '#' + path;
    },

    // ════════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════════
    async login() {
      if (!this.loginEmail || !this.loginPassword) {
        this.authError = 'Por favor, completa todos los campos.'; return;
      }
      this.authLoading = true;
      this.authError = '';
      const { error } = await supabase.auth.signInWithPassword({
        email: this.loginEmail.trim(),
        password: this.loginPassword,
      });
      this.authLoading = false;
      if (error) {
        this.authError = 'Email o contraseña incorrectos.';
      } else {
        this.showAuthModal = false;
        this.loginEmail = ''; this.loginPassword = '';
        this.toast('¡Bienvenido de vuelta!', 'success');
      }
    },

    async register() {
      if (!this.registerName || !this.registerEmail || !this.registerPassword) {
        this.authError = 'Por favor, completa todos los campos.'; return;
      }
      if (this.registerPassword.length < 8) {
        this.authError = 'La contraseña debe tener al menos 8 caracteres.'; return;
      }
      this.authLoading = true;
      this.authError = '';
      const { error } = await supabase.auth.signUp({
        email: this.registerEmail.trim(),
        password: this.registerPassword,
        options: {
          data: { full_name: this.registerName.trim() },
        },
      });
      this.authLoading = false;
      if (error) {
        this.authError = error.message.includes('already') ? 'Este email ya está registrado.' : 'Error al registrarse. Inténtalo de nuevo.';
      } else {
        this.showAuthModal = false;
        this.registerName = ''; this.registerEmail = ''; this.registerPassword = '';
        this.toast('¡Registro exitoso! Revisa tu email para verificar tu cuenta.', 'success');
      }
    },

    async loginWithGoogle() {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/#/' },
      });
    },

    async logout() {
      await supabase.auth.signOut();
      this.navigate('/');
      this.toast('Sesión cerrada correctamente.', 'info');
    },

    openLogin()    { this.authView = 'login';    this.authError = ''; this.showAuthModal = true; },
    openRegister() { this.authView = 'register'; this.authError = ''; this.showAuthModal = true; },

    // ════════════════════════════════════════════════════════
    // CATEGORIES
    // ════════════════════════════════════════════════════════
    async loadCategories() {
      try {
        const res  = await fetch('/api/categories');
        const data = await res.json();
        this.categories = data.categories || [];
      } catch (_) {
        this.categories = [];
      }
    },

    // ════════════════════════════════════════════════════════
    // PRODUCTS
    // ════════════════════════════════════════════════════════
    async loadFeaturedProducts() {
      if (this.featuredProducts.length) return;
      try {
        const res  = await fetch('/api/products?featured=true&limit=8');
        const data = await res.json();
        this.featuredProducts = data.products || [];
      } catch (_) {}
    },

    async loadProducts(page = 1) {
      this.productsLoading = true;
      this.productsPage    = page;
      try {
        const params = new URLSearchParams({
          page:     String(page),
          limit:    '20',
          sort:     this.filters.sort,
          ...(this.filters.category && { category: this.filters.category }),
          ...(this.filters.search   && { search:   this.filters.search }),
        });
        const res  = await fetch('/api/products?' + params.toString());
        const data = await res.json();
        this.products          = data.products    || [];
        this.productsTotal     = data.total        || 0;
        this.productsTotalPages = data.totalPages  || 1;
      } catch (e) {
        this.toast('Error cargando productos.', 'error');
      } finally {
        this.productsLoading = false;
      }
    },

    async loadProduct(slug) {
      this.currentProduct        = null;
      this.currentProductLoading = true;
      try {
        const res = await fetch('/api/product?slug=' + encodeURIComponent(slug));
        if (!res.ok) throw new Error('not found');
        this.currentProduct = await res.json();
      } catch (_) {
        this.toast('Producto no encontrado.', 'error');
        this.navigate('/catalogo');
      } finally {
        this.currentProductLoading = false;
      }
    },

    setFilter(key, value) {
      this.filters[key] = value;
      this.loadProducts(1);
    },

    clearFilters() {
      this.filters = { category: '', search: '', sort: 'newest' };
      this.searchQuery = '';
      this.loadProducts(1);
    },

    searchProducts() {
      this.filters.search = this.searchQuery;
      if (this.currentView !== 'catalog') this.navigate('/catalogo');
      else this.loadProducts(1);
    },

    // ════════════════════════════════════════════════════════
    // CART
    // ════════════════════════════════════════════════════════
    addToCart(product, qty = 1) {
      const quantity = Math.max(1, parseInt(qty) || 1);
      const existing = this.cartItems.find(i => i.product_id === product.id);
      if (existing) {
        existing.quantity += quantity;
      } else {
        this.cartItems.push({
          product_id: product.id,
          name:       product.name,
          slug:       product.slug,
          price:      product.price,
          image_url:  product.images?.[0] || null,
          quantity,
        });
      }
      this._saveCart();
      this.toast(`${product.name} añadido al carrito 🛒`, 'success');
      this.cartOpen = true;
    },

    removeFromCart(productId) {
      this.cartItems = this.cartItems.filter(i => i.product_id !== productId);
      this._saveCart();
    },

    updateQty(productId, qty) {
      const item = this.cartItems.find(i => i.product_id === productId);
      if (!item) return;
      const quantity = parseInt(qty);
      if (quantity <= 0) this.removeFromCart(productId);
      else { item.quantity = quantity; this._saveCart(); }
    },

    incrementQty(productId) {
      const item = this.cartItems.find(i => i.product_id === productId);
      if (item) { item.quantity++; this._saveCart(); }
    },

    decrementQty(productId) {
      const item = this.cartItems.find(i => i.product_id === productId);
      if (!item) return;
      if (item.quantity <= 1) this.removeFromCart(productId);
      else { item.quantity--; this._saveCart(); }
    },

    _saveCart() {
      try { localStorage.setItem(CART_KEY, JSON.stringify(this.cartItems)); } catch (_) {}
    },
    _loadCart() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        if (raw) this.cartItems = JSON.parse(raw);
      } catch (_) {}
    },
    clearCart() {
      this.cartItems = [];
      localStorage.removeItem(CART_KEY);
    },

    goToCheckout() {
      this.cartOpen = false;
      if (!this.user) {
        this.afterAuthRedirect = '/checkout';
        this.openLogin();
        return;
      }
      this.navigate('/checkout');
    },

    // ════════════════════════════════════════════════════════
    // CHECKOUT
    // ════════════════════════════════════════════════════════
    validateShipping() {
      const f = this.shippingForm;
      if (!f.full_name || !f.address_line1 || !f.city || !f.postal_code || !f.phone) {
        this.toast('Por favor, completa todos los campos obligatorios.', 'error');
        return false;
      }
      if (!/^\d{5}$/.test(f.postal_code)) {
        this.toast('El código postal debe tener 5 dígitos.', 'error');
        return false;
      }
      return true;
    },

    goToConfirm() {
      if (this.validateShipping()) this.checkoutStep = 2;
    },

    async submitOrder() {
      if (!this.user) { this.openLogin(); return; }
      if (!this.cartItems.length) { this.toast('El carrito está vacío.', 'error'); return; }

      this.checkoutLoading = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch('/api/orders', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify({
            items: this.cartItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
            shipping_address: this.shippingForm,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al procesar el pedido.');

        this.clearCart();
        this.navigate('/pedido-confirmado/' + data.order_id);
      } catch (e) {
        this.toast(e.message, 'error');
      } finally {
        this.checkoutLoading = false;
      }
    },

    // ════════════════════════════════════════════════════════
    // PROFILE / ORDERS
    // ════════════════════════════════════════════════════════
    async loadOrders() {
      this.ordersLoading = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res  = await fetch('/api/orders', { headers: { 'Authorization': `Bearer ${session?.access_token}` } });
        const data = await res.json();
        this.userOrders = data.orders || [];
      } catch (_) {} finally {
        this.ordersLoading = false;
      }
    },

    // ════════════════════════════════════════════════════════
    // NEWSLETTER
    // ════════════════════════════════════════════════════════
    async subscribeNewsletter() {
      if (!this.newsletterEmail || !this.newsletterEmail.includes('@')) {
        this.toast('Por favor, introduce un email válido.', 'error'); return;
      }
      this.newsletterLoading = true;
      try {
        const res  = await fetch('/api/newsletter', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email: this.newsletterEmail }),
        });
        const data = await res.json();
        if (data.already) {
          this.toast('Este email ya está suscrito 😊', 'info');
        } else {
          this.newsletterDone  = true;
          this.newsletterEmail = '';
          this.toast('¡Gracias! Te has suscrito correctamente.', 'success');
        }
      } catch (_) {
        this.toast('Error al suscribirse. Inténtalo de nuevo.', 'error');
      } finally {
        this.newsletterLoading = false;
      }
    },

    // ════════════════════════════════════════════════════════
    // PAGE VIEW TRACKING
    // ════════════════════════════════════════════════════════
    _trackView(page) {
      let sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, sid); }
      fetch('/api/track-view', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ page, session_id: sid, user_id: this.user?.id || null }),
      }).catch(() => {});
    },

    // ════════════════════════════════════════════════════════
    // TOASTS
    // ════════════════════════════════════════════════════════
    toast(message, type = 'info') {
      const id = Date.now() + Math.random();
      const t  = { id, message, type, visible: true };
      this.toasts.push(t);
      setTimeout(() => {
        t.visible = false;
        setTimeout(() => { this.toasts = this.toasts.filter(x => x.id !== id); }, 400);
      }, 3800);
    },

    // ════════════════════════════════════════════════════════
    // FORMAT HELPERS (expuestos al template)
    // ════════════════════════════════════════════════════════
    formatPrice(n)          { return fmt.price(n); },
    formatDate(iso)         { return fmt.date(iso); },
    formatCategory(slug)    { return fmt.category(slug); },
    formatAge(min, max)     { return fmt.age(min, max); },
    formatStatus(s)         { return fmt.statusLabel(s); },

    // Discount %
    discountPct(price, compare) {
      if (!compare || compare <= price) return 0;
      return Math.round((1 - price / compare) * 100);
    },
  }));
});
