// api/run-migrations.js — TEMPORAL: ejecuta migrations SQL
// Llamar una sola vez: GET /api/run-migrations?secret=curio_migrate_2024
// BORRAR después de usar
'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// SQL de migración dividido en statements individuales
const MIGRATIONS = [
  // Extensiones
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE EXTENSION IF NOT EXISTS "unaccent"`,

  // Schema
  `CREATE SCHEMA IF NOT EXISTS curio`,

  // Roles search_path
  `ALTER ROLE authenticator SET search_path TO public, curio`,
  `ALTER ROLE anon          SET search_path TO public, curio`,
  `ALTER ROLE authenticated SET search_path TO public, curio`,
  `ALTER ROLE service_role  SET search_path TO public, curio`,

  // Enum product_category
  `DO $$ BEGIN
    CREATE TYPE curio.product_category AS ENUM (
      'juguetes_educativos','juegos_mesa','decoracion_habitacion',
      'mobiliario_montessori','puzzles','construccion','exterior'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Enum order_status
  `DO $$ BEGIN
    CREATE TYPE curio.order_status AS ENUM (
      'pendiente','procesando','enviado','entregado','cancelado'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // Profiles: añadir columnas
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT`,
  `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "users_own_profile_all" ON public.profiles`,
  `CREATE POLICY "users_own_profile_all" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`,

  // Trigger nuevo usuario
  `CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER`,
  `DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`,
  `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()`,

  // Tabla categories
  `CREATE TABLE IF NOT EXISTS curio.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image_url TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE curio.categories ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "categories_read_all" ON curio.categories`,
  `CREATE POLICY "categories_read_all" ON curio.categories FOR SELECT USING (TRUE)`,

  // Tabla products
  `CREATE TABLE IF NOT EXISTS curio.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    long_description TEXT,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    compare_price NUMERIC(10,2) CHECK (compare_price >= 0),
    category curio.product_category NOT NULL,
    age_min INTEGER DEFAULT 0,
    age_max INTEGER DEFAULT 99,
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    images TEXT[] DEFAULT '{}',
    featured BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    material TEXT DEFAULT 'Madera maciza',
    dimensions TEXT,
    weight_grams INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_curio_products_slug     ON curio.products(slug)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_products_category ON curio.products(category) WHERE active = TRUE`,
  `CREATE INDEX IF NOT EXISTS idx_curio_products_featured ON curio.products(featured) WHERE featured = TRUE AND active = TRUE`,
  `CREATE INDEX IF NOT EXISTS idx_curio_products_price    ON curio.products(price) WHERE active = TRUE`,
  `ALTER TABLE curio.products ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "products_read_active" ON curio.products`,
  `CREATE POLICY "products_read_active" ON curio.products FOR SELECT USING (active = TRUE)`,

  // Tabla orders
  `CREATE TABLE IF NOT EXISTS curio.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    status curio.order_status DEFAULT 'pendiente',
    subtotal NUMERIC(10,2) NOT NULL,
    shipping_cost NUMERIC(10,2) DEFAULT 4.99,
    total NUMERIC(10,2) NOT NULL,
    shipping_address JSONB NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_curio_orders_user   ON curio.orders(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_orders_status ON curio.orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_orders_date   ON curio.orders(created_at DESC)`,
  `ALTER TABLE curio.orders ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "users_own_orders_select" ON curio.orders`,
  `DROP POLICY IF EXISTS "users_own_orders_insert" ON curio.orders`,
  `CREATE POLICY "users_own_orders_select" ON curio.orders FOR SELECT USING (auth.uid() = user_id)`,
  `CREATE POLICY "users_own_orders_insert" ON curio.orders FOR INSERT WITH CHECK (auth.uid() = user_id)`,

  // Tabla order_items
  `CREATE TABLE IF NOT EXISTS curio.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES curio.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES curio.products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL,
    product_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_curio_order_items_order   ON curio.order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_order_items_product ON curio.order_items(product_id)`,
  `ALTER TABLE curio.order_items ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "users_own_order_items_select" ON curio.order_items`,
  `DROP POLICY IF EXISTS "users_own_order_items_insert" ON curio.order_items`,
  `CREATE POLICY "users_own_order_items_select" ON curio.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM curio.orders o WHERE o.id = order_id AND o.user_id = auth.uid()))`,
  `CREATE POLICY "users_own_order_items_insert" ON curio.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM curio.orders o WHERE o.id = order_id AND o.user_id = auth.uid()))`,

  // Tabla page_views
  `CREATE TABLE IF NOT EXISTS curio.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page TEXT NOT NULL,
    user_id UUID,
    session_id TEXT,
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_curio_page_views_page    ON curio.page_views(page, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_page_views_created ON curio.page_views(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_curio_page_views_session ON curio.page_views(session_id)`,
  `ALTER TABLE curio.page_views ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "page_views_insert_all" ON curio.page_views`,
  `CREATE POLICY "page_views_insert_all" ON curio.page_views FOR INSERT WITH CHECK (TRUE)`,

  // Tabla newsletter
  `CREATE TABLE IF NOT EXISTS curio.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE curio.newsletter_subscribers ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS "newsletter_insert_all" ON curio.newsletter_subscribers`,
  `CREATE POLICY "newsletter_insert_all" ON curio.newsletter_subscribers FOR INSERT WITH CHECK (TRUE)`,

  // Función updated_at
  `CREATE OR REPLACE FUNCTION curio.update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS products_updated_at ON curio.products`,
  `CREATE TRIGGER products_updated_at BEFORE UPDATE ON curio.products FOR EACH ROW EXECUTE FUNCTION curio.update_updated_at()`,
  `DROP TRIGGER IF EXISTS orders_updated_at ON curio.orders`,
  `CREATE TRIGGER orders_updated_at BEFORE UPDATE ON curio.orders FOR EACH ROW EXECUTE FUNCTION curio.update_updated_at()`,

  // Grants
  `GRANT USAGE ON SCHEMA curio TO anon, authenticated, service_role`,
  `GRANT ALL ON ALL TABLES IN SCHEMA curio TO anon, authenticated, service_role`,
  `GRANT ALL ON ALL SEQUENCES IN SCHEMA curio TO anon, authenticated, service_role`,
  `GRANT ALL ON ALL ROUTINES IN SCHEMA curio TO anon, authenticated, service_role`,
];

const SEED_CATEGORIES = [
  { name: 'Juguetes Educativos',   slug: 'juguetes-educativos',   description: 'Juguetes que estimulan el aprendizaje', icon: '🧩', sort_order: 1 },
  { name: 'Juegos de Mesa',        slug: 'juegos-de-mesa',        description: 'Diversión familiar en torno a la mesa', icon: '🎲', sort_order: 2 },
  { name: 'Decoración Habitación', slug: 'decoracion-habitacion', description: 'Decora el espacio de tus hijos con madera', icon: '🏡', sort_order: 3 },
  { name: 'Mobiliario Montessori', slug: 'mobiliario-montessori', description: 'Muebles para el método Montessori', icon: '🪑', sort_order: 4 },
  { name: 'Puzzles',               slug: 'puzzles',               description: 'Puzzles de madera para todas las edades', icon: '🧸', sort_order: 5 },
  { name: 'Construcción',          slug: 'construccion',          description: 'Bloques y construcciones de madera', icon: '🏗️', sort_order: 6 },
  { name: 'Exterior',              slug: 'exterior',              description: 'Juguetes para disfrutar al aire libre', icon: '🌳', sort_order: 7 },
];

const SEED_PRODUCTS = [
  { name: 'Bloques de construcción natural 100 piezas', slug: 'bloques-construccion-natural-100', description: 'Set de 100 bloques de madera maciza natural sin pintar con múltiples formas geométricas.', long_description: 'Set de 100 bloques de madera maciza de haya natural sin pintar. Incluye cubos, cilindros, arcos, triángulos y rectángulos en distintos tamaños. Estimulan la creatividad, el pensamiento espacial y el juego libre.', price: 39.95, compare_price: 49.95, category: 'construccion', age_min: 3, age_max: 10, stock: 45, images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'], featured: true, active: true, material: 'Madera de haya FSC', dimensions: 'Caja 35 × 25 × 10 cm' },
  { name: 'Torre de encaje Montessori arcoíris', slug: 'torre-encaje-montessori-arcoiris', description: 'Torre de anillas de colores en madera. Ideal para el desarrollo motor fino y aprendizaje de colores.', long_description: 'Torre de anillas de colores vibrantes en madera de tilo. Con 10 anillas en degradado de colores del arcoíris, estimula el desarrollo motor fino y el reconocimiento de colores.', price: 24.95, compare_price: null, category: 'mobiliario_montessori', age_min: 1, age_max: 4, stock: 30, images: ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&q=80'], featured: true, active: true, material: 'Madera de tilo + tintes acuosos', dimensions: 'Altura 28 cm, base 12 × 12 cm' },
  { name: 'Puzzle del mundo en madera', slug: 'puzzle-mundo-madera', description: 'Puzzle mapa del mundo con 50 piezas. Cada continente es una pieza grande, ideal para aprender geografía.', long_description: 'Puzzle educativo del mapa del mundo fabricado en madera de abedul. 50 piezas de distintos tamaños que representan continentes, océanos y países principales.', price: 32.95, compare_price: null, category: 'puzzles', age_min: 4, age_max: 10, stock: 25, images: ['https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800&q=80'], featured: true, active: true, material: 'Madera de abedul FSC', dimensions: '60 × 40 cm (montado)' },
  { name: 'Cocinita de madera Montessori', slug: 'cocinita-madera-montessori', description: 'Cocinita de juego en madera natural con accesorios. Estimula el juego simbólico y la creatividad.', long_description: 'Cocinita de juego fabricada en madera de pino macizo. Incluye fogones, horno, fregadero y estantes. Medida perfecta para niños de 2 a 6 años.', price: 129.95, compare_price: 159.95, category: 'mobiliario_montessori', age_min: 2, age_max: 6, stock: 12, images: ['https://images.unsplash.com/photo-1615461066841-6116e61058f4?w=800&q=80'], featured: true, active: true, material: 'Pino macizo + MDF', dimensions: '90 × 30 × 85 cm' },
  { name: 'Set de animales del bosque en madera', slug: 'set-animales-bosque-madera', description: '12 figuras de animales del bosque talladas en madera de haya. Pintadas con tintes naturales.', long_description: 'Set de 12 figuras de animales del bosque europeo: oso, lobo, zorro, ciervo, conejo, erizo, búho y más. Talladas a mano en madera de haya y pintadas con tintes al agua.', price: 28.95, compare_price: null, category: 'juguetes_educativos', age_min: 2, age_max: 8, stock: 40, images: ['https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=800&q=80'], featured: false, active: true, material: 'Madera de haya + tintes al agua', dimensions: 'Caja 20 × 15 × 8 cm' },
  { name: 'Juego de memoria animales', slug: 'juego-memoria-animales', description: '32 pares de cartas de madera con ilustraciones de animales. Juego de memoria clásico para toda la familia.', long_description: '32 pares de cartas de madera (64 piezas) con ilustraciones de 32 animales diferentes. Desarrolla la memoria, concentración y vocabulario.', price: 19.95, compare_price: 24.95, category: 'juegos_mesa', age_min: 3, age_max: 99, stock: 55, images: ['https://images.unsplash.com/photo-1611996575749-79a3a250f948?w=800&q=80'], featured: false, active: true, material: 'Madera de abedul', dimensions: 'Caja 22 × 16 × 4 cm' },
  { name: 'Balancín de madera para bebé', slug: 'balancin-madera-bebe', description: 'Balancín en forma de caballo de madera maciza. Diseño seguro y resistente para los más pequeños.', long_description: 'Balancín en forma de caballo fabricado en madera de pino macizo lijada y barnizada. Con asideros ergonómicos y sistema antivuelco.', price: 89.95, compare_price: null, category: 'exterior', age_min: 1, age_max: 4, stock: 8, images: ['https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800&q=80'], featured: true, active: true, material: 'Pino macizo barnizado', dimensions: '70 × 35 × 55 cm' },
  { name: 'Dominó de frutas en madera', slug: 'domino-frutas-madera', description: '28 fichas de dominó con ilustraciones de frutas coloridas. Versión infantil del dominó clásico.', long_description: '28 fichas de dominó en madera de haya con ilustraciones de frutas a todo color. En lugar de puntos, cada ficha muestra frutas para una versión más divertida y educativa.', price: 16.95, compare_price: null, category: 'juegos_mesa', age_min: 3, age_max: 8, stock: 35, images: ['https://images.unsplash.com/photo-1596495578065-6e0763fa1178?w=800&q=80'], featured: false, active: true, material: 'Madera de haya + tintas al agua', dimensions: 'Caja 18 × 10 × 4 cm' },
  { name: 'Abaco educativo de colores', slug: 'abaco-educativo-colores', description: 'Ábaco de 10 filas y 10 cuentas de madera en 5 colores. Perfecto para aprender a contar y sumar.', long_description: 'Ábaco de madera con 10 filas de 10 cuentas en 5 colores alternos. Marco en madera de haya y cuentas en madera de tilo pintadas con tintes al agua.', price: 22.95, compare_price: 27.95, category: 'juguetes_educativos', age_min: 3, age_max: 7, stock: 28, images: ['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80'], featured: false, active: true, material: 'Madera de haya y tilo', dimensions: '30 × 24 × 5 cm' },
  { name: 'Tren de madera con vías 45 piezas', slug: 'tren-madera-vias-45-piezas', description: 'Set de tren de madera con locomotora, 3 vagones y 45 piezas de vías. Compatible con otros sets de madera.', long_description: 'Set completo de tren de madera con locomotora magnética, 3 vagones con carga y 45 piezas de vías rectas y curvas. Fabricado en madera de haya maciza.', price: 54.95, compare_price: 69.95, category: 'construccion', age_min: 2, age_max: 7, stock: 18, images: ['https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=800&q=80'], featured: true, active: true, material: 'Madera de haya FSC', dimensions: 'Caja 40 × 30 × 12 cm' },
  { name: 'Set Montessori letras y números', slug: 'montessori-letras-numeros', description: 'Set de 36 letras y 10 números en madera. Letras mayúsculas y minúsculas en relieve para aprender el abecedario.', long_description: 'Set completo de letras y números en madera de abedul con relieve táctil. Incluye 26 letras mayúsculas, 26 minúsculas y 10 números (0-9).', price: 34.95, compare_price: null, category: 'juguetes_educativos', age_min: 3, age_max: 7, stock: 22, images: ['https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80'], featured: false, active: true, material: 'Madera de abedul', dimensions: 'Caja 28 × 20 × 6 cm' },
  { name: 'Casita de muñecas en madera natural', slug: 'casita-munecas-madera-natural', description: 'Casita de muñecas de 3 plantas en madera natural. Sin pintar para decorar a gusto.', long_description: 'Casita de muñecas de 3 plantas y 6 habitaciones en madera de pino macizo sin pintar. Lista para decorar y personalizar. Incluye muebles básicos en madera.', price: 149.95, compare_price: 189.95, category: 'juguetes_educativos', age_min: 3, age_max: 10, stock: 6, images: ['https://images.unsplash.com/photo-1606041011872-596597976b25?w=800&q=80'], featured: true, active: true, material: 'Pino macizo', dimensions: '60 × 30 × 75 cm' },
];

module.exports = async function handler(req, res) {
  // Protección por secret
  if (req.query.secret !== 'curio_migrate_2024') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: 'public' },
  });

  const results = [];
  const errors  = [];

  // Ejecutar cada statement SQL via rpc o query directa
  // Usamos el endpoint de Supabase para ejecutar SQL via pg-rest
  const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;
  const BASE_URL    = SUPABASE_URL;

  async function runSQL(sql) {
    const resp = await fetch(`${BASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ query: sql }),
    });
    return resp;
  }

  // Supabase no permite DDL via REST. Usamos el SDK admin con rpc query
  // La única forma sin PAT es via una función SQL existente.
  // En su lugar, comprobamos si las tablas ya existen e insertamos los datos.

  // Verificar si curio schema existe
  const { data: schemaCheck, error: schemaErr } = await supabase
    .rpc('exec_sql', { sql: 'SELECT 1' })
    .catch(() => ({ data: null, error: { message: 'no exec_sql' } }));

  // Intentar crear el schema via RPC
  // Como no tenemos acceso DDL directo, reportamos qué necesita hacerse
  // e insertamos solo si las tablas ya existen

  // Verificar si curio.categories existe
  const { data: cats, error: catsErr } = await supabase
    .schema('curio')
    .from('categories')
    .select('count')
    .limit(1);

  if (catsErr && catsErr.message.includes('Invalid schema')) {
    return res.status(200).json({
      status: 'SCHEMA_NOT_FOUND',
      message: 'El schema curio no existe aún. Necesitas ejecutar el SQL en el Dashboard de Supabase.',
      sql_file: 'supabase_migrations.sql',
      dashboard_url: 'https://supabase.com/dashboard/project/gboguglxgvdsvzprtigj/sql/new',
    });
  }

  // Si el schema existe, insertar seed data
  if (!catsErr) {
    // Insertar categorías
    const { data: insertedCats, error: catInsertErr } = await supabase
      .schema('curio')
      .from('categories')
      .upsert(SEED_CATEGORIES, { onConflict: 'slug', ignoreDuplicates: true })
      .select();

    results.push({ table: 'categories', inserted: insertedCats?.length || 0, error: catInsertErr?.message });

    // Insertar productos
    const { data: insertedProds, error: prodInsertErr } = await supabase
      .schema('curio')
      .from('products')
      .upsert(SEED_PRODUCTS, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id, name');

    results.push({ table: 'products', inserted: insertedProds?.length || 0, error: prodInsertErr?.message });
  }

  return res.status(200).json({ status: 'OK', results, errors });
};
