// src/js/admin.js — Alpine.js store para el panel de administración
import supabase from './supabase-client.js';

const fmt = {
  price(n)  { return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); },
  date(iso) { return iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; },
  datetime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
};

document.addEventListener('alpine:init', () => {
  Alpine.data('adminApp', () => ({

    // ── Auth ─────────────────────────────────────────────────
    user: null,
    isAdmin: false,
    authLoading: false,
    authError: '',
    loginEmail: '', loginPassword: '',
    sidebarOpen: false,

    // ── View ─────────────────────────────────────────────────
    view: 'dashboard',  // dashboard | products | orders | users

    // ── Dashboard ─────────────────────────────────────────────
    kpis: null,
    kpisLoading: false,

    // ── Products ──────────────────────────────────────────────
    adminProducts: [],
    productsLoading: false,
    showProductForm: false,
    productFormMode: 'create',   // 'create' | 'edit'
    productFormId: null,
    productFormLoading: false,
    productImageFile: null,
    productImagePreview: null,
    productForm: {
      name: '', slug: '', description: '', long_description: '',
      price: '', compare_price: '', category: 'juguetes_educativos',
      age_min: '0', age_max: '99', stock: '0',
      featured: false, active: true,
      material: 'Madera maciza', dimensions: '',
    },
    productSearch: '',

    get filteredProducts() {
      if (!this.productSearch) return this.adminProducts;
      const q = this.productSearch.toLowerCase();
      return this.adminProducts.filter(p =>
        p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    },

    // ── Orders ────────────────────────────────────────────────
    adminOrders: [],
    ordersLoading: false,
    ordersStatusFilter: '',
    orderSearch: '',

    get filteredOrders() {
      let list = this.adminOrders;
      if (this.ordersStatusFilter) list = list.filter(o => o.status === this.ordersStatusFilter);
      if (this.orderSearch) {
        const q = this.orderSearch.toLowerCase();
        list = list.filter(o =>
          o.id.toLowerCase().includes(q) ||
          o.shipping_address?.full_name?.toLowerCase().includes(q) ||
          o.user_profile?.email?.toLowerCase().includes(q)
        );
      }
      return list;
    },

    // ── Users ─────────────────────────────────────────────────
    adminUsers: [],
    usersLoading: false,
    userSearch: '',

    get filteredUsers() {
      if (!this.userSearch) return this.adminUsers;
      const q = this.userSearch.toLowerCase();
      return this.adminUsers.filter(u =>
        u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q)
      );
    },

    // ── Toasts ────────────────────────────────────────────────
    toasts: [],

    // ════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════
    async init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.user = session.user;
        await this.checkAdmin();
      }

      supabase.auth.onAuthStateChange(async (_event, session) => {
        this.user = session?.user || null;
        if (this.user) await this.checkAdmin();
        else { this.isAdmin = false; }
      });
    },

    async checkAdmin() {
      if (!this.user) { this.isAdmin = false; return; }
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', this.user.id).single();
      this.isAdmin = data?.is_admin === true;
      if (this.isAdmin) await this.loadDashboard();
    },

    // ── Auth ─────────────────────────────────────────────────
    async login() {
      if (!this.loginEmail || !this.loginPassword) { this.authError = 'Completa los campos.'; return; }
      this.authLoading = true; this.authError = '';
      const { error } = await supabase.auth.signInWithPassword({ email: this.loginEmail, password: this.loginPassword });
      this.authLoading = false;
      if (error) this.authError = 'Credenciales incorrectas o no tienes acceso de administrador.';
    },

    async logout() {
      await supabase.auth.signOut();
      this.user = null; this.isAdmin = false;
    },

    async getToken() {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || '';
    },

    // ════════════════════════════════════════════════════════
    // VIEW NAVIGATION
    // ════════════════════════════════════════════════════════
    async setView(v) {
      this.view = v;
      this.sidebarOpen = false;
      if (v === 'dashboard')  await this.loadDashboard();
      if (v === 'products')   await this.loadProducts();
      if (v === 'orders')     await this.loadOrders();
      if (v === 'users')      await this.loadUsers();
    },

    // ════════════════════════════════════════════════════════
    // DASHBOARD
    // ════════════════════════════════════════════════════════
    async loadDashboard() {
      this.kpisLoading = true;
      try {
        const token = await this.getToken();
        const res   = await fetch('/api/admin/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) this.kpis = await res.json();
        else this.toast('Error cargando métricas.', 'error');
      } catch (_) {
        this.toast('Error de conexión.', 'error');
      } finally {
        this.kpisLoading = false;
      }
    },

    get revenueFormatted() {
      return this.kpis ? fmt.price(this.kpis.revenue?.month || 0) : '—';
    },

    topProductsMax() {
      if (!this.kpis?.top_products?.length) return 1;
      return Math.max(...this.kpis.top_products.map(p => p.quantity));
    },

    // ════════════════════════════════════════════════════════
    // PRODUCTS ADMIN
    // ════════════════════════════════════════════════════════
    async loadProducts() {
      this.productsLoading = true;
      try {
        const token = await this.getToken();
        const res   = await fetch('/api/admin/products', { headers: { 'Authorization': `Bearer ${token}` } });
        const data  = await res.json();
        this.adminProducts = data.products || [];
      } catch (_) {
        this.toast('Error cargando productos.', 'error');
      } finally {
        this.productsLoading = false;
      }
    },

    openCreateProduct() {
      this.productFormMode = 'create';
      this.productFormId   = null;
      this.productImageFile    = null;
      this.productImagePreview = null;
      this.productForm = {
        name: '', slug: '', description: '', long_description: '',
        price: '', compare_price: '', category: 'juguetes_educativos',
        age_min: '0', age_max: '99', stock: '0',
        featured: false, active: true,
        material: 'Madera maciza', dimensions: '',
      };
      this.showProductForm = true;
    },

    openEditProduct(product) {
      this.productFormMode = 'edit';
      this.productFormId   = product.id;
      this.productImageFile    = null;
      this.productImagePreview = product.images?.[0] || null;
      this.productForm = {
        name:             product.name,
        slug:             product.slug,
        description:      product.description     || '',
        long_description: product.long_description || '',
        price:            String(product.price),
        compare_price:    product.compare_price ? String(product.compare_price) : '',
        category:         product.category,
        age_min:          String(product.age_min ?? 0),
        age_max:          String(product.age_max ?? 99),
        stock:            String(product.stock),
        featured:         !!product.featured,
        active:           product.active !== false,
        material:         product.material   || 'Madera maciza',
        dimensions:       product.dimensions  || '',
      };
      this.showProductForm = true;
    },

    onImageSelected(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.productImageFile = file;
      const reader = new FileReader();
      reader.onload = e => { this.productImagePreview = e.target.result; };
      reader.readAsDataURL(file);
    },

    autoSlug() {
      this.productForm.slug = this.productForm.name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    },

    async saveProduct() {
      if (!this.productForm.name || !this.productForm.slug || !this.productForm.price || !this.productForm.category) {
        this.toast('Rellena los campos obligatorios: nombre, slug, precio y categoría.', 'error'); return;
      }
      this.productFormLoading = true;
      try {
        const token   = await this.getToken();
        let payload   = { ...this.productForm };

        // Convertir imagen a base64 si se ha seleccionado
        if (this.productImageFile) {
          payload.image_base64 = await this._fileToBase64(this.productImageFile);
        }

        const url    = this.productFormMode === 'create'
          ? '/api/admin/products'
          : `/api/admin/products?id=${this.productFormId}`;
        const method = this.productFormMode === 'create' ? 'POST' : 'PUT';

        const res  = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Error guardando producto.');

        this.toast(
          this.productFormMode === 'create' ? '✅ Producto creado correctamente.' : '✅ Producto actualizado.',
          'success'
        );
        this.showProductForm = false;
        await this.loadProducts();
      } catch (e) {
        this.toast(e.message, 'error');
      } finally {
        this.productFormLoading = false;
      }
    },

    async deleteProduct(id, name) {
      if (!confirm(`¿Desactivar el producto "${name}"? Dejará de ser visible en la tienda.`)) return;
      try {
        const token = await this.getToken();
        const res   = await fetch(`/api/admin/products?id=${id}`, {
          method:  'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          this.toast('Producto desactivado.', 'success');
          await this.loadProducts();
        }
      } catch (_) {
        this.toast('Error eliminando producto.', 'error');
      }
    },

    // ════════════════════════════════════════════════════════
    // ORDERS ADMIN
    // ════════════════════════════════════════════════════════
    async loadOrders() {
      this.ordersLoading = true;
      try {
        const token = await this.getToken();
        const res   = await fetch('/api/admin/orders?limit=100', { headers: { 'Authorization': `Bearer ${token}` } });
        const data  = await res.json();
        this.adminOrders = data.orders || [];
      } catch (_) {
        this.toast('Error cargando pedidos.', 'error');
      } finally {
        this.ordersLoading = false;
      }
    },

    async updateOrderStatus(orderId, status) {
      try {
        const token = await this.getToken();
        const res   = await fetch(`/api/admin/orders?id=${orderId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body:    JSON.stringify({ status }),
        });
        if (res.ok) {
          const order = this.adminOrders.find(o => o.id === orderId);
          if (order) order.status = status;
          this.toast('Estado del pedido actualizado.', 'success');
        }
      } catch (_) {
        this.toast('Error actualizando pedido.', 'error');
      }
    },

    // ════════════════════════════════════════════════════════
    // USERS ADMIN
    // ════════════════════════════════════════════════════════
    async loadUsers() {
      this.usersLoading = true;
      try {
        const token = await this.getToken();
        const res   = await fetch('/api/admin/users?limit=100', { headers: { 'Authorization': `Bearer ${token}` } });
        const data  = await res.json();
        this.adminUsers = data.users || [];
      } catch (_) {
        this.toast('Error cargando usuarios.', 'error');
      } finally {
        this.usersLoading = false;
      }
    },

    // ════════════════════════════════════════════════════════
    // UTILITIES
    // ════════════════════════════════════════════════════════
    _fileToBase64(file) {
      return new Promise((resolve, reject) => {
        // Comprimir si es demasiado grande (>2MB)
        if (file.size > 2 * 1024 * 1024) {
          const canvas = document.createElement('canvas');
          const img    = new Image();
          img.onload = () => {
            const MAX   = 1200;
            const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
            canvas.width  = Math.round(img.width  * ratio);
            canvas.height = Math.round(img.height * ratio);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        } else {
          const reader = new FileReader();
          reader.onload  = e => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }
      });
    },

    toast(message, type = 'info') {
      const id = Date.now() + Math.random();
      const t  = { id, message, type, visible: true };
      this.toasts.push(t);
      setTimeout(() => {
        t.visible = false;
        setTimeout(() => { this.toasts = this.toasts.filter(x => x.id !== id); }, 400);
      }, 3800);
    },

    // ── Format helpers ────────────────────────────────────────
    formatPrice(n)    { return fmt.price(n); },
    formatDate(iso)   { return fmt.date(iso); },
    formatDatetime(iso) { return fmt.datetime(iso); },

    formatCategory(slug) {
      const map = {
        juguetes_educativos:   '🧩 Juguetes Educativos',
        juegos_mesa:           '🎲 Juegos de Mesa',
        decoracion_habitacion: '🏡 Decoración',
        mobiliario_montessori: '🪑 Montessori',
        puzzles:               '🧸 Puzzles',
        construccion:          '🏗️ Construcción',
        exterior:              '🌳 Exterior',
      };
      return map[slug] || slug;
    },

    formatStatus(s) {
      const map = { pendiente: 'Pendiente', procesando: 'Procesando', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
      return map[s] || s;
    },

    orderTotal(order) {
      return this.formatPrice(order.total);
    },
  }));
});
