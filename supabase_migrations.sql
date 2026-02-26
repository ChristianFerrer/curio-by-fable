-- ============================================================
-- CURIO BY FABLE — Supabase Migration v1.1
-- Schema separado "curio" para coexistir con Smarket en el mismo proyecto
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── SCHEMA CURIO ────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS curio;

-- Exponer el schema curio en la API REST de Supabase
-- (Supabase expone por defecto public + cualquier schema en search_path)
DO $$
BEGIN
  -- Añadir curio al search_path si no está
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_settings
    WHERE name = 'search_path' AND setting LIKE '%curio%'
  ) THEN
    ALTER ROLE authenticator SET search_path TO public, curio;
    ALTER ROLE anon          SET search_path TO public, curio;
    ALTER ROLE authenticated SET search_path TO public, curio;
    ALTER ROLE service_role  SET search_path TO public, curio;
  END IF;
END $$;

-- ── ENUMS ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE curio.product_category AS ENUM (
    'juguetes_educativos',
    'juegos_mesa',
    'decoracion_habitacion',
    'mobiliario_montessori',
    'puzzles',
    'construccion',
    'exterior'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE curio.order_status AS ENUM (
    'pendiente',
    'procesando',
    'enviado',
    'entregado',
    'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── PERFILES CURIO (extiende public.profiles) ───────────────
-- En vez de crear una tabla nueva, añadimos columnas a public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Asegurarse de que RLS está habilitado
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_profile_all" ON public.profiles;
CREATE POLICY "users_own_profile_all"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-crear perfil al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── CATEGORÍAS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curio.categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url   TEXT,
  icon        TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE curio.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_read_all" ON curio.categories;
CREATE POLICY "categories_read_all"
  ON curio.categories FOR SELECT USING (TRUE);

-- ── PRODUCTOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curio.products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  long_description TEXT,
  price            NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  compare_price    NUMERIC(10,2) CHECK (compare_price >= 0),
  category         curio.product_category NOT NULL,
  age_min          INTEGER DEFAULT 0,
  age_max          INTEGER DEFAULT 99,
  stock            INTEGER DEFAULT 0 CHECK (stock >= 0),
  images           TEXT[] DEFAULT '{}',
  featured         BOOLEAN DEFAULT FALSE,
  active           BOOLEAN DEFAULT TRUE,
  material         TEXT DEFAULT 'Madera maciza',
  dimensions       TEXT,
  weight_grams     INTEGER,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curio_products_slug     ON curio.products(slug);
CREATE INDEX IF NOT EXISTS idx_curio_products_category ON curio.products(category) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_curio_products_featured ON curio.products(featured) WHERE featured = TRUE AND active = TRUE;
CREATE INDEX IF NOT EXISTS idx_curio_products_price    ON curio.products(price) WHERE active = TRUE;

ALTER TABLE curio.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read_active" ON curio.products;
CREATE POLICY "products_read_active"
  ON curio.products FOR SELECT USING (active = TRUE);

-- ── PEDIDOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curio.orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  status           curio.order_status DEFAULT 'pendiente',
  subtotal         NUMERIC(10,2) NOT NULL,
  shipping_cost    NUMERIC(10,2) DEFAULT 4.99,
  total            NUMERIC(10,2) NOT NULL,
  shipping_address JSONB NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curio_orders_user   ON curio.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curio_orders_status ON curio.orders(status);
CREATE INDEX IF NOT EXISTS idx_curio_orders_date   ON curio.orders(created_at DESC);

ALTER TABLE curio.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_orders_select" ON curio.orders;
DROP POLICY IF EXISTS "users_own_orders_insert" ON curio.orders;
CREATE POLICY "users_own_orders_select"
  ON curio.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_orders_insert"
  ON curio.orders FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── LÍNEAS DE PEDIDO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curio.order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES curio.orders(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES curio.products(id) ON DELETE SET NULL,
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price       NUMERIC(10,2) NOT NULL,
  product_snapshot JSONB NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curio_order_items_order   ON curio.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_curio_order_items_product ON curio.order_items(product_id);

ALTER TABLE curio.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_order_items_select" ON curio.order_items;
DROP POLICY IF EXISTS "users_own_order_items_insert" ON curio.order_items;

CREATE POLICY "users_own_order_items_select"
  ON curio.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM curio.orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "users_own_order_items_insert"
  ON curio.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM curio.orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

-- ── VISITAS (analíticas anónimas) ────────────────────────────
CREATE TABLE IF NOT EXISTS curio.page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page        TEXT NOT NULL,
  user_id     UUID,
  session_id  TEXT,
  referrer    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curio_page_views_page    ON curio.page_views(page, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curio_page_views_created ON curio.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curio_page_views_session ON curio.page_views(session_id);

ALTER TABLE curio.page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_views_insert_all" ON curio.page_views;
CREATE POLICY "page_views_insert_all"
  ON curio.page_views FOR INSERT WITH CHECK (TRUE);

-- ── NEWSLETTER ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS curio.newsletter_subscribers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE curio.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "newsletter_insert_all" ON curio.newsletter_subscribers;
CREATE POLICY "newsletter_insert_all"
  ON curio.newsletter_subscribers FOR INSERT WITH CHECK (TRUE);

-- ── FUNCIÓN: updated_at automático ───────────────────────────
CREATE OR REPLACE FUNCTION curio.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON curio.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON curio.products
  FOR EACH ROW EXECUTE FUNCTION curio.update_updated_at();

DROP TRIGGER IF EXISTS orders_updated_at ON curio.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON curio.orders
  FOR EACH ROW EXECUTE FUNCTION curio.update_updated_at();

-- ── Exponer schema curio en la API REST de Supabase ──────────
-- Necesario para que las APIs serverless puedan acceder via service_role
GRANT USAGE ON SCHEMA curio TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA curio TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA curio TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA curio TO anon, authenticated, service_role;

-- ============================================================
-- SEED: Categorías
-- ============================================================
INSERT INTO curio.categories (name, slug, description, icon, sort_order) VALUES
  ('Juguetes Educativos',   'juguetes-educativos',   'Juguetes que estimulan el aprendizaje', '🧩', 1),
  ('Juegos de Mesa',        'juegos-de-mesa',        'Diversión familiar en torno a la mesa', '🎲', 2),
  ('Decoración Habitación', 'decoracion-habitacion', 'Decora el espacio de tus hijos con madera', '🏡', 3),
  ('Mobiliario Montessori', 'mobiliario-montessori', 'Muebles para el método Montessori', '🪑', 4),
  ('Puzzles',               'puzzles',               'Puzzles de madera para todas las edades', '🧸', 5),
  ('Construcción',          'construccion',          'Bloques y construcciones de madera', '🏗️', 6),
  ('Exterior',              'exterior',              'Juguetes para disfrutar al aire libre', '🌳', 7)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SEED: 12 Productos de ejemplo
-- ============================================================
INSERT INTO curio.products
  (name, slug, description, long_description, price, compare_price, category, age_min, age_max, stock, images, featured, active, material, dimensions)
VALUES
  (
    'Bloques de construcción natural 100 piezas',
    'bloques-construccion-natural-100',
    'Set de 100 bloques de madera maciza natural sin pintar con múltiples formas geométricas.',
    'Set de 100 bloques de madera maciza de haya natural sin pintar. Incluye cubos, cilindros, arcos, triángulos y rectángulos en distintos tamaños. Estimulan la creatividad, el pensamiento espacial y el juego libre.',
    39.95, 49.95, 'construccion', 3, 10, 45,
    ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'],
    TRUE, TRUE, 'Madera de haya FSC', 'Caja 35 × 25 × 10 cm'
  ),
  (
    'Torre de encaje Montessori arcoíris',
    'torre-encaje-montessori-arcoiris',
    'Torre de anillas de colores en madera. Ideal para el desarrollo motor fino y aprendizaje de colores.',
    'Torre de anillas de colores vibrantes en madera de tilo. Con 10 anillas en degradado de colores del arcoíris, estimula el desarrollo motor fino y el reconocimiento de colores.',
    24.95, NULL, 'mobiliario_montessori', 1, 4, 30,
    ARRAY['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&q=80'],
    TRUE, TRUE, 'Madera de tilo + tintes acuosos', 'Altura 28 cm, base 12 × 12 cm'
  ),
  (
    'Puzzle mapa de España 48 piezas',
    'puzzle-mapa-espana-48-piezas',
    'Puzzle de madera con el mapa político de España dividido en comunidades autónomas.',
    'Puzzle de madera con el mapa político de España. Las 17 comunidades autónomas están divididas en 48 piezas de madera gruesa (5 mm).',
    29.95, 34.95, 'puzzles', 5, 12, 20,
    ARRAY['https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800&q=80'],
    FALSE, TRUE, 'Madera contrachapada 5 mm', 'Tablero 40 × 30 cm'
  ),
  (
    'Cocinita de madera con 12 accesorios',
    'cocinita-madera-con-accesorios',
    'Cocinita de juego en madera maciza con horno, fregadero y 12 accesorios incluidos.',
    'Cocinita de juego fabricada en madera maciza de pino y contrachapado de abedul. Incluye horno, dos quemadores, fregadero y 12 accesorios de madera.',
    149.95, 179.95, 'juguetes_educativos', 3, 8, 8,
    ARRAY['https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=800&q=80'],
    TRUE, TRUE, 'Pino macizo + abedul', 'Altura 90 cm, ancho 60 cm, fondo 30 cm'
  ),
  (
    'Abecedario magnético 78 letras',
    'abecedario-magnetico-78-letras',
    'Set de 78 letras magnéticas de madera con mayúsculas, minúsculas y signos.',
    'Set de 78 letras magnéticas en madera de arce. Incluye mayúsculas, minúsculas, números y signos. Compatible con nevera y pizarras magnéticas.',
    19.95, NULL, 'juguetes_educativos', 3, 8, 60,
    ARRAY['https://images.unsplash.com/photo-1612197527762-8cfb254b2e82?w=800&q=80'],
    FALSE, TRUE, 'Madera de arce + imán', 'Letras 5 × 4 cm aprox.'
  ),
  (
    'Serpientes y Escaleras de madera premium',
    'serpientes-escaleras-madera-premium',
    'El clásico juego de serpientes y escaleras en versión de madera premium para 2-4 jugadores.',
    'El clásico juego de serpientes y escaleras en edición de lujo en madera. Tablero 40 × 40 cm con acabado lacado mate. Incluye 4 fichas de madera y 2 dados.',
    34.95, 42.00, 'juegos_mesa', 4, 99, 25,
    ARRAY['https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=800&q=80'],
    FALSE, TRUE, 'Madera de haya lacada', 'Tablero 40 × 40 cm'
  ),
  (
    'Balda nube para habitación infantil',
    'balda-nube-habitacion-infantil',
    'Balda decorativa con forma de nube en madera de pino natural. Incluye tornillería de montaje.',
    'Preciosa balda con forma de nube en madera de pino macizo lacado blanco. Incluye soportes ocultos y tornillería. Capacidad 5 kg.',
    45.00, NULL, 'decoracion_habitacion', 0, 99, 15,
    ARRAY['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80'],
    FALSE, TRUE, 'Pino macizo lacado blanco', '50 × 25 × 10 cm'
  ),
  (
    'Mesa y 2 sillas Montessori set completo',
    'mesa-sillas-montessori-set',
    'Mesa y 2 sillas a escala infantil en madera maciza de abedul. Diseño Montessori para 2-6 años.',
    'Set de mesa y 2 sillas en madera maciza de abedul. Diseño Montessori a escala infantil. Acabado natural con aceite de linaza. Certificado EN 1729.',
    189.95, 220.00, 'mobiliario_montessori', 2, 6, 6,
    ARRAY['https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=800&q=80'],
    TRUE, TRUE, 'Abedul macizo + aceite de linaza', 'Mesa 60×45 cm, silla alt. asiento 30 cm'
  ),
  (
    'Tren de madera extensible 32 piezas',
    'tren-madera-extensible-32-piezas',
    'Set de tren de madera con 32 piezas: locomotora, vagones, vías y señales. Enganches magnéticos.',
    'Completo set de tren de madera con 32 piezas. Enganches magnéticos para fácil montaje. Compatible con principales marcas del mercado.',
    54.95, 64.95, 'construccion', 2, 6, 18,
    ARRAY['https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=800&q=80'],
    TRUE, TRUE, 'Madera de haya + imanes', 'Caja 40 × 30 × 8 cm'
  ),
  (
    'Puzzle animales del mundo 60 piezas',
    'puzzle-animales-mundo-60-piezas',
    'Puzzle temático con 60 piezas de madera gruesa con animales de los 5 continentes.',
    'Puzzle de madera de 60 piezas con 30 animales de los 5 continentes. Piezas gruesas fáciles de manipular. Incluye folleto educativo.',
    22.95, NULL, 'puzzles', 4, 8, 35,
    ARRAY['https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80'],
    FALSE, TRUE, 'Madera contrachapada 4 mm', '60 × 40 cm completado'
  ),
  (
    'Caballito mecedor artesanal',
    'caballito-mecedor-artesanal',
    'Caballito mecedor artesanal en madera maciza de haya. Diseño clásico con crines de cuerda natural.',
    'Caballito mecedor en madera maciza de haya con crines de algodón natural. Barniz al agua seguro. Soporta 50 kg. Certificado EN 71.',
    124.95, 149.95, 'juguetes_educativos', 1, 5, 4,
    ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80'],
    FALSE, TRUE, 'Haya maciza + cuero sintético', 'Long. 70 cm, alt. total 95 cm'
  ),
  (
    'Tipi infantil de madera y algodón',
    'tipi-infantil-madera-algodon',
    'Estructura de tipi en madera de pino con funda de algodón 100% natural. Fácil montaje sin herramientas.',
    'Tipi para habitación infantil en pino macizo con funda de algodón 100% natural. Montaje sin herramientas en 5 minutos. Funda lavable a 30°.',
    89.95, 110.00, 'decoracion_habitacion', 0, 99, 10,
    ARRAY['https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&q=80'],
    TRUE, TRUE, 'Pino macizo + algodón 100%', 'Ø base 120 cm, altura 150 cm'
  )
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- NOTAS POST-INSTALACIÓN
-- ============================================================
-- 1. Bucket "product-images" (público) ya existe en Storage ✅
--
-- 2. Para crear el primer administrador:
--    a) Regístrate en la web con email/contraseña
--    b) Ve a Supabase Dashboard > Table Editor > profiles
--    c) Encuentra tu fila y cambia is_admin a TRUE
--    d) Guarda. Ya puedes acceder a /admin
-- ============================================================
